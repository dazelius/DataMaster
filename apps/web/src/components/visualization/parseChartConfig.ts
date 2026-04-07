import type { ChartConfig, ChartType, StatConfig, StatType, DataItem, ProgressItem } from './types';

const CHART_TYPES = new Set<ChartType>(['bar', 'line', 'area', 'pie', 'radar', 'scatter', 'treemap', 'funnel', 'timeline']);
const STAT_TYPES = new Set<StatType>(['kpi', 'sparkline', 'progress', 'compare']);

function parseValue(raw: string): string | number {
  const trimmed = raw.trim();
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;
  return trimmed;
}

/**
 * Parse `- key: val, key: val` lines into DataItem[]
 */
function parseDataBlock(lines: string[]): DataItem[] {
  const items: DataItem[] = [];
  for (const line of lines) {
    const stripped = line.replace(/^-\s*/, '').trim();
    if (!stripped) continue;
    const item: DataItem = {};
    for (const pair of stripped.split(/,\s*/)) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const key = pair.slice(0, colonIdx).trim();
      const val = pair.slice(colonIdx + 1).trim();
      item[key] = parseValue(val);
    }
    if (Object.keys(item).length > 0) items.push(item);
  }
  return items;
}

function parseProgressItems(lines: string[]): ProgressItem[] {
  const items: ProgressItem[] = [];
  for (const line of lines) {
    const stripped = line.replace(/^-\s*/, '').trim();
    if (!stripped) continue;
    const obj: Record<string, string> = {};
    for (const pair of stripped.split(/,\s*/)) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      obj[pair.slice(0, colonIdx).trim()] = pair.slice(colonIdx + 1).trim();
    }
    items.push({
      label: obj.label ?? '',
      value: Number(obj.value) || 0,
      max: Number(obj.max) || 100,
    });
  }
  return items;
}

function extractField(lines: string[], key: string): string | undefined {
  for (const line of lines) {
    const match = line.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'i'));
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractBlockLines(lines: string[], key: string): string[] | null {
  const startIdx = lines.findIndex((l) => new RegExp(`^${key}\\s*:`, 'i').test(l));
  if (startIdx === -1) return null;
  const blockLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('-')) {
      blockLines.push(lines[i]);
    } else if (blockLines.length > 0) {
      break;
    }
  }
  return blockLines.length > 0 ? blockLines : null;
}

export function parseChartBlock(raw: string): ChartConfig | null {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const typeStr = extractField(lines, 'type');
  if (!typeStr || !CHART_TYPES.has(typeStr as ChartType)) return null;

  const yRaw = extractField(lines, 'y');

  const dataLines = extractBlockLines(lines, 'data');
  const data = dataLines ? parseDataBlock(dataLines) : undefined;

  return {
    type: typeStr as ChartType,
    title: extractField(lines, 'title'),
    sql: extractField(lines, 'sql'),
    x: extractField(lines, 'x'),
    y: yRaw ? yRaw.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : undefined,
    data,
    stacked: extractField(lines, 'stacked') === 'true',
    horizontal: extractField(lines, 'horizontal') === 'true',
  };
}

export function parseStatBlock(raw: string): StatConfig | null {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const typeStr = extractField(lines, 'type');
  if (!typeStr || !STAT_TYPES.has(typeStr as StatType)) return null;

  const keysRaw = extractField(lines, 'keys');
  const itemsLines = extractBlockLines(lines, 'items');
  const dataLines = extractBlockLines(lines, 'data');

  const valueRaw = extractField(lines, 'value');

  return {
    type: typeStr as StatType,
    title: extractField(lines, 'title'),
    sql: extractField(lines, 'sql'),
    value: valueRaw != null ? parseValue(valueRaw) : undefined,
    change: extractField(lines, 'change'),
    y: extractField(lines, 'y'),
    keys: keysRaw ? keysRaw.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : undefined,
    items: itemsLines ? parseProgressItems(itemsLines) : undefined,
    data: dataLines ? parseDataBlock(dataLines) : undefined,
  };
}
