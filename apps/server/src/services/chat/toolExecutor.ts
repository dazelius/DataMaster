import { z, type ZodSchema } from 'zod';

interface ToolPlugin {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  claudeSchema: Record<string, unknown>;
  execute(input: unknown): Promise<string>;
}

const registry = new Map<string, ToolPlugin>();

export function registerTool(plugin: ToolPlugin): void {
  registry.set(plugin.name, plugin);
}

async function validateQueryBlocks(content: string): Promise<{ line: number; sql: string; status: 'ok' | 'error'; rows?: number; message?: string }[]> {
  const results: { line: number; sql: string; status: 'ok' | 'error'; rows?: number; message?: string }[] = [];
  const queryBlockRegex = /:::query\s*\n([\s\S]*?):::/g;
  let match;
  while ((match = queryBlockRegex.exec(content)) !== null) {
    const blockContent = match[1].trim();
    const lineNum = content.substring(0, match.index).split('\n').length;

    let sql = '';
    for (const line of blockContent.split('\n')) {
      const sqlMatch = line.match(/^sql:\s*(.+)$/i);
      if (sqlMatch) { sql = sqlMatch[1].trim(); break; }
    }
    if (!sql) {
      const singleLine = blockContent.split('\n').find((l) => l.trim().toUpperCase().startsWith('SELECT'));
      if (singleLine) sql = singleLine.trim();
    }
    if (!sql) continue;

    try {
      const { serverExecuteQuery } = await import('../data/serverQueryEngine.js');
      const rows = serverExecuteQuery(sql);
      results.push({ line: lineNum, sql: sql.substring(0, 100), status: 'ok', rows: Array.isArray(rows) ? rows.length : 0 });
    } catch (err) {
      results.push({ line: lineNum, sql: sql.substring(0, 100), status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export async function executeTool(name: string, input: unknown): Promise<string> {
  const tool = registry.get(name);
  if (!tool) return `Unknown tool: ${name}`;

  try {
    const validated = tool.inputSchema.parse(input);
    return await tool.execute(validated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Tool error: ${msg}`;
  }
}

export function getToolDefinitions(): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  return [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.claudeSchema,
  }));
}

// --- Register built-in tools ---

// ── Reverse FK Lookup ──────────────────────────────

registerTool({
  name: 'reverse_fk_lookup',
  description: 'Find all tables/columns that reference a given value. Scans every table in the game data cache for rows where any column matches the specified value. Essential for tracing ID references across tables (e.g., which tables use Passive ID 20011). Returns matching table, column, row count, and sample context.',
  inputSchema: z.object({
    value: z.union([z.string(), z.number()]),
    sourceTable: z.string().optional(),
    sourceColumn: z.string().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      value: { type: ['string', 'number'], description: 'The value to search for across all tables (typically an ID)' },
      sourceTable: { type: 'string', description: 'Optional: source table name (for context in results)' },
      sourceColumn: { type: 'string', description: 'Optional: source column name (for context)' },
    },
    required: ['value'],
  },
  async execute(input) {
    const { value, sourceTable, sourceColumn } = input as { value: string | number; sourceTable?: string; sourceColumn?: string };
    const { getCachedData } = await import('../data/dataService.js');
    const data = getCachedData();
    if (!data) return 'No game data loaded';

    const searchVal = String(value);
    const numVal = Number(value);
    const isNum = !isNaN(numVal);

    const results: { table: string; column: string; matchCount: number; sampleRows: Record<string, unknown>[] }[] = [];

    for (const file of data.dataFiles) {
      for (const sheet of file.sheets) {
        if (sheet.rows.length === 0) continue;

        const columnHits = new Map<string, Record<string, unknown>[]>();

        for (const row of sheet.rows) {
          for (const col of sheet.headers) {
            const cell = row[col];
            if (cell == null) continue;

            const matched = isNum
              ? (cell === numVal || cell === searchVal || String(cell) === searchVal)
              : (String(cell) === searchVal);

            if (matched) {
              if (!columnHits.has(col)) columnHits.set(col, []);
              const arr = columnHits.get(col)!;
              if (arr.length < 3) arr.push(row);
            }
          }
        }

        for (const [col, rows] of columnHits) {
          if (sourceTable && sheet.name === sourceTable && col === (sourceColumn ?? 'id')) continue;
          results.push({
            table: sheet.name,
            column: col,
            matchCount: rows.length < 3 ? rows.length : sheet.rows.filter((r) => {
              const c = r[col];
              return isNum ? (c === numVal || c === searchVal || String(c) === searchVal) : String(c) === searchVal;
            }).length,
            sampleRows: rows.map((r) => {
              const sample: Record<string, unknown> = {};
              const keys = Object.keys(r).slice(0, 6);
              for (const k of keys) sample[k] = r[k];
              return sample;
            }),
          });
        }
      }
    }

    results.sort((a, b) => b.matchCount - a.matchCount);
    const src = sourceTable ? ` (source: ${sourceTable}.${sourceColumn ?? 'id'})` : '';
    return JSON.stringify({ value, references: results.slice(0, 30), totalMatches: results.length, note: `Found ${results.length} column(s) referencing value ${value}${src}` });
  },
});

// ── Data Change Impact ─────────────────────────────

registerTool({
  name: 'data_change_impact',
  description: 'Analyze which wiki pages would be affected by changes to a specific data table. Scans wiki pages for :::query blocks containing the table name and frontmatter sources referencing the table. Optionally checks for specific changed IDs.',
  inputSchema: z.object({
    table: z.string(),
    changed_ids: z.array(z.union([z.string(), z.number()])).optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      table: { type: 'string', description: 'Data table name that changed' },
      changed_ids: { type: 'array', items: { type: ['string', 'number'] }, description: 'Optional: specific IDs that changed' },
    },
    required: ['table'],
  },
  async execute(input) {
    const { table, changed_ids } = input as { table: string; changed_ids?: (string | number)[] };
    const { wikiService } = await import('../wiki/wikiService.js');

    const pages = await wikiService.listPages();
    const affected: { path: string; title: string; reasons: string[] }[] = [];

    const tablePattern = new RegExp(`\\b${table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const idStrings = changed_ids?.map(String) ?? [];

    for (const page of pages) {
      const full = await wikiService.readPage(page.path);
      if (!full) continue;

      const reasons: string[] = [];

      if (full.frontmatter.sources) {
        for (const src of full.frontmatter.sources) {
          if (src.toLowerCase().includes(`table:${table.toLowerCase()}`)) {
            reasons.push(`sources: ${src}`);
          }
        }
      }

      const queryBlocks = [...full.content.matchAll(/:::query\s*\n([\s\S]*?):::/g)];
      for (const block of queryBlocks) {
        const sql = block[1].trim();
        if (tablePattern.test(sql)) {
          let detail = `:::query 블록에서 ${table} 참조`;
          if (idStrings.length > 0) {
            const matchedIds = idStrings.filter((id) => sql.includes(id));
            if (matchedIds.length > 0) detail += ` (ID: ${matchedIds.join(', ')})`;
          }
          reasons.push(detail);
        }
      }

      if (full.content.match(tablePattern) && reasons.length === 0) {
        reasons.push(`본문에서 ${table} 언급`);
      }

      if (reasons.length > 0) {
        affected.push({ path: page.path, title: full.frontmatter.title, reasons });
      }
    }

    return JSON.stringify({ table, changed_ids: changed_ids ?? [], affected_pages: affected, total: affected.length });
  },
});

// ── Confluence Config Extractor ────────────────────

registerTool({
  name: 'confluence_extract_config',
  description: 'Extract structured configuration data from a Confluence page. Parses key-value pairs (e.g., "setting_name = 100"), pipe-delimited tables, and enumeration lists from the page body text. Useful for extracting game design parameters from spec documents.',
  inputSchema: z.object({ pageId: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { pageId: { type: 'string', description: 'Confluence page ID' } },
    required: ['pageId'],
  },
  async execute(input) {
    const { pageId } = input as { pageId: string };
    const { confluenceService } = await import('../atlassian/confluenceService.js');
    const page = await confluenceService.getPage(pageId);
    const body = page.body;
    const lines = body.split('\n');

    const configValues: { key: string; value: string | number; context: string }[] = [];
    const tables: { headers: string[]; rows: string[][] }[] = [];
    const enums: { name: string; values: string[] }[] = [];

    // Key-value extraction: key = value, key: value, key → value
    const kvPattern = /([a-zA-Z_][a-zA-Z0-9_.]*)\s*[=:→]\s*([-]?\d+(?:\.\d+)?|true|false|"[^"]*")/g;
    for (let i = 0; i < lines.length; i++) {
      let match;
      while ((match = kvPattern.exec(lines[i])) !== null) {
        const key = match[1];
        const rawVal = match[2];
        const numVal = Number(rawVal);
        const value = rawVal === 'true' || rawVal === 'false' ? rawVal : (!isNaN(numVal) ? numVal : rawVal.replace(/^"|"$/g, ''));
        const contextStart = Math.max(0, i - 1);
        const contextEnd = Math.min(lines.length - 1, i + 1);
        const context = lines.slice(contextStart, contextEnd + 1).join(' ').substring(0, 200);
        configValues.push({ key, value, context });
      }
    }

    // Table extraction: pipe-delimited rows
    let tableRows: string[][] = [];
    let tableHeaders: string[] = [];
    for (const line of lines) {
      if (line.includes('|') && line.trim().split('|').filter(Boolean).length >= 2) {
        const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
        if (tableHeaders.length === 0) {
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
      } else if (tableHeaders.length > 0) {
        if (tableRows.length > 0) {
          tables.push({ headers: tableHeaders, rows: tableRows });
        }
        tableHeaders = [];
        tableRows = [];
      }
    }
    if (tableHeaders.length > 0 && tableRows.length > 0) {
      tables.push({ headers: tableHeaders, rows: tableRows });
    }

    // Enum-like lists: numbered items or dash-prefixed items under a heading
    const enumPattern = /(?:^|\n)([A-Z][A-Za-z0-9_ ]*(?:Type|Mode|State|Category|Kind|Enum))\s*[:\n]/g;
    let enumMatch;
    while ((enumMatch = enumPattern.exec(body)) !== null) {
      const startIdx = enumMatch.index + enumMatch[0].length;
      const slice = body.substring(startIdx, startIdx + 500);
      const items = [...slice.matchAll(/^[-•*\d.)\s]+(.+)/gm)].map((m) => m[1].trim()).filter((v) => v.length > 0 && v.length < 100);
      if (items.length >= 2) {
        enums.push({ name: enumMatch[1].trim(), values: items.slice(0, 20) });
      }
    }

    return JSON.stringify({
      pageId,
      title: page.title,
      config_values: configValues,
      tables: tables.slice(0, 10),
      enums,
      summary: `Extracted ${configValues.length} config values, ${tables.length} tables, ${enums.length} enums from "${page.title}"`,
    });
  },
});

// ── Wiki Dependency Graph Query ────────────────────

registerTool({
  name: 'wiki_dependency_graph',
  description: 'Query the wiki dependency graph for a specific page. Shows which pages link to it (inbound), which pages it links to (outbound), and distinguishes between regular [[wikilinks]] and ![[embeds]]. Useful for impact analysis before modifying a page.',
  inputSchema: z.object({
    path: z.string(),
    direction: z.enum(['inbound', 'outbound', 'both']).optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Wiki page path (e.g., "entities/kaya")' },
      direction: { type: 'string', enum: ['inbound', 'outbound', 'both'], description: 'Direction to query (default: both)' },
    },
    required: ['path'],
  },
  async execute(input) {
    const { path, direction = 'both' } = input as { path: string; direction?: string };
    const { wikiService } = await import('../wiki/wikiService.js');
    const graph = await wikiService.getGraph();
    const pages = await wikiService.listPages();

    const linked_by: string[] = [];
    const embedded_by: string[] = [];
    const links_to: string[] = [];
    const embeds: string[] = [];

    if (direction === 'inbound' || direction === 'both') {
      const inbound = graph.edges.filter((e) => e.target === path && !e.source.startsWith('#'));
      for (const edge of inbound) {
        const srcPage = await wikiService.readPage(edge.source);
        if (!srcPage) { linked_by.push(edge.source); continue; }
        const embedPattern = new RegExp(`!\\[\\[${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]+)?\\]\\]`);
        if (embedPattern.test(srcPage.content)) {
          embedded_by.push(edge.source);
        } else {
          linked_by.push(edge.source);
        }
      }
    }

    if (direction === 'outbound' || direction === 'both') {
      const currentPage = await wikiService.readPage(path);
      if (currentPage) {
        const wikilinks = [...currentPage.content.matchAll(/(!?)\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
        for (const m of wikilinks) {
          const isEmbed = m[1] === '!';
          const target = m[2].trim();
          if (target.startsWith('#')) continue;
          if (isEmbed) {
            if (!embeds.includes(target)) embeds.push(target);
          } else {
            if (!links_to.includes(target)) links_to.push(target);
          }
        }
      }
    }

    return JSON.stringify({
      path,
      direction,
      embedded_by,
      linked_by,
      links_to,
      embeds,
      total_inbound: embedded_by.length + linked_by.length,
      total_outbound: links_to.length + embeds.length,
    });
  },
});

registerTool({
  name: 'query_game_data',
  description: 'Execute a SQL query on game data tables. Returns actual query results as JSON. Use standard SQL syntax. Table names that are SQL reserved words use aliases (e.g., Level → __u_level). Max 50 rows returned.',
  inputSchema: z.object({ sql: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { sql: { type: 'string', description: 'SQL query to execute (alasql syntax)' } },
    required: ['sql'],
  },
  async execute(input) {
    const { sql } = input as { sql: string };
    try {
      const { serverExecuteQuery } = await import('../data/serverQueryEngine.js');
      const result = serverExecuteQuery(sql);
      return JSON.stringify(result);
    } catch (err) {
      return `SQL Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

registerTool({
  name: 'show_table_schema',
  description: 'Show the schema (columns, types) of a specific game data table.',
  inputSchema: z.object({ tableName: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { tableName: { type: 'string', description: 'Table name to inspect' } },
    required: ['tableName'],
  },
  async execute(input) {
    const { tableName } = input as { tableName: string };
    const { getCachedData } = await import('../data/dataService.js');
    const data = getCachedData();
    if (!data) return 'Data not loaded yet';

    for (const file of data.dataFiles) {
      const sheet = file.sheets.find((s) => s.name === tableName);
      if (sheet) {
        return JSON.stringify({
          table: tableName,
          columns: sheet.headers,
          rowCount: sheet.rows.length,
          sampleRow: sheet.rows[0] ?? null,
        });
      }
    }
    return `Table '${tableName}' not found`;
  },
});

registerTool({
  name: 'query_git_history',
  description: 'Get recent git commit history for data or code repository.',
  inputSchema: z.object({
    repo: z.enum(['data', 'code']).default('data'),
    limit: z.number().default(10),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', enum: ['data', 'code'], description: 'Repository to query' },
      limit: { type: 'number', description: 'Max commits to return' },
    },
    required: [],
  },
  async execute(input) {
    const { repo, limit } = input as { repo: string; limit: number };
    const { gitService } = await import('../git/gitService.js');
    const result = await gitService.getLog(repo, limit);
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'show_revision_diff',
  description: 'Show the diff between two git commits.',
  inputSchema: z.object({
    repo: z.enum(['data', 'code']).default('data'),
    from: z.string(),
    to: z.string(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', enum: ['data', 'code'] },
      from: { type: 'string', description: 'Source commit hash' },
      to: { type: 'string', description: 'Target commit hash' },
    },
    required: ['from', 'to'],
  },
  async execute(input) {
    const { repo, from, to } = input as { repo: string; from: string; to: string };
    const { gitService } = await import('../git/gitService.js');
    const diff = await gitService.getDiff(repo, from, to);
    return JSON.stringify(diff);
  },
});

registerTool({
  name: 'data_diff_summary',
  description: 'Compare game data (Excel) between two git commits and return structured row-level changes (added, removed, modified rows with old/new values). Useful for understanding exactly what changed in a data update. If only one commit is given, compares it against its parent.',
  inputSchema: z.object({
    commit: z.string().optional(),
    parentCommit: z.string().optional(),
    tables: z.array(z.string()).optional(),
    limit: z.number().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      commit: { type: 'string', description: 'The newer commit hash. Default: HEAD (latest).' },
      parentCommit: { type: 'string', description: 'The older commit hash. Default: parent of commit (commit~1).' },
      tables: { type: 'array', items: { type: 'string' }, description: 'Filter to specific table/sheet names. Default: all.' },
      limit: { type: 'number', description: 'Max changes per table. Default: 50.' },
    },
    required: [],
  },
  async execute(input) {
    const { commit = 'HEAD', parentCommit, tables, limit = 50 } = input as {
      commit?: string; parentCommit?: string; tables?: string[]; limit?: number;
    };
    const { execSync } = await import('child_process');
    const { resolve } = await import('path');
    const { config } = await import('../../config.js');
    const { parseExcelBuffer } = await import('../data/excelParser.js');

    const repoDir = resolve(config.GIT_CLONE_BASE_DIR, 'data');
    const older = parentCommit || `${commit}~1`;

    let changedFiles: string[];
    try {
      const raw = execSync(`git diff --name-only ${older} ${commit}`, { cwd: repoDir, encoding: 'utf-8' });
      changedFiles = raw.trim().split('\n').filter((f) => /\.xlsx?$/i.test(f));
    } catch {
      return JSON.stringify({ error: 'Failed to get diff. Check commit hashes.', commit, older });
    }

    if (changedFiles.length === 0) {
      return JSON.stringify({ message: 'No Excel data files changed between these commits.', commit, older });
    }

    interface RowChange {
      type: 'added' | 'removed' | 'modified';
      id: unknown;
      changes?: { field: string; old: unknown; new: unknown }[];
      row?: Record<string, unknown>;
    }

    const results: { file: string; table: string; added: number; removed: number; modified: number; details: RowChange[] }[] = [];

    for (const filePath of changedFiles) {
      let oldBuf: Buffer | null = null;
      let newBuf: Buffer | null = null;

      try {
        oldBuf = execSync(`git show ${older}:"${filePath}"`, { cwd: repoDir, maxBuffer: 50 * 1024 * 1024 });
      } catch { /* file didn't exist in older commit */ }

      try {
        newBuf = execSync(`git show ${commit}:"${filePath}"`, { cwd: repoDir, maxBuffer: 50 * 1024 * 1024 });
      } catch { /* file deleted in newer commit */ }

      const oldFile = oldBuf ? parseExcelBuffer(oldBuf, filePath) : null;
      const newFile = newBuf ? parseExcelBuffer(newBuf, filePath) : null;

      const allSheets = new Set([
        ...(oldFile?.sheets.map((s) => s.name) ?? []),
        ...(newFile?.sheets.map((s) => s.name) ?? []),
      ]);

      for (const sheetName of allSheets) {
        if (tables && tables.length > 0 && !tables.some((t) => sheetName.toLowerCase().includes(t.toLowerCase()))) continue;

        const oldSheet = oldFile?.sheets.find((s) => s.name === sheetName);
        const newSheet = newFile?.sheets.find((s) => s.name === sheetName);

        if (!oldSheet && !newSheet) continue;

        const pkField = (newSheet ?? oldSheet)!.headers.find((h) => h.toLowerCase() === 'id') || (newSheet ?? oldSheet)!.headers[0];

        const oldMap = new Map<string, Record<string, unknown>>();
        if (oldSheet) {
          for (const row of oldSheet.rows) {
            const key = String(row[pkField] ?? '');
            if (key) oldMap.set(key, row);
          }
        }

        const newMap = new Map<string, Record<string, unknown>>();
        if (newSheet) {
          for (const row of newSheet.rows) {
            const key = String(row[pkField] ?? '');
            if (key) newMap.set(key, row);
          }
        }

        const details: RowChange[] = [];
        let added = 0, removed = 0, modified = 0;

        for (const [key, newRow] of newMap) {
          if (!oldMap.has(key)) {
            added++;
            if (details.length < limit) details.push({ type: 'added', id: newRow[pkField], row: newRow });
          } else {
            const oldRow = oldMap.get(key)!;
            const changes: { field: string; old: unknown; new: unknown }[] = [];
            const allFields = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
            for (const field of allFields) {
              const ov = oldRow[field], nv = newRow[field];
              if (String(ov ?? '') !== String(nv ?? '')) {
                changes.push({ field, old: ov, new: nv });
              }
            }
            if (changes.length > 0) {
              modified++;
              if (details.length < limit) details.push({ type: 'modified', id: newRow[pkField], changes });
            }
          }
        }

        for (const [key, oldRow] of oldMap) {
          if (!newMap.has(key)) {
            removed++;
            if (details.length < limit) details.push({ type: 'removed', id: oldRow[pkField], row: oldRow });
          }
        }

        if (added > 0 || removed > 0 || modified > 0) {
          results.push({ file: filePath, table: sheetName, added, removed, modified, details });
        }
      }
    }

    if (results.length === 0) {
      return JSON.stringify({ message: 'Excel files changed but no row-level differences detected.', changedFiles });
    }

    return JSON.stringify({
      commit,
      parentCommit: older,
      changedFiles: changedFiles.length,
      summary: results.map((r) => ({ table: r.table, added: r.added, removed: r.removed, modified: r.modified })),
      details: results,
    });
  },
});

// --- Wiki Tools ---

registerTool({
  name: 'list_tables',
  description: 'List all available game data tables with their row counts and column names. Use this to discover what raw data is available for ingesting into the wiki.',
  inputSchema: z.object({}),
  claudeSchema: { type: 'object', properties: {}, required: [] },
  async execute() {
    const { getCachedData } = await import('../data/dataService.js');
    const data = getCachedData();
    if (!data) return 'Data not loaded yet';
    const tables = data.dataFiles.flatMap((f) =>
      f.sheets.map((s) => ({
        name: s.name,
        rows: s.rows.length,
        columns: s.headers,
      })),
    );
    return JSON.stringify(tables);
  },
});

registerTool({
  name: 'wiki_search',
  description: `Search the compiled wiki knowledge base. Supports both text search (BM25) and structured frontmatter filters, or both combined.
- Text only: { query: "전술 기동" }
- Filter only: { filter: { confidence: "medium" } } → confidence가 medium인 모든 페이지
- Filter only: { filter: { tags: ["code-analysis"], sources_contain: "CharacterStat" } }
- Combined: { query: "프리드웬", filter: { category: "entities" } } → entities/ 내에서 텍스트 검색
Always check wiki FIRST before querying raw data.`,
  inputSchema: z.object({
    query: z.string().optional(),
    filter: z.object({
      tags: z.array(z.string()).optional(),
      confidence: z.enum(['low', 'medium', 'high']).optional(),
      sources_contain: z.string().optional(),
      category: z.string().optional(),
      has_tag: z.string().optional(),
    }).optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text search query (BM25). Optional if filter is provided.' },
      filter: {
        type: 'object',
        description: 'Structured frontmatter filters. Can combine with query for filtered text search.',
        properties: {
          tags: { type: 'array', items: { type: 'string' }, description: 'Pages must have ALL of these tags' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by confidence level' },
          sources_contain: { type: 'string', description: 'Sources array must contain this substring (e.g. "CharacterStat")' },
          category: { type: 'string', description: 'Limit to category directory (e.g. "entities", "concepts")' },
          has_tag: { type: 'string', description: 'Page must have this specific tag' },
        },
      },
    },
    required: [],
  },
  async execute(input) {
    const { query, filter } = input as {
      query?: string;
      filter?: { tags?: string[]; confidence?: string; sources_contain?: string; category?: string; has_tag?: string };
    };
    const { wikiService } = await import('../wiki/wikiService.js');

    if (filter && (filter.tags || filter.confidence || filter.sources_contain || filter.category || filter.has_tag)) {
      const results = await wikiService.searchPagesAdvanced({ query, ...filter });
      return JSON.stringify(results.slice(0, 20));
    }

    if (query) {
      const results = await wikiService.searchPages(query);
      return JSON.stringify(results.slice(0, 10));
    }

    return JSON.stringify({ error: 'Provide query and/or filter' });
  },
});

registerTool({
  name: 'wiki_read',
  description: 'Read a specific compiled wiki page by path. Use to retrieve previously accumulated knowledge before re-querying raw data. Example paths: "entities/character", "concepts/damage-formula", "analysis/stat-comparison".',
  inputSchema: z.object({ path: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Wiki page path (without .md)' } },
    required: ['path'],
  },
  async execute(input) {
    const { path } = input as { path: string };
    const { wikiService } = await import('../wiki/wikiService.js');
    const page = await wikiService.readPage(path);
    if (!page) return `Wiki page '${path}' not found`;
    return JSON.stringify(page);
  },
});

registerTool({
  name: 'wiki_write',
  description: 'Create or update a wiki page to PERSIST knowledge. IMPORTANT: Content is streamed via <<<>>> markers in your text message — set content to empty string "". ALWAYS include sources array. Use [[wikilinks]] for cross-references and ![[page]] for Obsidian embeds. Categories: entities/ (game entities), concepts/ (mechanics/formulas), analysis/ (findings/comparisons), guides/ (how-to).',
  inputSchema: z.object({
    path: z.string(),
    title: z.string(),
    content: z.string().optional().default(''),
    tags: z.array(z.string()).optional(),
    sources: z.array(z.string()).optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Page path (e.g. "entities/character")' },
      title: { type: 'string', description: 'Page title' },
      content: { type: 'string', description: 'Leave empty — content is auto-captured from <<<>>> markers in your text message' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
      sources: { type: 'array', items: { type: 'string' }, description: 'REQUIRED. Information sources (e.g. "table:Character", "jira:AEGIS-123", "confluence:전술공방전 (id:12345)", "git:abc1234", "user:유저설명")' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'high=DB/공식문서 확인, medium=추론, low=불확실' },
    },
    required: ['path', 'title'],
  },
  async execute(input) {
    const { path, title, content, tags, sources, confidence } = input as {
      path: string; title: string; content: string; tags?: string[]; sources?: string[]; confidence?: 'low' | 'medium' | 'high';
    };
    const { wikiService } = await import('../wiki/wikiService.js');
    await wikiService.writePage(path, { title, tags, sources, confidence }, content);

    let query_validation: { line: number; sql: string; status: string; rows?: number; message?: string }[] | undefined;
    if (content && content.includes(':::query')) {
      try {
        query_validation = await validateQueryBlocks(content);
      } catch { /* validation is best-effort */ }
    }

    const result: Record<string, unknown> = { success: true, path, title, sourcesCount: sources?.length ?? 0 };
    if (query_validation && query_validation.length > 0) result.query_validation = query_validation;
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'wiki_patch',
  description: `Partially modify an existing wiki page without rewriting the entire content. Use instead of wiki_write when making small/targeted changes. Supports multiple operations in one call:
- append: Add content to the end
- prepend: Add content to the beginning  
- replace_section: Replace a specific ## section by heading name (creates it if missing)
- find_replace: Replace first occurrence of exact text
- find_replace_all: Replace all occurrences of exact text
- delete_section: Remove an entire section by heading name
- update_frontmatter: Add tags, sources, or change confidence`,
  inputSchema: z.object({
    path: z.string(),
    operations: z.array(z.object({
      op: z.enum(['append', 'prepend', 'replace_section', 'find_replace', 'find_replace_all', 'delete_section', 'update_frontmatter']),
      content: z.string().optional(),
      section: z.string().optional(),
      find: z.string().optional(),
      replace: z.string().optional(),
      tags: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional(),
      confidence: z.enum(['low', 'medium', 'high']).optional(),
    })),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Wiki page path to patch (must already exist)' },
      operations: {
        type: 'array',
        description: 'Array of patch operations to apply in order',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['append', 'prepend', 'replace_section', 'find_replace', 'find_replace_all', 'delete_section', 'update_frontmatter'] },
            content: { type: 'string', description: 'New content (for append/prepend/replace_section)' },
            section: { type: 'string', description: 'Section heading text without # (for replace_section/delete_section)' },
            find: { type: 'string', description: 'Exact text to find (for find_replace/find_replace_all)' },
            replace: { type: 'string', description: 'Replacement text (for find_replace/find_replace_all)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags to set (update_frontmatter)' },
            sources: { type: 'array', items: { type: 'string' }, description: 'Sources to ADD (update_frontmatter, appended to existing)' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Confidence to set (update_frontmatter)' },
          },
          required: ['op'],
        },
      },
    },
    required: ['path', 'operations'],
  },
  async execute(input) {
    const { path, operations } = input as { path: string; operations: Array<Record<string, unknown>> };
    const { wikiService } = await import('../wiki/wikiService.js');
    const ops = operations.map((raw) => {
      const op = raw.op as string;
      switch (op) {
        case 'append': return { op, content: String(raw.content ?? '') } as const;
        case 'prepend': return { op, content: String(raw.content ?? '') } as const;
        case 'replace_section': return { op, section: String(raw.section ?? ''), content: String(raw.content ?? '') } as const;
        case 'find_replace': return { op, find: String(raw.find ?? ''), replace: String(raw.replace ?? '') } as const;
        case 'find_replace_all': return { op, find: String(raw.find ?? ''), replace: String(raw.replace ?? '') } as const;
        case 'delete_section': return { op, section: String(raw.section ?? '') } as const;
        case 'update_frontmatter': return {
          op,
          tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
          sources: Array.isArray(raw.sources) ? raw.sources.map(String) : undefined,
          confidence: raw.confidence as 'low' | 'medium' | 'high' | undefined,
        } as const;
        default: return { op: 'append', content: '' } as const;
      }
    });
    const patchResult = await wikiService.patchPage(path, ops);

    const page = await wikiService.readPage(path);
    if (page && page.content.includes(':::query')) {
      try {
        const qv = await validateQueryBlocks(page.content);
        if (qv.length > 0) (patchResult as Record<string, unknown>).query_validation = qv;
      } catch { /* validation is best-effort */ }
    }

    return JSON.stringify(patchResult);
  },
});

registerTool({
  name: 'wiki_lint',
  description: 'Health-check the wiki: find orphan pages (no inbound links), broken [[wikilinks]], duplicate titles, and identify important entities that lack wiki pages. Use periodically to maintain wiki quality.',
  inputSchema: z.object({}),
  claudeSchema: { type: 'object', properties: {}, required: [] },
  async execute() {
    const { wikiService } = await import('../wiki/wikiService.js');
    const result = await wikiService.lint();
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'wiki_delete',
  description: 'Delete a wiki page by path. Use when a page is outdated, duplicated, or no longer relevant. The user can also request page deletion.',
  inputSchema: z.object({ path: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Wiki page path to delete (e.g. "entities/old-page")' } },
    required: ['path'],
  },
  async execute(input) {
    const { path } = input as { path: string };
    const { wikiService } = await import('../wiki/wikiService.js');
    const deleted = await wikiService.deletePage(path);
    if (!deleted) return JSON.stringify({ success: false, error: 'Page not found' });
    return JSON.stringify({ success: true, path, message: `Deleted wiki page: ${path}` });
  },
});

registerTool({
  name: 'wiki_revert',
  description: 'Revert a wiki page to a previous revision. Use when an edit has corrupted or accidentally wiped a page. First call with only the path to list available revisions, then call again with path + commitHash to perform the revert.',
  inputSchema: z.object({
    path: z.string(),
    commitHash: z.string().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Wiki page path (e.g. "guides/analysis-methodology")' },
      commitHash: { type: 'string', description: 'Commit hash to revert to. Omit to list available revisions first.' },
    },
    required: ['path'],
  },
  async execute(input) {
    const { path, commitHash } = input as { path: string; commitHash?: string };
    const { wikiService } = await import('../wiki/wikiService.js');

    if (!commitHash) {
      const history = await wikiService.getPageHistory(path, 15);
      if (history.length === 0) return JSON.stringify({ success: false, error: `No revision history found for ${path}` });
      return JSON.stringify({
        success: true,
        mode: 'list',
        path,
        revisions: history.map((h) => ({ hash: h.hashShort, date: h.date, message: h.message })),
        hint: 'Pick a commitHash from the list and call wiki_revert again with it to restore.',
      });
    }

    const result = await wikiService.revertPage(path, commitHash);
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'wiki_move',
  description: 'Move/rename a wiki page and automatically update all [[wikilinks]] and ![[embeds]] referencing it across the entire wiki. One atomic operation replaces the 3-step manual process (write new → delete old → batch fix links).',
  inputSchema: z.object({
    from: z.string(),
    to: z.string(),
    update_refs: z.boolean().optional().default(true),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Current page path (e.g. "entities/old-name")' },
      to: { type: 'string', description: 'New page path (e.g. "entities/new-name")' },
      update_refs: { type: 'boolean', description: 'Auto-update all [[wikilinks]] pointing to this page. Default: true.' },
    },
    required: ['from', 'to'],
  },
  async execute(input) {
    const { from, to, update_refs } = input as { from: string; to: string; update_refs?: boolean };
    const { wikiService } = await import('../wiki/wikiService.js');
    const result = await wikiService.movePage(from, to, update_refs ?? true);
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'wiki_batch_patch',
  description: `Find-and-replace a text pattern across multiple wiki pages in one call. Ideal for broken link fixes, renaming, policy changes, and bulk typo corrections. Returns per-page match counts. Use scope "all" for every page, or provide path prefixes with wildcards (e.g. ["entities/*", "concepts/*"]).`,
  inputSchema: z.object({
    pattern: z.string(),
    replace: z.string(),
    scope: z.union([z.literal('all'), z.array(z.string())]).optional().default('all'),
    dry_run: z.boolean().optional().default(false),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Exact text pattern to find across wiki pages' },
      replace: { type: 'string', description: 'Replacement text' },
      scope: {
        description: '"all" for every page, or array of path prefixes with optional * wildcard (e.g. ["entities/*", "concepts/weapon-system"])',
        oneOf: [
          { type: 'string', enum: ['all'] },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      dry_run: { type: 'boolean', description: 'If true, only report matches without applying changes. Default: false.' },
    },
    required: ['pattern', 'replace'],
  },
  async execute(input) {
    const { pattern, replace, scope, dry_run } = input as {
      pattern: string; replace: string; scope?: 'all' | string[]; dry_run?: boolean;
    };
    const { wikiService } = await import('../wiki/wikiService.js');

    if (dry_run) {
      const pages = await wikiService.listPages();
      const scopeArr = scope ?? 'all';
      const targets = scopeArr === 'all'
        ? pages
        : pages.filter((p) =>
            (scopeArr as string[]).some((s) => {
              if (s.endsWith('*')) return p.path.startsWith(s.slice(0, -1));
              return p.path === s || p.path.startsWith(s + '/');
            }),
          );

      let totalMatches = 0;
      const matches: { path: string; count: number }[] = [];
      for (const page of targets) {
        const full = await wikiService.readPage(page.path);
        if (!full) continue;
        const count = full.content.split(pattern).length - 1;
        if (count > 0) {
          matches.push({ path: page.path, count });
          totalMatches += count;
        }
      }
      return JSON.stringify({ dry_run: true, totalMatches, pages: matches });
    }

    const result = await wikiService.batchPatch(pattern, replace, scope ?? 'all');
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'wiki_create_from_template',
  description: `Create a wiki page from a predefined template. Generates a full page skeleton with :::query blocks, mermaid diagrams, and proper frontmatter. Available templates:
- skill-analysis: 스킬 완전 분석 (Execute chain, status effects, strategy)
- character-overview: 캐릭터 개요 (stats, gear, skill set)
- concept-doc: 시스템/개념 허브 문서
- weapon-analysis: 무기 심층 분석 (stats, projectile, DPS)
- comparison-analysis: 비교 분석 페이지
Call with only template_id to see required variables. Call with template_id + variables to generate the page.`,
  inputSchema: z.object({
    template_id: z.string(),
    variables: z.record(z.string()).optional(),
    path_override: z.string().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      template_id: { type: 'string', description: 'Template ID: skill-analysis, character-overview, concept-doc, weapon-analysis, comparison-analysis' },
      variables: { type: 'object', description: 'Key-value map of template variables. Omit to see required variables.' },
      path_override: { type: 'string', description: 'Optional custom wiki path. If omitted, auto-generated from template category + variables.' },
    },
    required: ['template_id'],
  },
  async execute(input) {
    const { template_id, variables, path_override } = input as { template_id: string; variables?: Record<string, string>; path_override?: string };
    const { getTemplate, listTemplates } = await import('../wiki/wikiTemplates.js');

    if (template_id === 'list') {
      const templates = listTemplates();
      return JSON.stringify({ templates });
    }

    const tmpl = getTemplate(template_id);
    if (!tmpl) {
      const templates = listTemplates();
      return JSON.stringify({ error: `Unknown template "${template_id}"`, available: templates.map((t) => t.id) });
    }

    if (!variables || Object.keys(variables).length === 0) {
      return JSON.stringify({
        template: tmpl.id,
        label: tmpl.label,
        description: tmpl.description,
        category: tmpl.category,
        variables: tmpl.variables.map((v) => ({
          name: v.name,
          label: v.label,
          required: v.required,
          example: v.example,
        })),
        hint: 'Provide variables to generate the page.',
      });
    }

    const missing = tmpl.variables.filter((v) => v.required && !variables[v.name]);
    if (missing.length > 0) {
      return JSON.stringify({
        error: 'Missing required variables',
        missing: missing.map((v) => ({ name: v.name, label: v.label, example: v.example })),
      });
    }

    const { frontmatter, content } = tmpl.generate(variables);

    let pagePath = path_override;
    if (!pagePath) {
      const slugBase = variables.character_en?.toLowerCase()
        || variables.slug
        || variables.weapon_name_en?.toLowerCase().replace(/\s+/g, '-')
        || 'untitled';
      const slugSuffix = variables.skill_name_en?.toLowerCase().replace(/\s+/g, '-') || '';
      pagePath = `${tmpl.category}/${slugSuffix ? `${slugBase}-${slugSuffix}` : slugBase}`;
    }

    const { wikiService } = await import('../wiki/wikiService.js');
    await wikiService.writePage(pagePath, frontmatter, content);

    return JSON.stringify({
      success: true,
      path: pagePath,
      title: frontmatter.title,
      template: tmpl.id,
      message: `Created from template "${tmpl.label}". Fill in TODO sections with actual analysis.`,
      todoCount: (content.match(/TODO/g) || []).length,
    });
  },
});

// --- StringData / Localization Tools ---

registerTool({
  name: 'search_strings',
  description: 'Search localization StringData from Google Sheets. Searches across all languages by key name or text content. Optionally filter by sheet name (e.g. UI, Skill, System) for more precise results. Use string_stats to see available sheet names first.',
  inputSchema: z.object({
    query: z.string(),
    lang: z.string().optional(),
    sheet: z.string().optional(),
    limit: z.number().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text (matches key name and translation content)' },
      lang: { type: 'string', description: 'Filter by language column (e.g. "Korean", "English", "Portuguese")' },
      sheet: { type: 'string', description: 'Filter by sheet name (e.g. "UI", "Skill", "System"). Use string_stats to see available sheets.' },
      limit: { type: 'number', description: 'Max results (default 50)' },
    },
    required: ['query'],
  },
  async execute(input) {
    const { query, lang, sheet, limit } = input as { query: string; lang?: string; sheet?: string; limit?: number };
    const { searchStrings, getCachedStringData } = await import('../google/stringDataService.js');

    if (sheet) {
      const cached = getCachedStringData();
      if (!cached) return JSON.stringify({ query, matchCount: 0, results: [], error: 'StringData not loaded' });
      const targetSheet = cached.sheets.find((s) => s.sheetName.toLowerCase() === sheet.toLowerCase());
      if (!targetSheet) return JSON.stringify({ query, matchCount: 0, results: [], error: `Sheet "${sheet}" not found. Available: ${cached.sheets.map((s) => s.sheetName).join(', ')}` });

      const q = query.toLowerCase();
      const maxLimit = limit ?? 50;
      const results = targetSheet.entries.filter((entry) => {
        if (entry.key.toLowerCase().includes(q)) return true;
        if (lang) return (entry[lang] ?? '').toLowerCase().includes(q);
        return Object.values(entry).some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
      }).slice(0, maxLimit);

      return JSON.stringify({ query, sheet: targetSheet.sheetName, matchCount: results.length, results });
    }

    const results = searchStrings(query, lang, limit ?? 50);
    return JSON.stringify({ query, matchCount: results.length, results });
  },
});

registerTool({
  name: 'get_string',
  description: 'Get a specific localization string by its exact key. Returns all language translations for that key.',
  inputSchema: z.object({ key: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { key: { type: 'string', description: 'Exact string key (e.g. "UI_BTN_START", "SKILL_001_NAME")' } },
    required: ['key'],
  },
  async execute(input) {
    const { key } = input as { key: string };
    const { getStringByKey } = await import('../google/stringDataService.js');
    const entry = getStringByKey(key);
    if (!entry) return `String key '${key}' not found`;
    return JSON.stringify(entry);
  },
});

registerTool({
  name: 'string_stats',
  description: 'Get StringData localization statistics: total entries, per-sheet counts, available languages, and missing translation counts per language. Use for localization coverage reports.',
  inputSchema: z.object({}),
  claudeSchema: { type: 'object', properties: {}, required: [] },
  async execute() {
    const { getStringStats } = await import('../google/stringDataService.js');
    return JSON.stringify(getStringStats());
  },
});

registerTool({
  name: 'query_string_data',
  description: 'Execute SQL on the StringData table (localization strings from Google Sheets). Table name: StringData. Columns: key, Korean, English, Portuguese, etc. For per-sheet tables: StringData_{SheetName}. Example: SELECT * FROM StringData WHERE key LIKE \'%SKILL%\' LIMIT 20',
  inputSchema: z.object({ sql: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { sql: { type: 'string', description: 'SQL query on StringData tables (alasql syntax)' } },
    required: ['sql'],
  },
  async execute(input) {
    const { sql } = input as { sql: string };
    try {
      const { serverExecuteQuery } = await import('../data/serverQueryEngine.js');
      const result = serverExecuteQuery(sql);
      return JSON.stringify({ ...result, source: 'StringData (Google Sheets)' });
    } catch (err) {
      return `SQL Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

// --- Image / Asset Tools ---

registerTool({
  name: 'search_images',
  description: 'Search for image assets (PNG) in the game code repository by keyword. Returns image URLs, dimensions (width x height), and file size. Use to find character portraits, icons, UI elements, skill effects, etc. Embed in wiki: ![alt](/api/assets/code/path).',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keywords (e.g. "kaya", "icon skill", "ui button"). Matches against file paths.' },
      limit: { type: 'number', description: 'Max results (default 20)' },
    },
    required: ['query'],
  },
  async execute(input) {
    const { query, limit } = input as { query: string; limit?: number };
    const { resolve } = await import('path');
    const { config } = await import('../../config.js');
    const { readdir, stat, open } = await import('fs/promises');
    const { join, extname } = await import('path');

    const codeBase = resolve(config.GIT_CLONE_BASE_DIR, 'code');
    const maxResults = Math.min(limit ?? 20, 50);
    const keywords = query.toLowerCase().split(/[\s_\-/\\]+/).filter(Boolean);

    if (keywords.length === 0) return JSON.stringify({ images: [], total: 0 });

    async function readPngDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
      let fh;
      try {
        fh = await open(filePath, 'r');
        const buf = Buffer.alloc(24);
        await fh.read(buf, 0, 24, 0);
        if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        return { width, height };
      } catch { return null; }
      finally { await fh?.close(); }
    }

    const images: { path: string; name: string; url: string; width: number | null; height: number | null; sizeKB: number }[] = [];

    async function walk(dir: string, rel: string) {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (images.length >= maxResults) return;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          await walk(join(dir, entry.name), childRel);
        } else {
          const ext = extname(entry.name).toLowerCase();
          if (ext !== '.png') continue;
          const lower = childRel.toLowerCase();
          if (keywords.every((kw) => lower.includes(kw))) {
            const fullPath = join(dir, entry.name);
            const dims = await readPngDimensions(fullPath);
            const fileStat = await stat(fullPath).catch(() => null);
            images.push({
              path: childRel,
              name: entry.name,
              url: `/api/assets/code/${childRel}`,
              width: dims?.width ?? null,
              height: dims?.height ?? null,
              sizeKB: fileStat ? Math.round(fileStat.size / 1024) : 0,
            });
          }
        }
      }
    }

    await walk(codeBase, '');
    return JSON.stringify({ query, images, total: images.length });
  },
});

// --- Code Search / Read Tools ---

registerTool({
  name: 'search_code',
  description: 'Search for code files in the game code repository. By default matches file names/paths. With searchContent:true, also searches inside file contents (grep-style). Use content search to find class references, variable names, ScriptableObject references, function calls, etc.',
  inputSchema: z.object({
    query: z.string(),
    extension: z.string().optional(),
    limit: z.number().optional(),
    searchContent: z.boolean().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keywords. For path search: matches file paths. For content search: searches inside file text.' },
      extension: { type: 'string', description: 'File extension filter (e.g. ".cs", ".lua", ".asset"). Default: all code files.' },
      limit: { type: 'number', description: 'Max results (default 30)' },
      searchContent: { type: 'boolean', description: 'If true, search inside file contents (grep-style) instead of just file paths. Slower but finds references, class names, variables, etc.' },
    },
    required: ['query'],
  },
  async execute(input) {
    const { query, extension, limit, searchContent } = input as { query: string; extension?: string; limit?: number; searchContent?: boolean };
    const { resolve, join, extname } = await import('path');
    const { config } = await import('../../config.js');
    const { readdir, readFile } = await import('fs/promises');

    const codeBase = resolve(config.GIT_CLONE_BASE_DIR, 'code');
    const maxResults = Math.min(limit ?? 30, 100);
    const keywords = query.toLowerCase().split(/[\s_\-/\\]+/).filter(Boolean);
    const codeExts = new Set(['.cs', '.lua', '.json', '.xml', '.yaml', '.yml', '.txt', '.cfg', '.ini', '.shader', '.asset', '.prefab', '.meta']);

    if (keywords.length === 0) return JSON.stringify({ files: [], total: 0 });

    if (!searchContent) {
      const files: { path: string; name: string; ext: string }[] = [];
      async function walk(dir: string, rel: string) {
        let entries;
        try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (files.length >= maxResults) return;
          const childRel = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'Library') continue;
            await walk(join(dir, entry.name), childRel);
          } else {
            const ext = extname(entry.name).toLowerCase();
            if (extension && ext !== extension.toLowerCase()) continue;
            if (!extension && !codeExts.has(ext)) continue;
            const lower = childRel.toLowerCase();
            if (keywords.every((kw) => lower.includes(kw))) {
              files.push({ path: childRel, name: entry.name, ext });
            }
          }
        }
      }
      await walk(codeBase, '');
      return JSON.stringify({ query, mode: 'path', files, total: files.length });
    }

    // Content search mode
    const results: { path: string; name: string; matches: { line: number; text: string }[] }[] = [];
    const queryLower = query.toLowerCase();
    const MAX_FILE_SIZE = 512 * 1024;

    async function walkContent(dir: string, rel: string) {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'Library') continue;
          await walkContent(join(dir, entry.name), childRel);
        } else {
          const ext = extname(entry.name).toLowerCase();
          if (extension && ext !== extension.toLowerCase()) continue;
          if (!extension && !codeExts.has(ext)) continue;

          try {
            const fullPath = join(dir, entry.name);
            const { size } = await (await import('fs/promises')).stat(fullPath);
            if (size > MAX_FILE_SIZE) continue;

            const content = await readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            const matchLines: { line: number; text: string }[] = [];

            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(queryLower)) {
                matchLines.push({ line: i + 1, text: lines[i].trim().substring(0, 200) });
                if (matchLines.length >= 5) break;
              }
            }

            if (matchLines.length > 0) {
              results.push({ path: childRel, name: entry.name, matches: matchLines });
            }
          } catch { /* skip unreadable files */ }
        }
      }
    }

    await walkContent(codeBase, '');
    return JSON.stringify({ query, mode: 'content', results, total: results.length });
  },
});

registerTool({
  name: 'read_code_file',
  description: 'Read the contents of a specific code file from the game code repository. Use after search_code to inspect implementation details. Supports C#, Lua, JSON, XML, and other text files. Returns file content (truncated to 15KB for large files).',
  inputSchema: z.object({
    path: z.string(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to code repo root (as returned by search_code)' },
      startLine: { type: 'number', description: 'Start reading from this line (1-based, optional)' },
      endLine: { type: 'number', description: 'Stop reading at this line (inclusive, optional)' },
    },
    required: ['path'],
  },
  async execute(input) {
    const { path: filePath, startLine, endLine } = input as { path: string; startLine?: number; endLine?: number };
    const { resolve, extname } = await import('path');
    const { config } = await import('../../config.js');
    const { readFile } = await import('fs/promises');

    const fullPath = resolve(config.GIT_CLONE_BASE_DIR, 'code', filePath);

    if (!fullPath.startsWith(resolve(config.GIT_CLONE_BASE_DIR, 'code'))) {
      return 'Error: path traversal not allowed';
    }

    try {
      const raw = await readFile(fullPath, 'utf-8');
      const ext = extname(filePath).toLowerCase();
      let lines = raw.split('\n');
      const totalLines = lines.length;

      if (startLine || endLine) {
        const start = Math.max((startLine ?? 1) - 1, 0);
        const end = endLine ? Math.min(endLine, totalLines) : totalLines;
        lines = lines.slice(start, end);
      }

      let content = lines.join('\n');
      const MAX_SIZE = 15_000;
      let truncated = false;
      if (content.length > MAX_SIZE) {
        content = content.substring(0, MAX_SIZE);
        truncated = true;
      }

      return JSON.stringify({
        path: filePath,
        extension: ext,
        totalLines,
        range: startLine || endLine ? { start: startLine ?? 1, end: endLine ?? totalLines } : null,
        truncated,
        content,
      });
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

// --- Jira Tools ---

registerTool({
  name: 'jira_search',
  description: 'Search Jira issues using JQL (Jira Query Language). Use to find tasks, bugs, stories, epics. Default project is AEGIS. Examples: "project = AEGIS AND status = \"In Progress\"", "project = AEGIS AND text ~ \"전술공방전\"", "assignee = currentUser() ORDER BY updated DESC".',
  inputSchema: z.object({ jql: z.string(), maxResults: z.number().optional() }),
  claudeSchema: {
    type: 'object',
    properties: {
      jql: { type: 'string', description: 'JQL query string' },
      maxResults: { type: 'number', description: 'Max results (default 20)' },
    },
    required: ['jql'],
  },
  async execute(input) {
    const { jql, maxResults } = input as { jql: string; maxResults?: number };
    const { jiraService } = await import('../atlassian/jiraService.js');
    const result = await jiraService.searchIssues(jql, maxResults ?? 20);
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'jira_get_issue',
  description: 'Get a specific Jira issue by its key (e.g., "AEGIS-1234"). Returns full details including description, status, assignee, comments.',
  inputSchema: z.object({ issueKey: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { issueKey: { type: 'string', description: 'Jira issue key (e.g. AEGIS-1234)' } },
    required: ['issueKey'],
  },
  async execute(input) {
    const { issueKey } = input as { issueKey: string };
    const { jiraService } = await import('../atlassian/jiraService.js');
    const [issue, comments] = await Promise.all([
      jiraService.getIssue(issueKey),
      jiraService.getIssueComments(issueKey),
    ]);
    return JSON.stringify({ issue, comments });
  },
});

// --- Confluence Tools ---

registerTool({
  name: 'confluence_search',
  description: 'Search Confluence pages by keyword. Use to find game design documents, meeting notes, specs, guides. Returns page titles, IDs, and URLs.',
  inputSchema: z.object({ query: z.string(), spaceKey: z.string().optional(), maxResults: z.number().optional() }),
  claudeSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword' },
      spaceKey: { type: 'string', description: 'Optional Confluence space key to narrow search' },
      maxResults: { type: 'number', description: 'Max results (default 15)' },
    },
    required: ['query'],
  },
  async execute(input) {
    const { query, spaceKey, maxResults } = input as { query: string; spaceKey?: string; maxResults?: number };
    const { confluenceService } = await import('../atlassian/confluenceService.js');
    const result = await confluenceService.searchPages(query, spaceKey, maxResults ?? 15);
    return JSON.stringify(result);
  },
});

registerTool({
  name: 'confluence_get_page',
  description: 'Read a specific Confluence page by its ID. Returns the full page content as plain text (HTML stripped). Use after searching to read the actual content.',
  inputSchema: z.object({ pageId: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { pageId: { type: 'string', description: 'Confluence page ID (numeric)' } },
    required: ['pageId'],
  },
  async execute(input) {
    const { pageId } = input as { pageId: string };
    const { confluenceService } = await import('../atlassian/confluenceService.js');
    const page = await confluenceService.getPage(pageId);
    const truncated = page.body.length > 8000 ? page.body.substring(0, 8000) + '\n\n[... content truncated ...]' : page.body;
    return JSON.stringify({ ...page, body: truncated });
  },
});
