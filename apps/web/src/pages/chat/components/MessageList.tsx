import { useEffect, useRef } from 'react';
import type { ChatMessage, ToolCall } from '@datamaster/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageBubble } from './MessageBubble';
import { ToolProgressBar } from './ToolProgressBar';

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  activeTools: ToolCall[];
  onSuggest?: (message: string) => void;
}

export function MessageList({ messages, streamingText, isStreaming, activeTools, onSuggest }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 && !isStreaming && <WelcomeScreen onSuggest={onSuggest} />}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && activeTools.length > 0 && <ToolProgressBar tools={activeTools} />}

      {isStreaming && streamingText && (
        <div className="flex gap-3 px-4 md:px-6 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[10px] font-bold text-white">
            D
          </div>
          <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-bl-md bg-[var(--color-surface-2)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--color-text-primary)]">
            <div className="chat-markdown break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
            </div>
            <span className="inline-block h-4 w-0.5 animate-pulse bg-[var(--color-accent)] ml-0.5" />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function WelcomeScreen({ onSuggest }: { onSuggest?: (message: string) => void }) {
  const suggestions = ['테이블 목록 보여줘', '캐릭터 데이터 분석해줘', '최근 데이터 변경 이력'];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4 pointer-events-none">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-subtle)]">
        <svg className="w-7 h-7 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">DataMaster AI</h2>
        <p className="mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
          게임 데이터에 대해 질문하세요. SQL 쿼리 실행, 스키마 분석, Git 이력 조회 등을 도와드립니다.
        </p>
      </div>
      <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
        {suggestions.map((q) => (
          <button
            key={q}
            onClick={() => onSuggest?.(q)}
            className="rounded-full border border-[var(--color-border)] px-3.5 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
