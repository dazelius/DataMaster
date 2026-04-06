import { create } from 'zustand';

export interface RepoSyncStatus {
  id: string;
  status: 'pending' | 'syncing' | 'loading_data' | 'done' | 'error';
  message?: string;
}

interface SyncState {
  isSyncing: boolean;
  lastSync: number | null;
  error: string | null;
  repos: RepoSyncStatus[];
  phase: string;

  startSync: (repos?: string[]) => void;
  setRepoStatus: (repoId: string, status: RepoSyncStatus['status'], message?: string) => void;
  setPhase: (phase: string) => void;
  finishSync: (error?: string) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSync: null,
  error: null,
  repos: [],
  phase: '',

  startSync: (repos) =>
    set({
      isSyncing: true,
      error: null,
      phase: 'syncing',
      repos: (repos ?? []).map((id) => ({ id, status: 'pending' })),
    }),

  setRepoStatus: (repoId, status, message) =>
    set((s) => ({
      repos: s.repos.map((r) => (r.id === repoId ? { ...r, status, message } : r)),
    })),

  setPhase: (phase) => set({ phase }),

  finishSync: (error) =>
    set({
      isSyncing: false,
      lastSync: error ? null : Date.now(),
      error: error ?? null,
      phase: error ? 'error' : 'done',
    }),
}));
