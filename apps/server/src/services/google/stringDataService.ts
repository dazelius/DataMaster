import * as gsheets from './googleSheetsService.js';
import { config } from '../../config.js';

export interface StringEntry {
  key: string;
  [lang: string]: string;
}

export interface StringDataSheet {
  sheetName: string;
  languages: string[];
  flagKeys: Record<string, string>;
  entries: StringEntry[];
}

interface StringDataCache {
  sheets: StringDataSheet[];
  allEntries: StringEntry[];
  languages: string[];
  timestamp: number;
}

let cache: StringDataCache | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let onReload: (() => void) | null = null;

function parseSheet(sheetName: string, raw: string[][]): StringDataSheet | null {
  if (raw.length < 2) return null;

  const headerRow = raw[0].map((v) => String(v ?? '').trim());
  if (!headerRow[0]) return null;

  const languages = headerRow.slice(1).filter(Boolean);
  if (languages.length === 0) return null;

  const flagKeys: Record<string, string> = {};
  let dataStartRow = 1;

  if (raw.length > 1) {
    const secondRow = raw[1].map((v) => String(v ?? '').trim());
    const firstCell = secondRow[0]?.toLowerCase();
    if (firstCell === 'flagkey' || firstCell === 'flag') {
      for (let c = 1; c < headerRow.length && c < secondRow.length; c++) {
        if (headerRow[c] && secondRow[c]) {
          flagKeys[headerRow[c]] = secondRow[c];
        }
      }
      dataStartRow = 2;
    }
  }

  const entries: StringEntry[] = [];
  for (let r = dataStartRow; r < raw.length; r++) {
    const row = raw[r];
    if (!row || !row[0]) continue;
    const key = String(row[0]).trim();
    if (!key) continue;

    const entry: StringEntry = { key };
    for (let c = 1; c < headerRow.length; c++) {
      const lang = headerRow[c];
      if (!lang) continue;
      entry[lang] = row[c] != null ? String(row[c]) : '';
    }
    entries.push(entry);
  }

  return { sheetName, languages, flagKeys, entries };
}

export async function loadStringData(): Promise<StringDataCache> {
  if (!gsheets.isConfigured()) {
    throw new Error('Google Sheets not configured (GOOGLE_SHEETS_ID is empty)');
  }

  const allRaw = await gsheets.fetchAllSheets();
  const sheets: StringDataSheet[] = [];
  const allEntries: StringEntry[] = [];
  const langSet = new Set<string>();

  for (const [name, raw] of allRaw) {
    const parsed = parseSheet(name, raw);
    if (!parsed) continue;
    sheets.push(parsed);
    for (const lang of parsed.languages) langSet.add(lang);
    allEntries.push(...parsed.entries);
  }

  cache = {
    sheets,
    allEntries,
    languages: [...langSet],
    timestamp: Date.now(),
  };

  console.log(
    `[StringData] Loaded ${allEntries.length} entries from ${sheets.length} sheet(s), languages: ${cache.languages.join(', ')}`,
  );

  return cache;
}

export function getCachedStringData(): StringDataCache | null {
  return cache;
}

export function searchStrings(query: string, lang?: string, limit = 50): StringEntry[] {
  if (!cache) return [];
  const q = query.toLowerCase();

  return cache.allEntries
    .filter((entry) => {
      if (entry.key.toLowerCase().includes(q)) return true;
      if (lang) {
        return (entry[lang] ?? '').toLowerCase().includes(q);
      }
      return Object.values(entry).some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
    })
    .slice(0, limit);
}

export function getStringByKey(key: string): StringEntry | undefined {
  return cache?.allEntries.find((e) => e.key === key);
}

export function getStringStats(): {
  totalEntries: number;
  sheets: { name: string; count: number }[];
  languages: string[];
  missingTranslations: Record<string, number>;
  lastSync: number | null;
} {
  if (!cache) return { totalEntries: 0, sheets: [], languages: [], missingTranslations: {}, lastSync: null };

  const missing: Record<string, number> = {};
  for (const lang of cache.languages) {
    missing[lang] = cache.allEntries.filter((e) => !e[lang]?.trim()).length;
  }

  return {
    totalEntries: cache.allEntries.length,
    sheets: cache.sheets.map((s) => ({ name: s.sheetName, count: s.entries.length })),
    languages: cache.languages,
    missingTranslations: missing,
    lastSync: cache.timestamp,
  };
}

/** Register a callback that runs after each successful auto-sync (e.g. to refresh SQL tables) */
export function setOnReloadCallback(cb: () => void): void {
  onReload = cb;
}

export function startAutoSync(): void {
  if (syncTimer) return;
  const interval = config.GOOGLE_STRINGDATA_SYNC_INTERVAL;
  if (interval <= 0) return;

  syncTimer = setInterval(async () => {
    try {
      await loadStringData();
      onReload?.();
      console.log('[StringData] Auto-sync complete');
    } catch (err) {
      console.warn(`[StringData] Auto-sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, interval);

  console.log(`[StringData] Auto-sync scheduled every ${Math.round(interval / 1000)}s`);
}

export function stopAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
