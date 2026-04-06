import alasql from 'alasql';
import { replaceReservedWords, toSafeTableName } from '@datamaster/shared';

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

let initialized = false;

export function registerTable(name: string, rows: Record<string, unknown>[]): void {
  const safeName = toSafeTableName(name);
  try {
    alasql(`DROP TABLE IF EXISTS [${safeName}]`);
  } catch { /* table might not exist */ }

  if (rows.length === 0) return;

  alasql(`CREATE TABLE [${safeName}]`);
  alasql.tables[safeName].data = [...rows];
  initialized = true;
}

export function executeQuery(sql: string): QueryResult {
  const start = performance.now();
  const safeSql = replaceReservedWords(sql);

  try {
    const result = alasql(safeSql);
    const executionTime = performance.now() - start;

    if (!Array.isArray(result) || result.length === 0) {
      return { columns: [], rows: [], rowCount: 0, executionTime };
    }

    const columns = Object.keys(result[0]);
    return { columns, rows: result, rowCount: result.length, executionTime };
  } catch (err) {
    throw new Error(`SQL Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function getTableNames(): string[] {
  return Object.keys(alasql.tables);
}

export function isInitialized(): boolean {
  return initialized;
}
