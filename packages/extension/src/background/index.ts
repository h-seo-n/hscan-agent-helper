import type {
  ActionPlan,
  ChatMessage,
  DomSnapshot,
  ExtensionMessage,
  PlanContext,
} from '@hscan/shared-types';
import { BACKEND_URL } from '../shared/config';
import {
  applyStepResult,
  buildPlanContext,
  createSession,
  currentStep,
  loadPlan,
  toView,
  type PlanSession,
  type Transition,
} from './session';

const SNAPSHOT_TIMEOUT_MS = 5000;
const PAGE_READY_TIMEOUT_MS = 5000;
const CONTENT_SCRIPT_RETRY_DELAYS_MS = [100, 250, 500];
const ACTIVE_ORIGINS_STORAGE_KEY = 'hscan.activeOrigins';

const sessionsByTab = new Map<number, PlanSession>();
const pageReadyTimers = new Map<number, ReturnType<typeof setTimeout>>();

function cleanupHighlight(tabId: number) {
  sendToContent(tabId, { kind: 'hide-highlight' }).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[bg] setPanelBehavior failed', err));
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.kind === 'user-input') {
    handleUserInput(message.message, message.history)
      .then(sendResponse)
      .catch((err: unknown) => {
        console.error('[bg] handleUserInput failed', err);
        const fallback: ChatMessage = makeAssistantMessage(
          err instanceof Error ? `오류: ${err.message}` : '알 수 없는 오류가 발생했습니다.',
        );
        sendResponse({ kind: 'assistant-reply', message: fallback } satisfies ExtensionMessage);
      });
    return true;
  }

  if (message.kind === 'page-ready') {
    handlePageReady(sender.tab?.id, message.url, message.title);
    return false;
  }

  if (message.kind === 'cancel-session') {
    cancelSession(message.sessionId);
    return false;
  }

  return false;
});

async function handleUserInput(
  userMessage: ChatMessage,
  history: ChatMessage[],
): Promise<ExtensionMessage> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return {
      kind: 'assistant-reply',
      message: makeAssistantMessage('활성 탭을 찾지 못했어요.'),
    };
  }
  const origin = tab.url ? toHttpOrigin(tab.url) : null;
  if (!origin) {
    return {
      kind: 'assistant-reply',
      message: makeAssistantMessage('현재 탭에서는 Hscan Assistant를 사용할 수 없어요.'),
    };
  }
  if (!(await isOriginActive(origin))) {
    return {
      kind: 'assistant-reply',
      message: makeAssistantMessage(`먼저 사이드바 상단에서 ${origin} 활성화를 켜주세요.`),
    };
  }

  const existing = sessionsByTab.get(tab.id);
  const session =
    existing && existing.state !== 'failed' && existing.state !== 'done'
      ? continueSession(existing, userMessage, history)
      : startSession(tab.id, userMessage, history);
  sessionsByTab.set(tab.id, session);
  broadcast(session);

  // Kick the loop. We don't block the user-input response on plan completion;
  // the sidebar is updated via plan-update broadcasts and the final assistant message.
  runLoop(session).catch((err) => {
    console.error('[bg] loop failed', err);
    cleanupHighlight(session.tabId);
    session.state = 'failed';
    session.errorMessage = err instanceof Error ? err.message : 'unknown';
    broadcast(session);
  });

  // Acknowledge immediately with an empty reply; sidebar listens for plan-update for content.
  return {
    kind: 'assistant-reply',
    message: makeAssistantMessage('…'),
  };
}

function startSession(tabId: number, userMessage: ChatMessage, history: ChatMessage[]): PlanSession {
  return createSession({
    id: crypto.randomUUID(),
    tabId,
    originalUserMessage: userMessage.content,
    history: [...history, userMessage],
  });
}

function continueSession(
  session: PlanSession,
  userMessage: ChatMessage,
  _history: ChatMessage[],
): PlanSession {
  session.history = [...session.history, userMessage];
  session.state = 'idle';
  session.executedSteps = [];
  session.currentPlan = null;
  session.currentStepIndex = 0;
  session.retries = 0;
  session.pendingPageReady = false;
  session.originalUserMessage = userMessage.content;
  return session;
}

