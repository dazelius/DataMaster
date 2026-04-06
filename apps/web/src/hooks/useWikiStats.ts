import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

interface WikiStats {
  totalPages: number;
  recentCount: number;
  categoryCounts: Record<string, number>;
  lastUpdated: string | null;
  recentPages: { path: string; title: string; updated: string; action: string; category: string; tags: string[]; confidence: string; agoMs: number; summary: string }[];
}

const EMPTY: WikiStats = { totalPages: 0, recentCount: 0, categoryCounts: {}, lastUpdated: null, recentPages: [] };

let cachedStats: WikiStats = EMPTY;
let lastFetch = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

async function fetchStats() {
  try {
    cachedStats = await api.get<WikiStats>('/api/wiki/stats');
    lastFetch = Date.now();
    notify();
  } catch {
    // server not ready yet
  }
}

export function useWikiStats(pollIntervalMs = 30_000) {
  const [stats, setStats] = useState(cachedStats);

  const refresh = useCallback(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const handler = () => setStats({ ...cachedStats });
    listeners.add(handler);

    if (Date.now() - lastFetch > pollIntervalMs) fetchStats();

    const timer = setInterval(fetchStats, pollIntervalMs);
    return () => {
      listeners.delete(handler);
      clearInterval(timer);
    };
  }, [pollIntervalMs]);

  return { stats, refresh };
}
