import { useState, useMemo } from 'react';

interface ResultTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

const PAGE_SIZE = 100;

export function ResultTable({ columns, rows, rowCount, executionTime }: ResultTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  if (columns.length === 0) {
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">No results</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
        <span className="font-medium">{rowCount} rows</span>
        <span>{executionTime.toFixed(1)}ms</span>
        {totalPages > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-ghost rounded-[var(--radius-sm)] px-2 py-0.5 text-xs disabled:opacity-30"
            >
              &larr;
            </button>
            <span>{page + 1}/{totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-ghost rounded-[var(--radius-sm)] px-2 py-0.5 text-xs disabled:opacity-30"
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-surface-1)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="cursor-pointer border-b border-[var(--color-border)] px-3 py-2.5 text-left font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors select-none"
                >
                  {col}
                  {sortCol === col && (
                    <span className="ml-1 text-[var(--color-accent)]">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-2)] transition-colors">
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-[var(--color-text-primary)] font-mono">
                    {row[col] == null
                      ? <span className="text-[var(--color-text-muted)] italic">NULL</span>
                      : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
