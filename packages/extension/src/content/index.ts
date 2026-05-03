import type { DomSnapshot, ExtensionMessage } from '@shared/types';

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.kind === 'request-snapshot') {
    // TODO: replace in Prompt B — extract real interactive elements from the DOM.
    const snapshot: DomSnapshot = {
      url: window.location.href,
      title: document.title,
      interactiveElements: [],
      capturedAt: Date.now(),
    };
    const response: ExtensionMessage = { kind: 'snapshot-result', snapshot };
    sendResponse(response);
    return true;
  }
  return false;
});
