import { useState, useEffect, useRef, useMemo } from 'react';
import type { ToolCall } from '@datamaster/shared';
import { getToolLabel } from '@datamaster/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ToolProgressBarProps {
  tools: ToolCall[];
  collapsed?: boolean;
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
    case 'wiki_patch': {
      const ops = Array.isArray(inp.operations) ? inp.operations : [];
      const opNames = ops.map((o: Record<string, unknown>) => o.op).join(', ');
      return `${inp.path ?? ''} — ${opNames || 'patch'}`;
    }
    case 'wiki_delete':
      return `${inp.path ?? ''}`;
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
    case 'search_images':
      return `"${inp.query ?? ''}"`;
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

const WIKI_TOOLS = new Set(['wiki_write', 'wiki_read', 'wiki_search', 'wiki_lint', 'wiki_patch', 'wiki_delete']);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function GeneratingBadge({ tool }: { tool: ToolCall }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 300);
    return () => clearInterval(id);
  }, []);

  const secs = Math.floor(elapsed / 1000);
  const hasContent = tool.contentStarted || (tool.generatingContent && tool.generatingContent.length > 0);
  const bytes = tool.generatingBytes;

  const label = hasContent ? '작성 중' : '준비 중';
  const color = hasContent ? 'bg-purple-500/20 text-purple-300' : 'bg-amber-500/20 text-amber-300';

  return (
    <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 16 16" fill="none">
        <circle className="opacity-20" cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
        <path className="opacity-90" d="M8 2a6 6 0 015.196 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="tabular-nums">
        {label} {secs}s
        {bytes != null && bytes > 0 && <span className="opacity-60 ml-0.5">({formatBytes(bytes)})</span>}
      </span>
    </span>
  );
}

function ContentPreview({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content]);

  const truncated = useMemo(() => {
    const lines = content.split('\n');
    if (lines.length > 80) return lines.slice(-80).join('\n');
    return content;
  }, [content]);

  return (
    <div
      ref={containerRef}
      className="mt-2 max-h-[280px] overflow-y-auto rounded-lg bg-[var(--color-surface-0)] border border-purple-500/15 px-3 py-2 text-[12px] leading-relaxed text-[var(--color-text-secondary)] scroll-smooth"
    >
      <div className="wiki-content-preview break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-sm font-bold mt-3 mb-1.5 text-[var(--color-text-primary)]">{children}</h1>,
            h2: ({ children }) => <h2 className="text-[13px] font-semibold mt-2.5 mb-1.5 text-[var(--color-text-primary)]">{children}</h2>,
            h3: ({ children }) => <h3 className="text-[12px] font-semibold mt-2 mb-1 text-[var(--color-text-primary)]">{children}</h3>,
            p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-3.5 mb-1.5 space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-3.5 mb-1.5 space-y-0.5">{children}</ol>,
            li: ({ children }) => <li className="text-[12px]">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
            code: ({ className, children, ...props }) => {
              if (!className) return <code className="rounded bg-[var(--color-surface-2)] px-1 py-0.5 text-[11px] font-mono" {...props}>{children}</code>;
              return (
                <pre className="rounded bg-[var(--color-surface-2)] border border-[var(--color-border)] p-2 my-1.5 overflow-x-auto">
                  <code className={`${className} text-[11px] font-mono`} {...props}>{children}</code>
                </pre>
              );
            },
            table: ({ children }) => <div className="overflow-x-auto my-1.5"><table className="w-full text-[11px] border-collapse">{children}</table></div>,
            th: ({ children }) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-1 text-left font-medium text-[11px]">{children}</th>,
            td: ({ children }) => <td className="border border-[var(--color-border-subtle)] px-1.5 py-1 text-[11px]">{children}</td>,
            img: ({ src, alt }) => (
              <span className="inline-block my-1">
                <img src={src} alt={alt ?? ''} loading="lazy" className="max-w-full rounded border border-[var(--color-border)] shadow-sm" style={{ maxHeight: '120px' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </span>
            ),
          }}
        >
          {truncated}
        </ReactMarkdown>
      </div>
      <span className="inline-block h-3.5 w-0.5 animate-pulse bg-purple-400 ml-0.5 align-middle" />
    </div>
  );
}

