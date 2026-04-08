import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getCachedData, loadGameData, invalidateCache } from '../services/data/dataService.js';
import { getKeyMap, getLanguages, type StringEntry } from '../services/google/stringDataService.js';

const SAMPLE_SIZE = 30;
const MATCH_THRESHOLD = 0.3;

function detectStringKeyColumns(
  headers: string[],
  rows: Record<string, unknown>[],
  keyMap: Map<string, StringEntry>,
): string[] {
  if (keyMap.size === 0 || rows.length === 0) return [];

  const sampleRows = rows.slice(0, SAMPLE_SIZE);
  const matched: string[] = [];

  for (const col of headers) {
    let hits = 0;
    let checked = 0;
    for (const row of sampleRows) {
      const val = row[col];
      if (typeof val !== 'string' || !val) continue;
      checked++;
      if (keyMap.has(val)) hits++;
    }
    if (checked > 0 && hits / checked >= MATCH_THRESHOLD) {
      matched.push(col);
    }
  }
  return matched;
}

function enrichWithLocalization(
  headers: string[],
  rows: Record<string, unknown>[],
): { headers: string[]; rows: Record<string, unknown>[] } {
  const keyMap = getKeyMap();
  const languages = getLanguages();
  if (keyMap.size === 0 || languages.length === 0) return { headers, rows };

  const stringCols = detectStringKeyColumns(headers, rows, keyMap);
  if (stringCols.length === 0) return { headers, rows };

  const newHeaders = [...headers];
  for (const col of stringCols) {
    const idx = newHeaders.indexOf(col);
    const langCols = languages.map((lang) => `${col}_${lang}`);
    newHeaders.splice(idx + 1, 0, ...langCols);
  }

  const newRows = rows.map((row) => {
    const enriched = { ...row };
    for (const col of stringCols) {
      const key = row[col];
      if (typeof key === 'string' && key) {
        const entry = keyMap.get(key);
        if (entry) {
          for (const lang of languages) {
            enriched[`${col}_${lang}`] = entry[lang] ?? '';
          }
        }
      }
    }
    return enriched;
  });

  return { headers: newHeaders, rows: newRows };
}