async function runLoop(session: PlanSession): Promise<void> {
  // Loop until terminal state.
  // Each iteration corresponds to one external interaction (snapshot, plan, step exec).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (session.state === 'idle' || session.state === 'awaiting-page-ready') {
      // For idle we drive forward. awaiting-page-ready is driven by page-ready handler;
      // when it resolves it transitions to fetching-snapshot and re-enters this loop.
      if (session.state === 'awaiting-page-ready') return;
      session.state = 'fetching-snapshot';
      broadcast(session);
    }

    if (session.state === 'fetching-snapshot') {
      const snapshot = await requestSnapshot(session.tabId);
      if (!snapshot) {
        cleanupHighlight(session.tabId);
        session.state = 'failed';
        session.errorMessage = '스냅샷을 가져오지 못했어요.';
        broadcast(session);
        await postAssistantMessage(session.errorMessage);
        return;
      }
      session.lastSnapshot = snapshot;
      session.state = 'calling-plan';
      broadcast(session);
    }

    if (session.state === 'calling-plan') {
      if (!session.lastSnapshot) {
        cleanupHighlight(session.tabId);
        session.state = 'failed';
        session.errorMessage = '내부 오류: 스냅샷 없음.';
        broadcast(session);
        return;
      }
      const planResult = await callPlan(buildPlanContext(session, session.lastSnapshot));
      if (!planResult) {
        cleanupHighlight(session.tabId);
        session.state = 'failed';
        session.errorMessage = '플랜 호출에 실패했어요.';
        broadcast(session);
        await postAssistantMessage(session.errorMessage);
        return;
      }
      const transition = loadPlan(session, planResult);
      // Always relay the assistant message coming with the plan.
      if (planResult.assistantMessage) {
        await postAssistantMessage(planResult.assistantMessage);
      }
      broadcast(session);
      if (transition.kind === 'finish-done') return;
    }

    if (session.state === 'executing-step') {
      const step = currentStep(session);
      if (!step) {
        cleanupHighlight(session.tabId)
        session.state = 'done';
        broadcast(session);
        return;
      }
      const result = await sendToContent(session.tabId, { kind: 'execute-step', step });
      if (!result || result.kind !== 'step-result') {
        cleanupHighlight(session.tabId);
        session.state = 'failed';
        session.errorMessage = '실행 결과를 받지 못했어요.';
        broadcast(session);
        return;
      }
      const url = (await getTabUrl(session.tabId)) ?? '';
      const transition = applyStepResult(session, result.stepId, result.status, url, result.reason);
      broadcast(session);
      if (transition.kind === 'finish-done') return;
      if (transition.kind === 'finish-failed') {
        cleanupHighlight(session.tabId);
        await postAssistantMessage(`작업 실패: ${transition.reason}`);
        return;
      }
      if (transition.kind === 'await-page-ready') {
        // Drain a buffered page-ready that arrived before the transition.
        if (session.pendingPageReady || isExpectedNavigationComplete(step, url)) {
          session.pendingPageReady = false;
          await delay(100);
          session.state = 'fetching-snapshot';
          broadcast(session);
          continue;
        }
        armPageReadyTimeout(session);
        return;
      }
      // execute-next-step or replan: continue the loop
    }

    if (session.state === 'done' || session.state === 'failed') return;
  }
}

function handlePageReady(tabId: number | undefined, _url: string, _title: string) {
  if (!tabId) return;
  const session = sessionsByTab.get(tabId);
  if (!session) return;

  // page-ready can race ahead of the navigate step's step-result. 
  // If we're not yet in awaiting-page-ready, buffer the signal so runLoop consumes it as soon as the navigate transition completes.
  if (session.state !== 'awaiting-page-ready') {
    session.pendingPageReady = true;
    return;
  }

  const timer = pageReadyTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    pageReadyTimers.delete(tabId);
  }

  session.pendingPageReady = false;
  session.state = 'fetching-snapshot';
  broadcast(session);
  runLoop(session).catch((err) => {
    console.error('[bg] post page-ready loop failed', err);
    cleanupHighlight(session.tabId);
    session.state = 'failed';
    session.errorMessage = err instanceof Error ? err.message : 'unknown';
    broadcast(session);
  });
}

function armPageReadyTimeout(session: PlanSession) {
  const tabId = session.tabId;
  const existing = pageReadyTimers.get(tabId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    pageReadyTimers.delete(tabId);
    if (session.state !== 'awaiting-page-ready') return;
    cleanupHighlight(session.tabId);
    session.state = 'failed';
    session.errorMessage = '페이지 이동이 시간 안에 완료되지 않았어요.';
    broadcast(session);
    void postAssistantMessage(session.errorMessage);
  }, PAGE_READY_TIMEOUT_MS);
  pageReadyTimers.set(tabId, t);
}

