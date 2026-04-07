import { useState, useCallback, useRef } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  onCancel?: () => void;
}

export function ChatInput({ onSend, disabled, onCancel }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex items-end gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-0)] px-3 py-2 focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_0_3px_var(--color-accent-subtle)] transition-all">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="메시지를 입력하세요..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-[16px] md:text-[14px] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none leading-snug"
        style={{ maxHeight: 120 }}
      />
      {onCancel ? (
        <button
          onClick={onCancel}
          className="flex h-9 w-9 md:h-8 md:w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-red-500/80 text-white transition-all hover:bg-red-500 active:scale-95"
          title="응답 중지"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="flex h-9 w-9 md:h-8 md:w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white transition-all hover:bg-[var(--color-accent-hover)] disabled:opacity-30 disabled:hover:bg-[var(--color-accent)] active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
