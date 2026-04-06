import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { executeQuery } from '../../lib/sql/queryEngine';
import { ResultTable } from './components/ResultTable';

interface QueryResultState {
  data: { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; executionTime: number } | null;
  error: string | null;
}

export default function QueryPage() {
  const [sql, setSql] = useState('SELECT * FROM Character LIMIT 100');
  const [result, setResult] = useState<QueryResultState>({ data: null, error: null });

  const handleExecute = useCallback(() => {
    try {
      const data = executeQuery(sql);
      setResult({ data, error: null });
    } catch (err) {
      setResult({ data: null, error: err instanceof Error ? err.message : 'Query failed' });
    }
  }, [sql]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecute();
      }
    },
    [handleExecute],
  );

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center border-b border-[var(--color-border)] px-4 py-2.5 gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">SQL Query</h2>
        <button
          onClick={handleExecute}
          className="btn btn-primary ml-auto text-xs"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
          </svg>
          <span className="hidden sm:inline">Execute</span>
          <kbd className="hidden sm:inline text-[10px] opacity-60 ml-1">Ctrl+Enter</kbd>
        </button>
      </div>

      {/* Editor + Results: Desktop horizontal, Mobile vertical */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* SQL Editor */}
        <div className="h-[180px] md:h-full md:w-1/2 flex-shrink-0 border-b md:border-b-0 md:border-r border-[var(--color-border)]">
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={sql}
            onChange={(v) => setSql(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              padding: { top: 12 },
            }}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {result.error && (
            <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-2.5 text-sm text-red-400">{result.error}</div>
          )}
          {result.data && (
            <ResultTable
              columns={result.data.columns}
              rows={result.data.rows}
              rowCount={result.data.rowCount}
              executionTime={result.data.executionTime}
            />
          )}
          {!result.data && !result.error && (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
              Ctrl+Enter로 쿼리를 실행하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