function cancelSession(sessionId: string) {
  for (const [tabId, session] of sessionsByTab.entries()) {
    if (session.id !== sessionId) continue;
    cleanupHighlight(session.tabId);
    session.state = 'failed';
    session.errorMessage = '사용자가 취소했어요.';
    const t = pageReadyTimers.get(tabId);
    if (t) {
      clearTimeout(t);
      pageReadyTimers.delete(tabId);
    }
    broadcast(session);
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getTabUrl(tabId: number): Promise<string | undefined> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url;
  } catch {
    return undefined;
  }
}

async function isOriginActive(origin: string): Promise<boolean> {
  const values = await chrome.storage.local.get(ACTIVE_ORIGINS_STORAGE_KEY);
  const origins = normalizeOrigins(values[ACTIVE_ORIGINS_STORAGE_KEY]);
  return origins.includes(origin);
}

function normalizeOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((origin): origin is string => {
        if (typeof origin !== 'string') return false;
        return toHttpOrigin(origin) === origin;
      }),
    ),
  );
}

function toHttpOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

async function requestSnapshot(tabId: number): Promise<DomSnapshot | null> {
  const reply = await sendToContent(tabId, { kind: 'request-snapshot' }, SNAPSHOT_TIMEOUT_MS);
  if (!reply || reply.kind !== 'snapshot-result') return null;
  return reply.snapshot;
}

function sendToContent(
  tabId: number,
  message: ExtensionMessage,
  timeoutMs = SNAPSHOT_TIMEOUT_MS,
): Promise<ExtensionMessage | null> {
  return sendToContentWithRecovery(tabId, message, timeoutMs);
}

interface ContentSendResult {
  reply: ExtensionMessage | null;
  errorMessage?: string;
}

async function sendToContentWithRecovery(
  tabId: number,
  message: ExtensionMessage,
  timeoutMs: number,
): Promise<ExtensionMessage | null> {
  const first = await sendToContentOnce(tabId, message, timeoutMs);
  if (first.reply) return first.reply;
  if (!isMissingContentScript(first.errorMessage)) return null;

  const injected = await injectContentScripts(tabId);
  if (!injected) return null;

  for (const delayMs of CONTENT_SCRIPT_RETRY_DELAYS_MS) {
    await delay(delayMs);
    const retry = await sendToContentOnce(tabId, message, timeoutMs);
    if (retry.reply) return retry.reply;
    if (!isMissingContentScript(retry.errorMessage)) return null;
  }

  return null;
}

function sendToContentOnce(
  tabId: number,
  message: ExtensionMessage,
  timeoutMs: number,
): Promise<ContentSendResult> {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ reply: null });
    }, timeoutMs);
    chrome.tabs.sendMessage(tabId, message, (reply: ExtensionMessage | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('[bg] sendMessage error', message.kind, tabId, err.message);
        resolve({ reply: null, errorMessage: err.message });
        return;
      }
      resolve({ reply: reply ?? null });
    });
  });
}

function isMissingContentScript(errorMessage?: string): boolean {
  return errorMessage?.includes('Receiving end does not exist') ?? false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExpectedNavigationComplete(step: NonNullable<ReturnType<typeof currentStep>>, url: string): boolean {
  if (step.type !== 'navigate') return false;
  if (!step.expectedUrlPattern) return false;
  return url.includes(step.expectedUrlPattern);
}

async function injectContentScripts(tabId: number): Promise<boolean> {
  const files =
    chrome.runtime
      .getManifest()
      .content_scripts?.flatMap((contentScript) => contentScript.js ?? []) ?? [];
  if (files.length === 0) return false;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files,
    });
    console.info('[bg] injected missing content script', tabId);
    return true;
  } catch (err) {
    console.warn('[bg] content script injection failed', tabId, err);
    return false;
  }
}

async function callPlan(ctx: PlanContext): Promise<ActionPlan | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx),
    });
    if (!res.ok) {
      console.error('[bg] /plan responded', res.status);
      return null;
    }
    const data = (await res.json()) as { plan: ActionPlan };
    return data.plan;
  } catch (err) {
    console.error('[bg] /plan fetch failed', err);
    return null;
  }
}

function broadcast(session: PlanSession) {
  const msg: ExtensionMessage = {
    kind: 'plan-update',
    sessionId: session.id,
    session: toView(session),
  };
  // Ignore "no receivers" errors when sidebar is closed.
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

async function postAssistantMessage(content: string) {
  const reply: ExtensionMessage = {
    kind: 'assistant-reply',
    message: makeAssistantMessage(content),
  };
  chrome.runtime.sendMessage(reply).catch(() => undefined);
}

function makeAssistantMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    createdAt: Date.now(),
  };
}

// Expose transition helper type for tests via re-export consumed in vitest.
export type { Transition };
