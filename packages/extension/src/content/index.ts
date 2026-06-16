import type { ActionStep, ExtensionMessage } from '@hscan/shared-types';
import { extractSnapshot } from './extractor';
import { showHighlight, hideHighlight } from './highlight';

const CLICK_FEEDBACK_MS = 500;
const USER_ACTIVITY_DEBOUNCE_MS = 250;
const SNAPSHOT_DOM_IDLE_MS = 250;
const SNAPSHOT_STABILITY_TIMEOUT_MS = 2000;
const PAGE_CHANGE_DEBOUNCE_MS = 450;
const PAGE_SIGNATURE_MAX_TEXT = 5000;
const PAGE_SIGNATURE_MAX_CONTROLS = 80;
const USER_INITIATED_PAGE_CHANGE_WINDOW_MS = 8000;
const OVERLAY_HOST_ID = 'aiwa-overlay-host';
const PAGE_CHANGE_OBSERVER_KEY = '__hscanPageChangeObserver';
const SIGNATURE_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="status"]',
  '[role="alert"]',
  '[data-aiwa-status]',
  '[contenteditable="true"]',
].join(',');

let lastUrl = location.href;
let userActivityTimer: ReturnType<typeof setTimeout> | null = null;
let pageChangeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPageSignature = '';
let lastTrustedUserActivityAt = 0;

function announceReady() {
  const msg: ExtensionMessage = {
    kind: 'page-ready',
    url: location.href,
    title: document.title,
  };
  chrome.runtime.sendMessage(msg).catch(() => {
    // background may be cold, ignore.
  });
}

function watchSpaNavigation() {
  const fire = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      hideHighlight();
      afterNextPaint(announceReady);
    }
  };
  const wrap = (fn: typeof history.pushState) =>
    function patched(this: History, ...args: Parameters<typeof history.pushState>) {
      const r = fn.apply(this, args);
      queueMicrotask(fire);
      return r;
    };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  window.addEventListener('popstate', fire);
}

function announceUserActivity() {
  const msg: ExtensionMessage = {
    kind: 'user-activity',
    url: location.href,
    title: document.title,
  };
  chrome.runtime.sendMessage(msg).catch(() => {
    // background may be cold, ignore.
  });
}

function watchUserActivity() {
  const schedule = (event: Event) => {
    if (!event.isTrusted) return;
    lastTrustedUserActivityAt = Date.now();
    if (userActivityTimer) clearTimeout(userActivityTimer);
    userActivityTimer = setTimeout(() => {
      userActivityTimer = null;
      afterNextPaint(announceUserActivity);
    }, USER_ACTIVITY_DEBOUNCE_MS);
  };

  document.addEventListener('click', schedule, true);
  document.addEventListener('input', schedule, true);
  document.addEventListener('change', schedule, true);
}

function announcePageChanged() {
  const msg: ExtensionMessage = {
    kind: 'page-changed',
    url: location.href,
    title: document.title,
    userInitiated: Date.now() - lastTrustedUserActivityAt <= USER_INITIATED_PAGE_CHANGE_WINDOW_MS,
  };
  chrome.runtime.sendMessage(msg).catch(() => {
    // background may be cold, ignore.
  });
}

