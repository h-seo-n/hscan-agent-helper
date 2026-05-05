import type { ActionStep, ExtensionMessage } from '@hscan/shared-types';
import { extractSnapshot } from './extractor';
import { showHighlight, hideHighlight } from './highlight';

let lastUrl = location.href;

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
      announceReady();
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

watchSpaNavigation();
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  announceReady();
} else {
  document.addEventListener('DOMContentLoaded', announceReady, { once: true });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.kind === 'request-snapshot') {
    try {
      const snapshot = extractSnapshot();
      const reply: ExtensionMessage = { kind: 'snapshot-result', snapshot };
      sendResponse(reply);
    } catch (err) {
      console.error('[content] snapshot failed', err);
      sendResponse(null);
    }
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

  return false;
});

interface StepOutcome {
  status: 'done' | 'waiting-user' | 'failed' | 'navigated';
  reason?: string;
}

async function executeStep(step: ActionStep): Promise<StepOutcome> {
  switch (step.type) {
    case 'explain':
      hideHighlight();
      return { status: 'done' };

    case 'highlight': {
      const el = findTarget(step.targetId);
      if (!el) return { status: 'failed', reason: `target ${step.targetId} not found` };
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showHighlight(el, step.description);
      return { status: 'done' };
    }

    case 'click': {
      const el = findTarget(step.targetId);
      if (!el) return { status: 'failed', reason: `target ${step.targetId} not found` };
      (el as HTMLElement).click();
      return { status: 'done' };
    }

    case 'scroll': {
      const el = findTarget(step.targetId);
      if (!el) return { status: 'failed', reason: `target ${step.targetId} not found` };
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

function findTarget(targetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-aiwa-id="${cssEscape(targetId)}"]`);
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
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
    const onChange = () => {
      el.removeEventListener('input', onChange);
      hideHighlight();
      resolve({ status: 'done' });
    };
    el.addEventListener('input', onChange);
    setTimeout(() => resolve({ status: 'waiting-user' }), 200);
  });
}

function executeNavigate(step: ActionStep & { type: 'navigate' }): Promise<StepOutcome> {
  if (step.targetId) {
    const el = findTarget(step.targetId);
    if (!el) {
      return Promise.resolve({ status: 'failed', reason: `target ${step.targetId} not found` });
    }
    queueMicrotask(() => el.click());
    return Promise.resolve({ status: 'navigated' });
  }
  if (step.url) {
    try {
      const target = new URL(step.url, location.href);
      if (target.origin !== location.origin) {
        return Promise.resolve({
          status: 'failed',
          reason: `cross-origin navigation not allowed: ${target.origin}`,
        });
      }
      queueMicrotask(() => location.assign(target.href));
      return Promise.resolve({ status: 'navigated' });
    } catch (err) {
      return Promise.resolve({
        status: 'failed',
        reason: err instanceof Error ? err.message : 'invalid url',
      });
    }
  }
  return Promise.resolve({ status: 'failed', reason: 'navigate step needs targetId or url' });
}
