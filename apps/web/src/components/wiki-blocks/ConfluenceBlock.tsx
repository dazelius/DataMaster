import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../lib/api';

interface Props {
  pageId: string;
  sections?: string[];
}

interface ConfluencePage {
  id: string;
  title: string;
  body: string;
  spaceKey?: string;
  version?: number;
  url?: string;
}

export function ConfluenceBlock({ pageId, sections }: Props) {
  const [data, setData] = useState<ConfluencePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.get<ConfluencePage>(`/api/confluence/page/${pageId}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [pageId]);

  if (loading) return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 animate-pulse">
      <div className="h-4 w-48 bg-[var(--color-surface-3)] rounded mb-3" />
      <div className="h-24 bg-[var(--color-surface-3)] rounded" />
    </div>
  );

  if (error) return (
    <div className="my-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 text-sm text-orange-400">
      Confluence 로드 실패: {error}
    </div>
  );

  if (!data) return null;

  let displayBody = data.body || '';
  if (sections && sections.length > 0) {
    const extracted: string[] = [];
    for (const section of sections) {
      const regex = new RegExp(`(^|\\n)(#{1,6}\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*)(\\n[\\s\\S]*?)(?=\\n#{1,6}\\s|$)`, 'i');
      const match = displayBody.match(regex);
      if (match) extracted.push((match[2] + match[3]).trim());
    }
    if (extracted.length > 0) displayBody = extracted.join('\n\n---\n\n');
  }

  const previewLength = 800;
  const isLong = displayBody.length > previewLength;
  const shown = expanded ? displayBody : displayBody.substring(0, previewLength);

  return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="px-4 py-2 bg-[var(--color-surface-3)] border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs">📚</span>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">{data.title}</span>
          {sections && sections.length > 0 && (
            <span className="text-[10px] text-[var(--color-text-muted)]">({sections.join(', ')})</span>
          )}
        </div>
        {data.url && (
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-accent)] hover:underline">
            원문 열기 ↗
          </a>
        )}
      </div>
      <div className="confluence-body px-4 py-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-xl font-bold text-[var(--color-text-primary)] mt-4 mb-2 pb-1 border-b border-[var(--color-border)]">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-bold text-[var(--color-text-primary)] mt-3 mb-2">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-2 mb-1">{children}</h3>,
            h4: ({ children }) => <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mt-2 mb-1">{children}</h4>,
            p: ({ children }) => <p className="mb-2">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
            li: ({ children }) => <li className="text-[var(--color-text-secondary)]">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
            code: ({ children, className }) => {
              const isBlock = className?.includes('language-');
              return isBlock
                ? <code className="block bg-[var(--color-surface-3)] rounded p-2 my-2 text-xs overflow-x-auto">{children}</code>
                : <code className="bg-[var(--color-surface-3)] rounded px-1 py-0.5 text-xs">{children}</code>;
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-[var(--color-accent)] pl-3 my-2 text-[var(--color-text-muted)] italic">{children}</blockquote>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-2">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-[var(--color-surface-3)]">{children}</thead>,
            th: ({ children }) => <th className="border border-[var(--color-border)] px-2 py-1 text-left font-semibold text-[var(--color-text-primary)]">{children}</th>,
            td: ({ children }) => <td className="border border-[var(--color-border)] px-2 py-1">{children}</td>,
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{children}</a>
            ),
            hr: () => <hr className="border-[var(--color-border)] my-3" />,
          }}
        >
          {shown}
        </ReactMarkdown>
        {isLong && !expanded && (
          <div className="mt-1 text-[var(--color-text-muted)]">…</div>
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-3)] border-t border-[var(--color-border)] transition-colors"
        >
          {expanded ? '접기' : '전체 보기'}
        </button>
      )}
    </div>
  );
}
