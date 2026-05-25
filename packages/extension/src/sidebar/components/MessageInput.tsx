import { useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function MessageInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState('');
  const isComposingRef = useRef(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="input">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          setValue(e.currentTarget.value);
        }}
        placeholder="메시지를 입력하세요 (Shift+Enter로 줄바꿈)"
        disabled={disabled}
      />
      <button type="button" onClick={submit} disabled={disabled || !value.trim()}>
        전송
      </button>
    </div>
  );
}