function PartialInfoBar({ partial }: { partial: { path?: string; title?: string } }) {
  return (
    <div className="mt-2 rounded-lg bg-[var(--color-surface-0)] border border-purple-500/15 px-3 py-2">
      {partial.title && (
        <div className="text-[12px] font-medium text-[var(--color-text-primary)]">{partial.title}</div>
      )}
      {partial.path && (
        <div className="text-[10px] font-mono text-purple-300/70 mt-0.5">{partial.path}</div>
      )}
      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-[var(--color-text-muted)]">
        <span className="flex gap-0.5">
          {[0, 200, 400].map((d) => (
            <span key={d} className="h-1 w-1 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
        콘텐츠 작성 준비 중...
      </div>
    </div>
  );
}

function ToolItem({ tool, compact }: { tool: ToolCall; compact?: boolean }) {
  const isDone = tool.status === 'done';
  const isError = tool.status === 'error';
  const isRunning = tool.status === 'running';
  const isGenerating = tool.status === 'generating';
  const isActive = isRunning || isGenerating;
  const isWiki = WIKI_TOOLS.has(tool.name);
  const detail = getToolDetailText(tool);
  const hasContentPreview = (isGenerating || isRunning) && tool.generatingContent && tool.generatingContent.length > 0;
  const hasPartialInfo = isGenerating && !hasContentPreview && tool.generatingPartial && (tool.generatingPartial.path || tool.generatingPartial.title);

  return (
    <div>
      <div
        className={`flex items-start gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 transition-all duration-300 ${
          isActive && isWiki ? 'bg-purple-500/8 border border-purple-500/25' :
          isActive ? 'bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20' :
          compact ? '' : 'opacity-70'
        }`}
      >
        <div className="mt-0.5 flex-shrink-0">
          {isDone && isWiki && (
            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          )}
          {isDone && !isWiki && (
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
          {isError && (
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {isActive && isWiki && (
            <svg className="w-3.5 h-3.5 text-purple-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          )}
          {isActive && !isWiki && <Spinner />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs truncate ${
              isActive && isWiki ? 'text-purple-300 font-medium' :
              isActive ? 'text-[var(--color-text-primary)] font-medium' :
              'text-[var(--color-text-secondary)]'
            }`}>
              {getToolLabel(tool.name)}
            </span>
            {isActive && !hasContentPreview && (
              <span className="flex gap-0.5 ml-1">
                {[0, 300, 600].map((delay) => (
                  <span key={delay} className={`h-1 w-1 rounded-full animate-pulse ${isWiki ? 'bg-purple-400' : 'bg-[var(--color-accent)]'}`} style={{ animationDelay: `${delay}ms` }} />
                ))}
              </span>
            )}
            {isGenerating && !hasContentPreview && <GeneratingBadge tool={tool} />}
            {hasContentPreview && isGenerating && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium tabular-nums">
                작성 중 {formatBytes(tool.generatingContent?.length ?? 0)}
              </span>
            )}
            {isRunning && tool.name === 'wiki_write' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300 font-medium">저장 중</span>
            )}
          </div>
          {detail && !hasContentPreview && (
            <p className={`text-[10px] mt-0.5 truncate font-mono ${
              isActive && isWiki ? 'text-purple-300/70' :
              isActive ? 'text-[var(--color-text-secondary)]' :
              'text-[var(--color-text-muted)]'
            }`}>
              {detail}
            </p>
          )}
        </div>
      </div>

      {hasPartialInfo && <PartialInfoBar partial={tool.generatingPartial!} />}
      {hasContentPreview && <ContentPreview content={tool.generatingContent!} />}
    </div>
  );
}

function CompactToolChip({ tool }: { tool: ToolCall }) {
  const isWiki = WIKI_TOOLS.has(tool.name);
  const isError = tool.status === 'error';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
      isError ? 'bg-red-500/10 text-red-400' :
      isWiki ? 'bg-purple-500/10 text-purple-300' :
      'bg-[var(--color-surface-0)] text-[var(--color-text-muted)]'
    }`}>
      {isError ? (
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : isWiki ? (
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ) : (
        <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
      {getToolLabel(tool.name)}
    </span>
  );
}

function groupTools(tools: ToolCall[]): { name: string; count: number; tool: ToolCall }[] {
  const map = new Map<string, { count: number; tool: ToolCall }>();
  for (const t of tools) {
    const existing = map.get(t.name);
    if (existing) {
      existing.count++;
    } else {
      map.set(t.name, { count: 1, tool: t });
    }
  }
  return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
}

export function ToolProgressBar({ tools, collapsed: initialCollapsed }: ToolProgressBarProps) {
  const [expanded, setExpanded] = useState(!initialCollapsed);
  const prevAllDoneRef = useRef(false);

  const activeCount = tools.filter((t) => t.status === 'running' || t.status === 'generating').length;
  const doneCount = tools.filter((t) => t.status === 'done').length;
  const totalCount = tools.length;
  const hasRunning = activeCount > 0;
  const allDone = !hasRunning && doneCount === totalCount && totalCount > 0;

  useEffect(() => {
    if (!initialCollapsed) setExpanded(true);
  }, [initialCollapsed]);

  // Auto-collapse when all tools finish
  useEffect(() => {
    if (allDone && !prevAllDoneRef.current) {
      const timer = setTimeout(() => setExpanded(false), 1500);
      prevAllDoneRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!allDone) prevAllDoneRef.current = false;
  }, [allDone]);

  if (tools.length === 0) return null;

  // Collapsed compact view
  if (allDone && !expanded) {
    const grouped = groupTools(tools);
    return (
      <div className="flex gap-3 px-4 md:px-6 py-1 animate-in fade-in duration-200">
        <div className="w-7 flex-shrink-0" />
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 flex-wrap rounded-xl bg-[var(--color-surface-2)] px-3 py-1.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <svg className="w-3 h-3 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          {grouped.map((g) => (
            <span key={g.name} className={`inline-flex items-center gap-0.5 ${WIKI_TOOLS.has(g.name) ? 'text-purple-300/70' : 'text-[var(--color-text-muted)]'}`}>
              {getToolLabel(g.name)}{g.count > 1 && <span className="text-[9px] opacity-60">×{g.count}</span>}
            </span>
          ))}
          <svg className="w-2.5 h-2.5 opacity-40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-4 md:px-6 py-2 animate-in fade-in duration-200">
      <div className="w-7 flex-shrink-0" />
      <div className="flex-1 max-w-[85%] md:max-w-[70%] rounded-2xl rounded-bl-md bg-[var(--color-surface-2)] px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {hasRunning && <Spinner size="md" />}
            {allDone && (
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {hasRunning ? '작업 진행 중' : '작업 완료'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
              {doneCount}/{totalCount}
            </span>
            {hasRunning && <ElapsedTimer />}
            {allDone && (
              <button onClick={() => setExpanded(false)} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">접기</button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {!allDone && (
          <div className="relative h-1 rounded-full bg-[var(--color-surface-0)] mb-2.5 overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${allDone ? 'bg-green-500' : 'bg-[var(--color-accent)]'}`}
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
        )}

        {/* Tool items — compact chips when done, full list when running */}
        {allDone ? (
          <div className="flex flex-wrap gap-1">
            {tools.map((tool, i) => (
              <CompactToolChip key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {tools.map((tool, i) => (
              <ToolItem key={`${tool.name}-${i}`} tool={tool} compact={allDone} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
