import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

interface Props {
  title?: string;
  leftSql: string;
  leftLabel: string;
  rightSql: string;
  rightLabel: string;
  highlight?: 'higher' | 'lower' | 'none';
}

export function TableCompareBlock({ title, leftSql, leftLabel, rightSql, rightLabel, highlight = 'higher' }: Props) {
  const [leftData, setLeftData] = useState<QueryResult | null>(null);
  const [rightData, setRightData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.post<QueryResult>('/api/data/query', { sql: leftSql }),
      api.post<QueryResult>('/api/data/query', { sql: rightSql }),
    ])
      .then(([l, r]) => { setLeftData(l); setRightData(r); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Query failed'))
      .finally(() => setLoading(false));
  }, [leftSql, rightSql]);

  if (loading) return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 animate-pulse">
      <div className="h-4 w-48 bg-[var(--color-surface-3)] rounded mb-3" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-32 bg-[var(--color-surface-3)] rounded" />
        <div className="h-32 bg-[var(--color-surface-3)] rounded" />
      </div>
    </div>
  );

  if (error) return (
    <div className="my-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
      비교 로드 실패: {error}
    </div>
  );

  const leftRow = leftData?.rows[0] ?? {};
  const rightRow = rightData?.rows[0] ?? {};
  const allFields = [...new Set([...Object.keys(leftRow), ...Object.keys(rightRow)])];

  return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      {title && (
        <div className="px-4 py-2 bg-[var(--color-surface-3)] border-b border-[var(--color-border)] flex items-center gap-2">
          <span className="text-xs">⚖️</span>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</span>
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--color-surface-3)]">
            <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)] w-1/3">필드</th>
            <th className="text-center px-3 py-2 font-medium text-[var(--color-accent)] border-b border-[var(--color-border)] w-1/3">{leftLabel}</th>
            <th className="text-center px-3 py-2 font-medium text-purple-400 border-b border-[var(--color-border)] w-1/3">{rightLabel}</th>
          </tr>
        </thead>
        <tbody>
          {allFields.map((field) => {
            const lv = leftRow[field];
            const rv = rightRow[field];
            const ln = Number(lv);
            const rn = Number(rv);
            const isNumeric = !isNaN(ln) && !isNaN(rn) && lv !== null && rv !== null;
            const leftWins = isNumeric && highlight !== 'none' && ((highlight === 'higher' && ln > rn) || (highlight === 'lower' && ln < rn));
            const rightWins = isNumeric && highlight !== 'none' && ((highlight === 'higher' && rn > ln) || (highlight === 'lower' && rn < ln));
            const isDiff = String(lv ?? '') !== String(rv ?? '');

            return (
              <tr key={field} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-3)]/30">
                <td className="px-3 py-2 font-mono text-[var(--color-text-muted)]">{field}</td>
                <td className={`px-3 py-2 text-center font-mono ${leftWins ? 'text-green-400 font-semibold bg-green-500/5' : isDiff ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                  {String(lv ?? '—')}
                  {leftWins && <span className="ml-1 text-[10px]">▲</span>}
                </td>
                <td className={`px-3 py-2 text-center font-mono ${rightWins ? 'text-green-400 font-semibold bg-green-500/5' : isDiff ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                  {String(rv ?? '—')}
                  {rightWins && <span className="ml-1 text-[10px]">▲</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
