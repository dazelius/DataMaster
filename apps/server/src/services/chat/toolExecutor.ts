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
  name: 'create_artifact',
  description: 'Create an HTML artifact/report document.',
  inputSchema: z.object({ title: z.string(), html: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Artifact title' },
      html: { type: 'string', description: 'Full HTML content' },
    },
    required: ['title', 'html'],
  },
  async execute(input) {
    const { title, html } = input as { title: string; html: string };
    return JSON.stringify({ status: 'created', title, htmlLength: html.length });
  },
});

registerTool({
  name: 'patch_artifact',
  description: 'Partially modify an existing HTML artifact.',
  inputSchema: z.object({ id: z.string(), patch: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Artifact ID' },
      patch: { type: 'string', description: 'HTML patch content' },
    },
    required: ['id', 'patch'],
  },
  async execute(input) {
    const { id } = input as { id: string };
    return JSON.stringify({ status: 'patched', id });
  },
});

registerTool({
  name: 'read_guide',
  description: 'Read a code or database guide document.',
  inputSchema: z.object({ guideId: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { guideId: { type: 'string', description: 'Guide identifier' } },
    required: ['guideId'],
  },
  async execute(input) {
    const { guideId } = input as { guideId: string };
    return JSON.stringify({ guideId, content: 'Guide content placeholder' });
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
  description: 'Search the compiled wiki knowledge base for relevant pages. Always check here FIRST before querying raw data — the wiki contains pre-compiled, cross-referenced knowledge.',
  inputSchema: z.object({ query: z.string() }),
  claudeSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Search query' } },
    required: ['query'],
  },
  async execute(input) {
    const { query } = input as { query: string };
    const { wikiService } = await import('../wiki/wikiService.js');
    const results = await wikiService.searchPages(query);
    return JSON.stringify(results.slice(0, 10));
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
  description: 'Create or update a wiki page to PERSIST knowledge. ALWAYS include sources array to track where information came from. Use [[wikilinks]] for cross-references and ![[page]] for Obsidian embeds. Categories: entities/ (game entities), concepts/ (mechanics/formulas), analysis/ (findings/comparisons), guides/ (how-to).',
  inputSchema: z.object({
    path: z.string(),
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string()).optional(),
    sources: z.array(z.string()).optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Page path (e.g. "entities/character")' },
      title: { type: 'string', description: 'Page title' },
      content: { type: 'string', description: 'Markdown content with [[wikilinks]] and ![[embeds]]' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
      sources: { type: 'array', items: { type: 'string' }, description: 'REQUIRED. Information sources (e.g. "table:Character", "jira:AEGIS-123", "confluence:전술공방전 (id:12345)", "git:abc1234", "user:유저설명")' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'high=DB/공식문서 확인, medium=추론, low=불확실' },
    },
    required: ['path', 'title', 'content'],
  },
  async execute(input) {
    const { path, title, content, tags, sources, confidence } = input as {
      path: string; title: string; content: string; tags?: string[]; sources?: string[]; confidence?: 'low' | 'medium' | 'high';
    };
    const { wikiService } = await import('../wiki/wikiService.js');
    await wikiService.writePage(path, { title, tags, sources, confidence }, content);
    return JSON.stringify({ success: true, path, title, sourcesCount: sources?.length ?? 0 });
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

// --- StringData / Localization Tools ---

registerTool({
  name: 'search_strings',
  description: 'Search localization StringData from Google Sheets. Searches across all languages by key name or text content. Use for: finding string keys, checking translations, localization QA, missing translation detection.',
  inputSchema: z.object({
    query: z.string(),
    lang: z.string().optional(),
    limit: z.number().optional(),
  }),
  claudeSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text (matches key name and translation content)' },
      lang: { type: 'string', description: 'Filter by language column (e.g. "Korean", "English", "Portuguese")' },
      limit: { type: 'number', description: 'Max results (default 50)' },
    },
    required: ['query'],
  },
  async execute(input) {
    const { query, lang, limit } = input as { query: string; lang?: string; limit?: number };
    const { searchStrings } = await import('../google/stringDataService.js');
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
