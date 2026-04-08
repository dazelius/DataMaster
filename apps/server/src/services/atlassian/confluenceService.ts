import { config } from '../../config.js';

interface ConfluencePage {
  id: string;
  title: string;
  spaceKey: string;
  body: string;
  url: string;
  lastModified: string;
  lastModifiedBy: string;
  version: number;
}

interface ConfluenceSearchResult {
  total: number;
  pages: Pick<ConfluencePage, 'id' | 'title' | 'spaceKey' | 'url' | 'lastModified'>[];
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${config.JIRA_USER_EMAIL}:${config.JIRA_API_TOKEN}`).toString('base64')}`;
}

function isConfigured(): boolean {
  return !!(config.CONFLUENCE_BASE_URL && config.JIRA_USER_EMAIL && config.JIRA_API_TOKEN);
}

function stripHtml(html: string): string {
  return html
    .replace(/<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/gi, '\n> [macro]\n')
    .replace(/<ac:[^>]*\/>/gi, '')
    .replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]*>/gi, '')
    // headings → markdown
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, c) => `\n# ${c.replace(/<[^>]*>/g, '').trim()}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, c) => `\n## ${c.replace(/<[^>]*>/g, '').trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, c) => `\n### ${c.replace(/<[^>]*>/g, '').trim()}\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, c) => `\n#### ${c.replace(/<[^>]*>/g, '').trim()}\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_m, c) => `\n##### ${c.replace(/<[^>]*>/g, '').trim()}\n`)
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_m, c) => `\n###### ${c.replace(/<[^>]*>/g, '').trim()}\n`)
    // bold / italic / code
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    // tables → markdown tables
    .replace(/<table[\s\S]*?<\/table>/gi, (match) => {
      const rows: string[][] = [];
      let isHeader = false;
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(match)) !== null) {
        const cells: string[] = [];
        const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
        const tdRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        if (thRegex.test(trMatch[1])) isHeader = true;
        let tdMatch;
        tdRegex.lastIndex = 0;
        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
          cells.push(tdMatch[1].replace(/<[^>]*>/g, '').trim());
        }
        rows.push(cells);
      }
      if (rows.length === 0) return '';
      const lines: string[] = [];
      const first = rows[0];
      lines.push('| ' + first.join(' | ') + ' |');
      lines.push('|' + first.map(() => '---').join('|') + '|');
      for (let i = 1; i < rows.length; i++) {
        lines.push('| ' + rows[i].join(' | ') + ' |');
      }
      return '\n' + lines.join('\n') + '\n';
    })
    // lists
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c) => `- ${c.replace(/<[^>]*>/g, '').trim()}\n`)
    // links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    // entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&rarr;/g, '→')
    .replace(/&larr;/g, '←')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const confluenceService = {
  isConfigured,

  async searchPages(query: string, spaceKey?: string, maxResults = 15): Promise<ConfluenceSearchResult> {
    if (!isConfigured()) throw new Error('Confluence is not configured');

    let cql = `type=page AND text~"${query.replace(/"/g, '\\"')}"`;
    if (spaceKey) cql += ` AND space="${spaceKey}"`;
    cql += ' ORDER BY lastModified DESC';

    const url = new URL(`${config.CONFLUENCE_BASE_URL}/wiki/rest/api/content/search`);
    url.searchParams.set('cql', cql);
    url.searchParams.set('limit', String(maxResults));

    const res = await fetch(url.toString(), {
      headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Confluence API error ${res.status}: ${body.substring(0, 300)}`);
    }

    const data = await res.json() as any;
    return {
      total: data.totalSize ?? data.size ?? 0,
      pages: (data.results ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        spaceKey: r.space?.key ?? r._expandable?.space?.split('/').pop() ?? '',
        url: r._links?.webui ? `${config.CONFLUENCE_BASE_URL}/wiki${r._links.webui}` : '',
        lastModified: r.version?.when ?? r.history?.lastUpdated?.when ?? '',
      })),
    };
  },

  async getPage(pageId: string): Promise<ConfluencePage> {
    if (!isConfigured()) throw new Error('Confluence is not configured');

    const url = `${config.CONFLUENCE_BASE_URL}/wiki/rest/api/content/${pageId}?expand=body.storage,version,space`;

    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Confluence API error ${res.status}: ${body.substring(0, 300)}`);
    }

    const data = await res.json() as any;
    const rawHtml = data.body?.storage?.value ?? '';

    return {
      id: data.id,
      title: data.title,
      spaceKey: data.space?.key ?? '',
      body: stripHtml(rawHtml),
      url: data._links?.webui ? `${config.CONFLUENCE_BASE_URL}/wiki${data._links.webui}` : '',
      lastModified: data.version?.when ?? '',
      lastModifiedBy: data.version?.by?.displayName ?? 'Unknown',
      version: data.version?.number ?? 0,
    };
  },

  async getPageByTitle(spaceKey: string, title: string): Promise<ConfluencePage | null> {
    if (!isConfigured()) throw new Error('Confluence is not configured');

    const url = new URL(`${config.CONFLUENCE_BASE_URL}/wiki/rest/api/content`);
    url.searchParams.set('spaceKey', spaceKey);
    url.searchParams.set('title', title);
    url.searchParams.set('expand', 'body.storage,version,space');
    url.searchParams.set('limit', '1');

    const res = await fetch(url.toString(), {
      headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Confluence API error ${res.status}: ${body.substring(0, 300)}`);
    }

    const data = await res.json() as any;
    if (!data.results || data.results.length === 0) return null;

    const r = data.results[0];
    const rawHtml = r.body?.storage?.value ?? '';

    return {
      id: r.id,
      title: r.title,
      spaceKey: r.space?.key ?? '',
      body: stripHtml(rawHtml),
      url: r._links?.webui ? `${config.CONFLUENCE_BASE_URL}/wiki${r._links.webui}` : '',
      lastModified: r.version?.when ?? '',
      lastModifiedBy: r.version?.by?.displayName ?? 'Unknown',
      version: r.version?.number ?? 0,
    };
  },
};
