import type { ChatMessage, ExtensionMessage } from '@shared/types';
import { BACKEND_URL } from '../shared/config';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[bg] setPanelBehavior failed', err));
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.kind === 'user-input') {
    handleUserInput(message.message, message.history)
      .then((reply) => {
        const response: ExtensionMessage = { kind: 'assistant-reply', message: reply };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        console.error('[bg] handleUserInput failed', err);
        const fallback: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            err instanceof Error
              ? `오류: ${err.message}`
              : '알 수 없는 오류가 발생했습니다.',
          createdAt: Date.now(),
        };
        const response: ExtensionMessage = { kind: 'assistant-reply', message: fallback };
        sendResponse(response);
      });
    return true;
  }
  return false;
});

async function handleUserInput(
  message: ChatMessage,
  history: ChatMessage[],
): Promise<ChatMessage> {
  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [...history, message] }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Backend responded ${res.status}`);
  }

  const data = (await res.json()) as { assistantMessage: string };
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: data.assistantMessage,
    createdAt: Date.now(),
  };
}
