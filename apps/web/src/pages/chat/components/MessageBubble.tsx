import { useState, useEffect, useRef, useMemo, type ReactNode, Children, isValidElement, cloneElement } from 'react';
import type { ChatMessage } from '@datamaster/shared';
import { getToolLabel } from '@datamaster/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { InlineChart, InlineStat, parseChartBlock, parseStatBlock } from '../../../components/visualization';
import { CodeBlock } from '../../../components/common/CodeBlock';

let chatMermaidId = 0;

function ChatMermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const idRef = useRef(`chat-mermaid-${++chatMermaidId}`);

  useEffect(() => {
    let cancelled = false;
    mermaid.render(idRef.current, code.trim()).then(({ svg: s }) => {
      if (!cancelled) setSvg(s);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [code]);

  if (!svg) return <pre className="rounded-lg bg-[var(--color-surface-0)] border border-[var(--color-border)] p-3 my-2 overflow-x-auto text-[12px] font-mono">{code}</pre>;
  return <div className="my-2 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-0)] p-3 mermaid-container" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function processWikilinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    return `[${label ?? target}](#/wiki/${target})`;
  });
}

const WIKI_PATH_RE = /(?:entities|concepts|analysis|guides|_policies|_other)\/[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9_-]+)*/g;

function linkifyWikiPaths(children: ReactNode, nav: NavigateFunction): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      WIKI_PATH_RE.lastIndex = 0;
      if (!WIKI_PATH_RE.test(child)) return child;
      WIKI_PATH_RE.lastIndex = 0;
      const parts: ReactNode[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = WIKI_PATH_RE.exec(child)) !== null) {
        if (m.index > last) parts.push(child.slice(last, m.index));
        const p = m[0];
        parts.push(
          <button key={`wl-${m.index}`} onClick={() => nav(`/wiki/${p}`)}
            className="text-[var(--color-accent)] hover:underline font-medium inline cursor-pointer">
            {p}
          </button>
        );
        last = WIKI_PATH_RE.lastIndex;
      }
      if (last < child.length) parts.push(child.slice(last));
      return <>{parts}</>;
    }
    if (isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: ReactNode }>;
      if (el.props.children != null) {
        return cloneElement(el, {}, linkifyWikiPaths(el.props.children, nav));
      }
    }
    return child;
  });
}

const WIKI_TOOL_NAMES = new Set(['wiki_write', 'wiki_read', 'wiki_search', 'wiki_lint', 'wiki_patch', 'wiki_delete']);