function watchPageChanges() {
  if (typeof MutationObserver === 'undefined') return;
  lastPageSignature = buildPageSignature();
  const win = window as Window & { [PAGE_CHANGE_OBSERVER_KEY]?: MutationObserver };
  win[PAGE_CHANGE_OBSERVER_KEY]?.disconnect();

  const schedule = (mutations: MutationRecord[]) => {
    if (mutations.every(isIgnoredMutation)) return;
    if (pageChangeTimer) clearTimeout(pageChangeTimer);
    pageChangeTimer = setTimeout(() => {
      pageChangeTimer = null;
      void publishPageChangedIfSignatureChanged();
    }, PAGE_CHANGE_DEBOUNCE_MS);
  };

  const observer = new MutationObserver(schedule);
  win[PAGE_CHANGE_OBSERVER_KEY] = observer;
  observer.observe(document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
}

async function publishPageChangedIfSignatureChanged() {
  await waitForDomSettled();
  const signature = buildPageSignature();
  if (signature === lastPageSignature) return;
  lastPageSignature = signature;
  announcePageChanged();
}

watchSpaNavigation();
watchUserActivity();
watchPageChanges();
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  announceReady();
} else {
  document.addEventListener('DOMContentLoaded', announceReady, { once: true });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.kind === 'request-snapshot') {
    waitForDomSettled()
      .then(() => {
        const snapshot = extractSnapshot();
        lastPageSignature = buildPageSignature();
        console.info('[content] snapshot ready', {
          url: snapshot.url,
          elementCount: Object.values(snapshot.regions).reduce(
            (count, items) => count + (items?.length ?? 0),
            0,
          ),
        });
        const reply: ExtensionMessage = { kind: 'snapshot-result', snapshot };
        sendResponse(reply);
      })
      .catch((err) => {
        console.error('[content] snapshot failed', err);
        sendResponse(null);
      });
    return true;
  }

  if (message.kind === 'execute-step') {
    executeStep(message.step)
      .then(({ status, reason }) => {
        const reply: ExtensionMessage = {
          kind: 'step-result',
          stepId: message.step.id,
          status,
          ...(reason ? { reason } : {}),
        };
        sendResponse(reply);
      })
      .catch((err: unknown) => {
        const reply: ExtensionMessage = {
          kind: 'step-result',
          stepId: message.step.id,
          status: 'failed',
          reason: err instanceof Error ? err.message : 'unknown error',
        };
        sendResponse(reply);
      });
    return true;
  }
  if (message.kind === 'hide-highlight') {
    hideHighlight();
    return false;
  }
  return false;
});

interface StepOutcome {
  status: 'done' | 'waiting-user' | 'failed' | 'navigated';
  reason?: string;
}

export async function executeStep(step: ActionStep): Promise<StepOutcome> {
  switch (step.type) {
    case 'explain':
      return { status: 'done' };

    case 'highlight': {
      const el = findTarget(step.targetId);
      console.info('[content] highlight target', step.targetId, el);
      if (!el) return { status: 'failed', reason: `target ${step.targetId} not found` };
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showHighlight(el, step.description);
      return { status: 'done' };
    }

    case 'click': {
      const el = findTarget(step.targetId);
      if (!el) return { status: 'failed', reason: `target ${step.targetId} not found` };
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showHighlight(el, step.description);
      await delay(CLICK_FEEDBACK_MS);
      (el as HTMLElement).click();
      return { status: 'done' };
    }

    case 'scroll': {
      const el = findTarget(step.targetId);
      if (!el) return { status: 'failed', reason: `target ${step.targetId} not found` };
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showHighlight(el, step.description);
      return { status: 'done' };
    }

    case 'input':
      return executeInput(step);

    case 'navigate':
      return executeNavigate(step);

    default:
      return { status: 'failed', reason: 'unknown step type' };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function afterNextPaint(callback: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => afterNextPaint(resolve));
}

export async function waitForDomSettled(
  idleMs = SNAPSHOT_DOM_IDLE_MS,
  timeoutMs = SNAPSHOT_STABILITY_TIMEOUT_MS,
): Promise<void> {
  await waitForNextPaint();
  await new Promise<void>((resolve) => {
    const root = document.documentElement;
    if (!root || typeof MutationObserver === 'undefined') {
      setTimeout(resolve, idleMs);
      return;
    }

    let done = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (done) return;
      done = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      observer.disconnect();
      afterNextPaint(resolve);
    };

    const armIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, idleMs);
    };

    const observer = new MutationObserver(armIdleTimer);
    observer.observe(root, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    armIdleTimer();
    timeoutTimer = setTimeout(finish, timeoutMs);
  });
}

