import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { ChatMessage, ToolCall } from '@datamaster/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { MessageBubble } from './MessageBubble';
import { ToolProgressBar } from './ToolProgressBar';
import type { StreamSegment } from '../../../stores/chatStore';

function processWikilinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    return `[${label ?? target}](#/wiki/${target})`;
  });
}

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  activeTools: ToolCall[];
  toolHistory: ToolCall[];
  iteration: number;
  streamingSegments: StreamSegment[];
  onSuggest?: (message: string) => void;
}

export function MessageList({ messages, streamingText, isStreaming, activeTools, toolHistory, iteration, streamingSegments, onSuggest }: MessageListProps) {
  const navigate = useNavigate();
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 80;
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingSegments, activeTools]);

  useEffect(() => {
    userScrolledUpRef.current = false;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const hasTools = activeTools.length > 0 || toolHistory.length > 0;
  const showThinking = isStreaming && !streamingText && !hasTools && streamingSegments.length <= 1;

  const isLastTextSegmentEmpty = useMemo(() => {
    const last = streamingSegments[streamingSegments.length - 1];
    return !last || (last.type === 'text' && !last.content.trim());
  }, [streamingSegments]);

  const hasRunningTools = activeTools.some((t) => t.status === 'running' || t.status === 'generating');
  const allToolsDone = activeTools.length > 0 && !hasRunningTools;
  const showIterationThinking = isStreaming && allToolsDone && isLastTextSegmentEmpty;

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto scroll-smooth">
      {messages.length === 0 && !isStreaming && <WelcomeScreen onSuggest={onSuggest} />}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Segmented streaming: text and tools interleaved chronologically */}
      {isStreaming && streamingSegments.map((seg, idx) => {
        if (seg.type === 'text' && seg.content.trim()) {
          const isLast = idx === streamingSegments.length - 1;
          return (
            <StreamingTextBubble
              key={`seg-text-${idx}`}
              text={seg.content}
              showCursor={isLast && !hasRunningTools}
              navigate={navigate}
            />
          );
        }
        if (seg.type === 'tools' && seg.tools.length > 0) {
          const isCurrentToolGroup = idx === streamingSegments.length - 1 || idx === streamingSegments.length - 2;
          const allDone = seg.tools.every((t) => t.status === 'done' || t.status === 'error');
          return (
            <ToolProgressBar
              key={`seg-tools-${idx}`}
              tools={seg.tools}
              collapsed={allDone && !isCurrentToolGroup}
            />
          );
        }
        return null;
      })}

      {/* Thinking indicator — only when no text and no tools yet */}
      {showThinking && <ThinkingIndicator />}

      {/* Thinking between iterations — tools done, waiting for next AI response */}
      {showIterationThinking && <IterationThinkingIndicator iteration={iteration} />}

      <div ref={endRef} className="h-4" />
    </div>
  );
}

function StreamingTextBubble({ text, showCursor, navigate }: { text: string; showCursor: boolean; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="flex gap-3 px-4 md:px-6 py-3 animate-in fade-in duration-200">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[10px] font-bold text-white">
        D
      </div>
      <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-bl-md bg-[var(--color-surface-2)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--color-text-primary)]">
        <div className="chat-markdown break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith('#/wiki/')) {
                  const target = href.replace('#/wiki/', '');
                  return (
                    <button
                      onClick={() => navigate(`/wiki/${target}`)}
                      className="text-[var(--color-accent)] hover:underline font-medium inline"
                    >
                      {children}
                    </button>
                  );
                }
                return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{children}</a>;
              },
              img: ({ src, alt }) => (
                <span className="inline-block my-2">
                  <img src={src} alt={alt ?? ''} loading="lazy" className="max-w-full rounded-lg border border-[var(--color-border)] shadow-sm" style={{ maxHeight: '240px' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  {alt && <span className="block text-xs text-[var(--color-text-muted)] mt-1">{alt}</span>}
                </span>
              ),
            }}
          >
            {processWikilinks(text)}
          </ReactMarkdown>
        </div>
        {showCursor && (
          <span className="inline-block h-4 w-0.5 animate-pulse bg-[var(--color-accent)] ml-0.5" />
        )}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex gap-3 px-4 md:px-6 py-3 animate-in fade-in duration-300">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[10px] font-bold text-white">
        D
      </div>
      <div className="rounded-2xl rounded-bl-md bg-[var(--color-surface-2)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.2s' }} />
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.2s' }} />
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.2s' }} />
          </div>
          <span className="text-xs text-[var(--color-text-muted)] ml-1">생각하는 중...</span>
        </div>
      </div>
    </div>
  );
}

function IterationThinkingIndicator({ iteration }: { iteration: number }) {
  return (
    <div className="flex gap-3 px-4 md:px-6 py-2 animate-in fade-in duration-200">
      <div className="w-7 flex-shrink-0" />
      <div className="flex items-center gap-2 rounded-full bg-[var(--color-surface-2)] px-3 py-1.5">
        <svg className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-80" d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          결과를 분석하고 다음 작업을 준비하는 중...
          {iteration > 0 && <span className="text-[10px] ml-1 tabular-nums">(단계 {iteration + 1})</span>}
        </span>
      </div>
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