function CompletedToolsSummary({ toolCalls }: { toolCalls: NonNullable<ChatMessage['toolCalls']> }) {
  const [expanded, setExpanded] = useState(false);

  const grouped = (() => {
    const map = new Map<string, number>();
    for (const t of toolCalls) {
      map.set(t.name, (map.get(t.name) ?? 0) + 1);
    }
    return Array.from(map.entries());
  })();

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 flex-wrap rounded-lg bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)] transition-colors w-full"
      >
        <svg className="w-3 h-3 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        {grouped.map(([name, count]) => (
          <span key={name} className={`inline-flex items-center gap-0.5 ${WIKI_TOOL_NAMES.has(name) ? 'text-purple-300/70' : ''}`}>
            {getToolLabel(name)}{count > 1 && <span className="text-[9px] opacity-60">×{count}</span>}
          </span>
        ))}
        <svg className={`w-2.5 h-2.5 opacity-40 flex-shrink-0 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 max-h-[300px] overflow-y-auto">
          {toolCalls.map((tool) => (
            <div key={tool.id} className="rounded-md bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[10px]">
              <div className="flex items-center gap-1.5">
                {WIKI_TOOL_NAMES.has(tool.name) ? (
                  <svg className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                ) : (
                  <svg className="w-2.5 h-2.5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
                <span className="font-medium text-[var(--color-text-secondary)]">{getToolLabel(tool.name)}</span>
                {tool.input && (
                  <span className="text-[var(--color-text-muted)] truncate font-mono ml-1">
                    {String(tool.input.path ?? (tool.input.sql as string)?.substring(0, 60) ?? tool.input.query ?? '')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CHAT_VIZ_RE = /:::chart\s*\n([\s\S]*?)\n:::|:::stat\s*\n([\s\S]*?)\n:::/g;

function ChatMarkdownContent({ content, navigate }: { content: string; navigate: NavigateFunction }) {
  const parts = useMemo(() => {
    const segments: { type: 'text' | 'chart' | 'stat'; value: string }[] = [];
    const processed = processWikilinks(content);
    let lastIndex = 0;
    let match;

    CHAT_VIZ_RE.lastIndex = 0;
    while ((match = CHAT_VIZ_RE.exec(processed)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: processed.slice(lastIndex, match.index) });
      }
      if (match[1] !== undefined) {
        segments.push({ type: 'chart', value: match[1].trim() });
      } else if (match[2] !== undefined) {
        segments.push({ type: 'stat', value: match[2].trim() });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < processed.length) {
      segments.push({ type: 'text', value: processed.slice(lastIndex) });
    }
    return segments;
  }, [content]);

  const mdComponents = useMemo(() => ({
    h1: ({ children }: { children?: ReactNode }) => <h1 className="text-base font-bold mt-4 mb-2 text-[var(--color-text-primary)]">{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => <h2 className="text-[15px] font-semibold mt-3 mb-2 text-[var(--color-text-primary)]">{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 className="text-[14px] font-semibold mt-3 mb-1.5 text-[var(--color-text-primary)]">{children}</h3>,
    h4: ({ children }: { children?: ReactNode }) => <h4 className="text-[13px] font-semibold mt-2 mb-1 text-[var(--color-text-primary)]">{children}</h4>,
    p: ({ children }: { children?: ReactNode }) => <p className="mb-2 last:mb-0">{linkifyWikiPaths(children, navigate)}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
    ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
    li: ({ children }: { children?: ReactNode }) => <li className="text-[13px]">{linkifyWikiPaths(children, navigate)}</li>,
    strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
    code: ({ className, children }: { className?: string; children?: ReactNode }) => {
      if (!className) return <code className="rounded bg-[var(--color-surface-0)] px-1 py-0.5 text-[12px] font-mono">{children}</code>;
      const raw = String(children).replace(/\n$/, '');
      if (className === 'language-mermaid') return <ChatMermaid code={raw} />;
      const lang = className.replace('language-', '');
      return <CodeBlock code={raw} language={lang} compact />;
    },
    blockquote: ({ children }: { children?: ReactNode }) => <blockquote className="border-l-2 border-[var(--color-accent)] pl-3 my-2 text-[var(--color-text-muted)] italic">{children}</blockquote>,
    table: ({ children }: { children?: ReactNode }) => <div className="overflow-x-auto my-2"><table className="w-full text-[12px] border-collapse">{children}</table></div>,
    th: ({ children }: { children?: ReactNode }) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-0)] px-2 py-1.5 text-left font-medium">{children}</th>,
    td: ({ children }: { children?: ReactNode }) => <td className="border border-[var(--color-border-subtle)] px-2 py-1.5">{linkifyWikiPaths(children, navigate)}</td>,
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
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
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <span className="inline-block my-2">
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          className="max-w-full rounded-lg border border-[var(--color-border)] shadow-sm"
          style={{ maxHeight: '240px' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {alt && <span className="block text-xs text-[var(--color-text-muted)] mt-1">{alt}</span>}
      </span>
    ),
  }), [navigate]);

  return (
    <div className="chat-markdown break-words">
      {parts.map((part, i) => {
        if (part.type === 'chart') {
          const config = parseChartBlock(part.value);
          if (config) return <InlineChart key={`chart-${i}`} config={config} />;
          return null;
        }
        if (part.type === 'stat') {
          const config = parseStatBlock(part.value);
          if (config) return <InlineStat key={`stat-${i}`} config={config} />;
          return null;
        }
        return (
          <ReactMarkdown key={`md-${i}`} remarkPlugins={[remarkGfm]} components={mdComponents}>
            {part.value}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const navigate = useNavigate();
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 px-4 md:px-6 py-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[10px] font-bold text-white">
          D
        </div>
      )}

      <div
        className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? 'rounded-2xl rounded-br-md bg-[var(--color-accent)] text-white'
            : 'rounded-2xl rounded-bl-md bg-[var(--color-surface-2)] text-[var(--color-text-primary)]'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <ChatMarkdownContent content={message.content} navigate={navigate} />
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <CompletedToolsSummary toolCalls={message.toolCalls} />
        )}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-3)] text-xs font-medium text-[var(--color-text-secondary)]">
          U
        </div>
      )}
    </div>
  );
}
