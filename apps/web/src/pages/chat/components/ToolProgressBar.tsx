import { useState, useEffect, useRef } from 'react';
import type { ToolCall } from '@datamaster/shared';
import { getToolLabel } from '@datamaster/shared';

interface ToolProgressBarProps {
  tools: ToolCall[];
  toolHistory: ToolCall[];
  iteration: number;
}

function ElapsedTimer({ startAt }: { startAt?: number }) {
  const startRef = useRef(startAt ?? Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
    return () => clearInterval(id);
  }, []);

  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) return <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">{secs}s</span>;
  return <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">{Math.floor(secs / 60)}m {secs % 60}s</span>;
}

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <svg className={`${cls} animate-spin text-[var(--color-accent)]`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function getToolDetailText(tool: ToolCall): string | null {
  const inp = tool.input;
  switch (tool.name) {
    case 'wiki_write':
      return `${inp.path ?? ''} — ${inp.title ?? ''}`;
    case 'wiki_read':
      return `${inp.path ?? ''}`;
    case 'wiki_search':
      return `"${inp.query ?? ''}"`;
    case 'query_game_data':
    case 'query_string_data':
      return typeof inp.sql === 'string' ? inp.sql.substring(0, 120) : null;
    case 'search_strings':
      return `"${inp.query ?? ''}"${inp.lang ? ` (${inp.lang})` : ''}`;
    case 'get_string':
      return `${inp.key ?? ''}`;
    case 'search_code':
      return `"${inp.query ?? ''}"`;
    case 'read_code_file':
      return `${inp.path ?? ''}`;
    case 'show_table_schema':
      return `${inp.tableName ?? ''}`;
    case 'search_jira':
    case 'search_confluence':
      return `"${inp.query ?? ''}"`;
    default:
      return null;
  }
}

function ToolItem({ tool, compact }: { tool: ToolCall; compact?: boolean }) {
  const isDone = tool.status === 'done';
  const isError = tool.status === 'error';
  const isRunning = tool.status === 'running';
  const detail = getToolDetailText(tool);

  return (
    <div
      className={`flex items-start gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 transition-all duration-300 ${
        isRunning ? 'bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20' :
        compact ? '' : 'opacity-70'
      }`}
    >
      <div className="mt-0.5 flex-shrink-0">
        {isDone && (
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
        {isError && (
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {isRunning && <Spinner />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs truncate ${isRunning ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>
            {getToolLabel(tool.name)}
          </span>
          {isRunning && (
            <span className="flex gap-0.5 ml-1">
              <span className="h-1 w-1 rounded-full bg-[var(--color-accent)] animate-pulse" />
              <span className="h-1 w-1 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ animationDelay: '300ms' }} />
              <span className="h-1 w-1 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ animationDelay: '600ms' }} />
            </span>
          )}
        </div>
        {detail && (
          <p className={`text-[10px] mt-0.5 truncate font-mono ${isRunning ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-muted)]'}`}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

export function ToolProgressBar({ tools, toolHistory, iteration }: ToolProgressBarProps) {
  const [showHistory, setShowHistory] = useState(false);

  if (tools.length === 0 && toolHistory.length === 0) return null;

  const runningCount = tools.filter((t) => t.status === 'running').length;
  const allDone = [...toolHistory, ...tools];
  const doneCount = allDone.filter((t) => t.status === 'done').length;
  const totalCount = allDone.length;
  const hasRunning = runningCount > 0;

  return (
    <div className="flex gap-3 px-4 md:px-6 py-2 animate-in fade-in duration-200">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[10px] font-bold text-white">
        D
      </div>
      <div className="flex-1 max-w-[85%] md:max-w-[70%] rounded-2xl rounded-bl-md bg-[var(--color-surface-2)] px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {hasRunning && <Spinner size="md" />}
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {hasRunning ? '작업 진행 중' : '작업 완료'}
            </span>
            {iteration > 0 && (
              <span className="rounded-full bg-[var(--color-surface-0)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-text-muted)]">
                반복 {iteration + 1}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
              {doneCount}/{totalCount}
            </span>
            {hasRunning && <ElapsedTimer />}
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-1 rounded-full bg-[var(--color-surface-0)] mb-2.5 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
            style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
          />
          {hasRunning && (
            <div
              className="absolute inset-y-0 rounded-full bg-[var(--color-accent)] opacity-40"
              style={{
                left: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
                width: `${totalCount > 0 ? (1 / totalCount) * 100 : 0}%`,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* History toggle */}
        {toolHistory.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 mb-1.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <svg className={`w-2.5 h-2.5 transition-transform ${showHistory ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            이전 단계 ({toolHistory.length}개 도구)
          </button>
        )}

        {/* History items */}
        {showHistory && toolHistory.length > 0 && (
          <div className="space-y-0.5 mb-2 pl-1 border-l-2 border-[var(--color-border-subtle)]">
            {toolHistory.map((tool, i) => (
              <ToolItem key={`hist-${tool.name}-${i}`} tool={tool} compact />
            ))}
          </div>
        )}

        {/* Current iteration tools */}
        <div className="space-y-1">
          {tools.map((tool, i) => (
            <ToolItem key={`cur-${tool.name}-${i}`} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
}
