import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface DiffChange {
  type: 'added' | 'removed' | 'modified';
  id: unknown;
  changes?: { field: string; old: unknown; new: unknown }[];
  oldRow?: Record<string, unknown>;
  newRow?: Record<string, unknown>;
  row?: Record<string, unknown>;
}

interface DiffResult {
  from: string;
  to: string;
  results: { table: string; pkField: string; changes: DiffChange[] }[];
}

interface Props {
  table: string;
  id?: string;
  from?: string;
  to?: string;
}

export function DiffBlock({ table, id, from, to }: Props) {
  const [data, setData] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.post<DiffResult>('/api/data/diff', { table, id, from, to })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [table, id, from, to]);

  if (loading) return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 animate-pulse">
      <div className="h-4 w-48 bg-[var(--color-surface-3)] rounded mb-3" />
      <div className="h-20 bg-[var(--color-surface-3)] rounded" />
    </div>
  );

  if (error) return (
    <div className="my-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
      Diff 로드 실패: {error}
    </div>
  );

  if (!data || data.results.length === 0) return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text-muted)]">
      변경사항 없음 ({table})
    </div>
  );

  return (
    <div className="my-4 space-y-3">
      {data.results.map((r, ri) => (
        <div key={ri} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
          <div className="px-4 py-2 bg-[var(--color-surface-3)] border-b border-[var(--color-border)] flex items-center gap-3">
            <span className="text-xs font-mono text-[var(--color-text-muted)]">🔄</span>
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{r.table}</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {data.from.substring(0, 7)} → {data.to.substring(0, 7)}
            </span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {r.changes.map((change, ci) => (
              <div key={ci} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    change.type === 'added' ? 'bg-green-500/15 text-green-400' :
                    change.type === 'removed' ? 'bg-red-500/15 text-red-400' :
                    'bg-yellow-500/15 text-yellow-400'
                  }`}>
                    {change.type === 'added' ? '+ 추가' : change.type === 'removed' ? '− 삭제' : '~ 수정'}
                  </span>
                  <span className="text-sm font-mono text-[var(--color-text-primary)]">
                    {r.pkField}: {String(change.id)}
                  </span>
                </div>
                {change.type === 'modified' && change.changes && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--color-text-muted)]">
                        <th className="text-left py-1 pr-3 font-medium">필드</th>
                        <th className="text-left py-1 pr-3 font-medium">이전 값</th>
                        <th className="text-left py-1 font-medium">새 값</th>
                      </tr>
                    </thead>
                    <tbody>
                      {change.changes.map((d, di) => (
                        <tr key={di} className="border-t border-[var(--color-border)]/50">
                          <td className="py-1.5 pr-3 font-mono text-[var(--color-accent)]">{d.field}</td>
                          <td className="py-1.5 pr-3 font-mono bg-red-500/5 text-red-400 rounded-l px-1">{String(d.old ?? 'null')}</td>
                          <td className="py-1.5 font-mono bg-green-500/5 text-green-400 rounded-r px-1">{String(d.new ?? 'null')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {(change.type === 'added' || change.type === 'removed') && change.row && (
                  <div className="text-xs font-mono text-[var(--color-text-muted)] mt-1 truncate">
                    {Object.entries(change.row).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
