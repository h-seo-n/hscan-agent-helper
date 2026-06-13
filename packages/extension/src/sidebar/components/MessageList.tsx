import type { ChatMessage } from '@hscan/shared-types';
import { SuggestedPrompts } from './SuggestedPrompts';

interface Props {
  messages: ChatMessage[];
  pending: boolean;
  examples: string[];
  onSelectExample: (text: string) => void;
}

export function MessageList({ messages, pending, examples, onSelectExample }: Props) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="empty">
        <SuggestedPrompts examples={examples} onSelect={onSelectExample} />
      </div>
    );
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
