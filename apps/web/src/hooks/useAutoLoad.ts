import { useEffect } from 'react';
import { api } from '../lib/api';
import { useSchemaStore } from '../stores/schemaStore';
import { useSyncStore } from '../stores/syncStore';
import { registerTable } from '../lib/sql/queryEngine';

interface TableInfo {
  name: string;
  fileName: string;
  headers: string[];
  rowCount: number;
}

interface TableRows {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export function useAutoLoad() {
  const setDbml = useSchemaStore((s) => s.setDbml);
  const setDataFiles = useSchemaStore((s) => s.setDataFiles);
  const { startSync, finishSync } = useSyncStore();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      startSync();
      try {
        try {
          await api.post('/api/git/sync');
        } catch {
          // sync might fail if no repos configured — continue to load cached data
        }

        const data = await api.get<{
          dbml: string;
          dataFiles: string[];
          schemaFiles: string[];
        }>('/api/data/schema');

        if (cancelled) return;
        setDbml(data.dbml);
        setDataFiles(data.dataFiles);

        // Load table data into AlaSQL for SQL queries
        const { tables } = await api.get<{ tables: TableInfo[] }>('/api/data/tables');
        if (cancelled) return;

        const loadPromises = tables.map(async (t) => {
          try {
            const tableData = await api.get<TableRows>(`/api/data/rows?table=${encodeURIComponent(t.name)}`);
            if (!cancelled && tableData.rows.length > 0) {
              registerTable(t.name, tableData.rows);
            }
          } catch {
            // individual table load failure is non-fatal
          }
        });

        await Promise.all(loadPromises);
        if (!cancelled) finishSync();
      } catch (err) {
        if (!cancelled) {
          finishSync(err instanceof Error ? err.message : 'Failed to load data');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      finishSync();
    };
  }, []);
}
