import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

interface Props {
  source: string;
  placeholder?: string;
  columns?: string[];
  filter?: string;
}

export function SearchBlock({ source, placeholder, columns, filter }: Props) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sql = filter
      ? `SELECT ${columns?.join(', ') || '*'} FROM ${source} WHERE ${filter}`
      : `SELECT ${columns?.join(', ') || '*'} FROM ${source} LIMIT 500`;

    api.post<QueryResult>('/api/data/query', { sql })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Query failed'))
      .finally(() => setLoading(false));
  }, [source, columns, filter]);

  const filtered = useMemo(() => {
    if (!data || !query.trim()) return data?.rows ?? [];
    const q = query.toLowerCase();
    return data.rows.filter((row) =>
      Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q))
    );
  }, [data, query]);

  const displayCols = columns ?? data?.columns ?? [];

  if (loading) return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 animate-pulse">
      <div className="h-8 bg-[var(--color-surface-3)] rounded mb-3" />
      <div className="h-32 bg-[var(--color-surface-3)] rounded" />
    </div>
  );

  if (error) return (
    <div className="my-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
      검색 로드 실패: {error}
    </div>
  );

  return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-3)]">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder || `${source}에서 검색...`}
            className="w-full pl-10 pr-4 py-2 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>{filtered.length}건</span>
          {query && <span>/ 전체 {data?.rows.length ?? 0}건</span>}
        </div>
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-surface-3)]">
            <tr>
              {displayCols.map((col) => (
                <th key={col} className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((row, ri) => (
              <tr key={ri} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-3)]/50 transition-colors">
                {displayCols.map((col) => (
                  <td key={col} className="px-3 py-1.5 font-mono text-[var(--color-text-secondary)] whitespace-nowrap">
                    {query && String(row[col] ?? '').toLowerCase().includes(query.toLowerCase())
                      ? <HighlightText text={String(row[col] ?? '')} query={query} />
                      : String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div className="px-4 py-2 text-xs text-[var(--color-text-muted)] text-center bg-[var(--color-surface-3)]">
            {filtered.length - 100}건 더 있음
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-[var(--color-accent)]/30 text-[var(--color-accent)] rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}
