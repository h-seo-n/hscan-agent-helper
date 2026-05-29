import { useEffect, useState } from 'react';
import type { ChatMessage, ExtensionMessage, PlanSessionView } from '@hscan/shared-types';
import { sendRuntimeMessage } from '../shared/sendMessage';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ProgressPanel } from './components/ProgressPanel';

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [session, setSession] = useState<PlanSessionView | null>(null);

  useEffect(() => {
    const listener = (msg: ExtensionMessage) => {
      if (msg.kind === 'plan-update') {
        setSession(msg.session);
        const terminal = msg.session.state === 'done' || msg.session.state === 'failed';
        if (terminal) setPending(false);
      } else if (msg.kind === 'assistant-reply') {
        // Background may push assistant messages outside the user-input response cycle.
        if (msg.message.content && msg.message.content !== '…') {
          setMessages((prev) => [...prev, msg.message]);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSend = async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setPending(true);

    try {
      // Background acknowledges immediately; final assistant text arrives via plan flow.
      await sendRuntimeMessage<ExtensionMessage>({
        kind: 'user-input',
        message: userMsg,
        history: messages,
      });
    } catch (err) {
      const fallback: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          err instanceof Error ? `오류: ${err.message}` : '메시지를 전송하지 못했습니다.',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, fallback]);
      setPending(false);
    }
  };

  const handleCancel = (sessionId: string) => {
    chrome.runtime
      .sendMessage({ kind: 'cancel-session', sessionId } satisfies ExtensionMessage)
      .catch(() => undefined);
  };

  return (
    <div className="app">
      <header className="app__header">Hscan</header>
      <ProgressPanel session={session} onCancel={handleCancel} />
      <MessageList messages={messages} pending={pending} />
      <MessageInput disabled={pending && session?.state !== 'done'} onSend={handleSend} />
    </div>
  );
}
