import type { ChatMessage } from '@shared/types';

interface Props {
  messages: ChatMessage[];
  pending: boolean;
}

export function MessageList({ messages, pending }: Props) {
  if (messages.length === 0 && !pending) {
    return <div className="empty">무엇이든 물어보세요.</div>;
  }

  return (
    <div className="messages">
      {messages.map((m) => (
        <div key={m.id} className={`message message--${m.role}`}>
          {m.content}
        </div>
      ))}
      {pending && <div className="message message--assistant message--pending">생각 중…</div>}
    </div>
  );
}
