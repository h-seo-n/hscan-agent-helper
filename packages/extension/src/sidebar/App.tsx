import { useState } from 'react';
import type { ChatMessage, ExtensionMessage } from '@shared/types';
import { sendRuntimeMessage } from '../shared/sendMessage';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  const handleSend = async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    const history = messages;
    setMessages([...history, userMsg]);
    setPending(true);

    try {
      const reply = await sendRuntimeMessage<ExtensionMessage>({
        kind: 'user-input',
        message: userMsg,
        history,
      });

      if (reply.kind === 'assistant-reply') {
        setMessages((prev) => [...prev, reply.message]);
      }
    } catch (err) {
      const fallback: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          err instanceof Error
            ? `오류: ${err.message}`
            : '메시지를 전송하지 못했습니다.',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="app">
      <header className="app__header">Hscan</header>
      <MessageList messages={messages} pending={pending} />
      <MessageInput disabled={pending} onSend={handleSend} />
    </div>
  );
}
