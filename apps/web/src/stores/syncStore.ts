import { create } from 'zustand';

interface SyncState {
  isSyncing: boolean;
  lastSync: number | null;
  error: string | null;
  startSync: () => void;
  finishSync: (error?: string) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSync: null,
  error: null,
  startSync: () => set({ isSyncing: true, error: null }),
  finishSync: (error) =>
    set({
      isSyncing: false,
      lastSync: error ? null : Date.now(),
      error: error ?? null,
    }),
}));