export async function dataRoutes(app: FastifyInstance) {
  app.post('/query', async (request, reply) => {
    const { sql } = request.body as { sql?: string };
    if (!sql || typeof sql !== 'string') {
      reply.status(400).send({ error: 'sql parameter required' });
      return;
    }
    try {
      const { serverExecuteQuery } = await import('../services/data/serverQueryEngine.js');
      const result = serverExecuteQuery(sql);
      return result;
    } catch (err) {
      reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/reload', async () => {
    const dataRepoDir = resolve(config.GIT_CLONE_BASE_DIR, 'data');
    invalidateCache();
    await loadGameData(dataRepoDir, config.REPO_SCHEMA_SUBPATH, config.REPO_DATA_SUBPATH);
    const data = getCachedData();
    return {
      success: true,
      dataFiles: data?.dataFiles.length ?? 0,
      schemaFiles: data?.schemaFiles.length ?? 0,
      timestamp: data?.timestamp,
    };
  });

  app.get('/schema', async (_request, reply) => {
    const data = getCachedData();
    if (!data) {
      reply.status(503).send({ error: 'Data not loaded yet. Trigger /api/git/sync first.' });
      return;
    }

    return {
      dbml: data.dbml,
      dataFiles: data.dataFiles.map((f) => f.fileName),
      schemaFiles: data.schemaFiles.map((f) => f.fileName),
      timestamp: data.timestamp,
    };
  });

  app.get('/tables', async (_request, reply) => {
    const data = getCachedData();
    if (!data) {
      reply.status(503).send({ error: 'Data not loaded yet.' });
      return;
    }

    const tables = data.dataFiles.flatMap((file) =>
      file.sheets.map((sheet) => ({
        name: sheet.name,
        fileName: file.fileName,
        headers: sheet.headers,
        rowCount: sheet.rows.length,
      })),
    );

    return { tables };
  });

  app.get<{ Querystring: { table: string } }>('/rows', async (request, reply) => {
    const data = getCachedData();
    if (!data) {
      reply.status(503).send({ error: 'Data not loaded yet.' });
      return;
    }

    const { table } = request.query;
    for (const file of data.dataFiles) {
      const sheet = file.sheets.find((s) => s.name === table);
      if (sheet) {
        const { headers: enrichedHeaders, rows: enrichedRows } = enrichWithLocalization(
          sheet.headers,
          sheet.rows,
        );
        return { name: sheet.name, headers: enrichedHeaders, rows: enrichedRows };
      }
    }

    reply.status(404).send({ error: `Table '${table}' not found` });
  });

  app.post('/diff', async (request, reply) => {
    const { table, id, from, to } = request.body as { table?: string; id?: string | number; from?: string; to?: string };
    if (!table) return reply.status(400).send({ error: 'table required' });

    const { execSync } = await import('child_process');
    const { resolve: resolvePath } = await import('path');
    const { parseExcelBuffer } = await import('../services/data/excelParser.js');

    const repoDir = resolvePath(config.GIT_CLONE_BASE_DIR, 'data');
    const older = from || 'HEAD~1';
    const newer = to || 'HEAD';

    let changedFiles: string[];
    try {
      const raw = execSync(`git diff --name-only ${older} ${newer}`, { cwd: repoDir, encoding: 'utf-8' });
      changedFiles = raw.trim().split('\n').filter((f: string) => /\.xlsx?$/i.test(f));
    } catch {
      return reply.status(400).send({ error: 'Failed to get diff. Check commit hashes.' });
    }

    const results: { table: string; pkField: string; changes: unknown[] }[] = [];

    for (const filePath of changedFiles) {
      let oldBuf: Buffer | null = null;
      let newBuf: Buffer | null = null;
      try { oldBuf = execSync(`git show ${older}:"${filePath}"`, { cwd: repoDir, maxBuffer: 50 * 1024 * 1024 }); } catch {}
      try { newBuf = execSync(`git show ${newer}:"${filePath}"`, { cwd: repoDir, maxBuffer: 50 * 1024 * 1024 }); } catch {}

      const oldFile = oldBuf ? parseExcelBuffer(oldBuf, filePath) : null;
      const newFile = newBuf ? parseExcelBuffer(newBuf, filePath) : null;

      for (const sheetName of new Set([...(oldFile?.sheets.map(s => s.name) ?? []), ...(newFile?.sheets.map(s => s.name) ?? [])])) {
        if (!sheetName.toLowerCase().includes(table.toLowerCase())) continue;
        const oldSheet = oldFile?.sheets.find(s => s.name === sheetName);
        const newSheet = newFile?.sheets.find(s => s.name === sheetName);
        if (!oldSheet && !newSheet) continue;

        const pkField = (newSheet ?? oldSheet)!.headers.find(h => h.toLowerCase() === 'id') || (newSheet ?? oldSheet)!.headers[0];
        const oldMap = new Map<string, Record<string, unknown>>();
        if (oldSheet) for (const row of oldSheet.rows) { const k = String(row[pkField] ?? ''); if (k) oldMap.set(k, row); }
        const newMap = new Map<string, Record<string, unknown>>();
        if (newSheet) for (const row of newSheet.rows) { const k = String(row[pkField] ?? ''); if (k) newMap.set(k, row); }

        const changes: unknown[] = [];
        for (const [key, newRow] of newMap) {
          if (id !== undefined && String(id) !== key) continue;
          if (!oldMap.has(key)) {
            changes.push({ type: 'added', id: newRow[pkField], row: newRow });
          } else {
            const oldRow = oldMap.get(key)!;
            const diffs: { field: string; old: unknown; new: unknown }[] = [];
            for (const field of new Set([...Object.keys(oldRow), ...Object.keys(newRow)])) {
              if (String(oldRow[field] ?? '') !== String(newRow[field] ?? '')) {
                diffs.push({ field, old: oldRow[field], new: newRow[field] });
              }
            }
            if (diffs.length > 0) changes.push({ type: 'modified', id: newRow[pkField], changes: diffs, oldRow, newRow });
          }
        }
        for (const [key, oldRow] of oldMap) {
          if (id !== undefined && String(id) !== key) continue;
          if (!newMap.has(key)) changes.push({ type: 'removed', id: oldRow[pkField], row: oldRow });
        }

        if (changes.length > 0) results.push({ table: sheetName, pkField, changes });
      }
    }

    return { from: older, to: newer, results };
  });
}