function findTarget(targetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-aiwa-id="${cssEscape(targetId)}"]`);
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}

export function buildPageSignature(): string {
  const bodyText = normalizeSignatureText(
    (document.body as HTMLElement).innerText || document.body.textContent || '',
  ).slice(0, PAGE_SIGNATURE_MAX_TEXT);

  const controls = Array.from(
    document.querySelectorAll<HTMLElement>(SIGNATURE_CONTROL_SELECTOR),
  )
    .filter((el) => !isExtensionOwned(el) && isSignatureCandidate(el))
    .slice(0, PAGE_SIGNATURE_MAX_CONTROLS)
    .map((el) => {
      const input = el instanceof HTMLInputElement ? el : null;
      const textarea = el instanceof HTMLTextAreaElement ? el : null;
      const select = el instanceof HTMLSelectElement ? el : null;
      return [
        el.tagName.toLowerCase(),
        el.getAttribute('role') ?? '',
        normalizeSignatureText(
          el.getAttribute('aria-label') ??
            el.textContent ??
            el.getAttribute('placeholder') ??
            el.getAttribute('title') ??
            '',
        ).slice(0, 120),
        el.getAttribute('href') ?? '',
        el.getAttribute('data-aiwa-status') ?? '',
        isElementDisabled(el) ? 'disabled' : 'enabled',
        input && ['checkbox', 'radio'].includes(input.type) ? String(input.checked) : '',
        input && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(input.type)
          ? String(input.value.trim().length > 0)
          : '',
        textarea ? String(textarea.value.trim().length > 0) : '',
        select ? select.value : '',
      ].join('|');
    });

  return JSON.stringify({
    url: location.href,
    title: document.title,
    text: bodyText,
    controls,
  });
}

function isSignatureCandidate(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).type === 'password') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function isElementDisabled(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if ('disabled' in el) return Boolean((el as HTMLButtonElement).disabled);
  return false;
}

function isIgnoredMutation(mutation: MutationRecord): boolean {
  if (isExtensionOwned(mutation.target)) return true;
  if (
    mutation.type === 'attributes' &&
    (mutation.attributeName === 'data-aiwa-id' ||
      mutation.attributeName === 'data-aiwa-suggested')
  ) {
    return true;
  }
  if (mutation.type === 'childList') {
    const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return changedNodes.length > 0 && changedNodes.every(isExtensionOwned);
  }
  return false;
}

function isExtensionOwned(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const el = node as Element;
  return Boolean(el.id === OVERLAY_HOST_ID || el.closest?.(`#${OVERLAY_HOST_ID}`));
}

function normalizeSignatureText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function executeInput(step: ActionStep & { type: 'input' }): Promise<StepOutcome> {
  const el = findTarget(step.targetId) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return Promise.resolve({ status: 'failed', reason: `target ${step.targetId} not found` });
  el.focus();
  showHighlight(el, step.description);
  if (step.value) {
    // Suggest value as placeholder hint, but do NOT autofill — let the user type.
    el.setAttribute('data-aiwa-suggested', step.value);
  }
  return new Promise<StepOutcome>((resolve) => {

    let settled = false;

    const onChange = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener('input', onChange);
      //hideHighlight();
      resolve({ status: 'done' });
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      el.removeEventListener('input', onChange);
      resolve({ status: 'waiting-user' });
    }, 30_000);
    el.addEventListener('input', onChange);
    
    el.addEventListener('input', () => clearTimeout(timer), { once: true });
    //setTimeout(() => resolve({ status: 'waiting-user' }), 200);
  });
}

async function executeNavigate(step: ActionStep & { type: 'navigate' }): Promise<StepOutcome> {
  if (step.targetId) {
    const el = findTarget(step.targetId);
    if (!el) {
      return { status: 'failed', reason: `target ${step.targetId} not found` };
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showHighlight(el, step.description);
    await delay(CLICK_FEEDBACK_MS);
    el.click();
    await waitForNextPaint();
    return { status: 'navigated' };
  }
  if (step.url) {
    try {
      const target = new URL(step.url, location.href);
      if (target.origin !== location.origin) {
        return {
          status: 'failed',
          reason: `cross-origin navigation not allowed: ${target.origin}`,
        };
      }
      queueMicrotask(() => location.assign(target.href));
      return { status: 'navigated' };
    } catch (err) {
      return {
        status: 'failed',
        reason: err instanceof Error ? err.message : 'invalid url',
      };
    }
  }
  return { status: 'failed', reason: 'navigate step needs targetId or url' };
}
