import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { DataItem } from './types';

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

interface ChartDataState {
  data: DataItem[] | null;
  columns: string[];
  loading: boolean;
  error: string | null;
}

export function useChartData(sql: string | undefined): ChartDataState {
  const [state, setState] = useState<ChartDataState>({
    data: null,
    columns: [],
    loading: !!sql,
    error: null,
  });

  useEffect(() => {
    if (!sql) {
      setState({ data: null, columns: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    api.post<QueryResult>('/api/data/query', { sql })
      .then((result) => {
        if (cancelled) return;
        setState({
          data: result.rows as DataItem[],
          columns: result.columns,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          data: null,
          columns: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Query failed',
        });
      });

    return () => { cancelled = true; };
  }, [sql]);

  return state;
}
