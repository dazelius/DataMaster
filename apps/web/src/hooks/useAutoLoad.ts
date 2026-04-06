import { useEffect } from 'react';
import { api, parseSSELines } from '../lib/api';
import { useSchemaStore } from '../stores/schemaStore';
import { useSyncStore } from '../stores/syncStore';
import { registerTable } from '../lib/sql/queryEngine';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

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

async function streamGitSync(syncStore: ReturnType<typeof useSyncStore.getState>) {
  const res = await fetch(`${API_BASE}/api/git/sync`, {
    method: 'POST',
  });

  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = parseSSELines(buffer);
    const lastNewline = buffer.lastIndexOf('\n\n');
    buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 2) : buffer;

    for (const { event, data } of events) {
      try {
        const parsed = JSON.parse(data);
        switch (event) {
          case 'start':
            syncStore.startSync(parsed.repos.map((r: { id: string }) => r.id));
            break;
          case 'repo_start':
            syncStore.setRepoStatus(parsed.repoId, 'syncing');
            break;
          case 'repo_done':
            syncStore.setRepoStatus(
              parsed.repoId,
              parsed.success ? 'done' : 'error',
              parsed.message,
            );
            break;
          case 'phase':
            if (parsed.phase === 'loading_data') {
              syncStore.setRepoStatus(parsed.repoId, 'loading_data', '데이터 로딩 중...');
              syncStore.setPhase('loading_data');
            } else if (parsed.phase === 'data_loaded') {
              syncStore.setPhase('data_loaded');
            }
            break;
        }
      } catch { /* ignore */ }
    }
  }
}

export function useAutoLoad() {
  const setDbml = useSchemaStore((s) => s.setDbml);
  const setDataFiles = useSchemaStore((s) => s.setDataFiles);

  useEffect(() => {
    let cancelled = false;
    const syncStore = useSyncStore.getState();

    async function load() {
      syncStore.startSync();
      syncStore.setPhase('git_sync');

      try {
        await streamGitSync(syncStore);
      } catch {
        // sync might fail — continue to load cached data
      }

      if (cancelled) return;

      // Small delay to let server-side data loading finish if triggered by sync
      await new Promise((r) => setTimeout(r, 500));

      syncStore.setPhase('loading_schema');

      try {
        const data = await api.get<{
          dbml: string;
          dataFiles: string[];
          schemaFiles: string[];
        }>('/api/data/schema');

        if (cancelled) return;
        setDbml(data.dbml);
        setDataFiles(data.dataFiles);

        syncStore.setPhase('loading_tables');

        const { tables } = await api.get<{ tables: TableInfo[] }>('/api/data/tables');
        if (cancelled) return;

        const loadPromises = tables.map(async (t) => {
          try {
            const tableData = await api.get<TableRows>(`/api/data/rows?table=${encodeURIComponent(t.name)}`);
            if (!cancelled && tableData.rows.length > 0) {
              registerTable(t.name, tableData.rows);
            }
          } catch { /* individual table failure is non-fatal */ }
        });

        await Promise.all(loadPromises);
        if (!cancelled) syncStore.finishSync();
      } catch (err) {
        if (!cancelled) {
          syncStore.finishSync(err instanceof Error ? err.message : 'Failed to load data');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      syncStore.finishSync();
    };
  }, []);
}
