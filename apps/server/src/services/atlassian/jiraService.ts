import { config } from '../../config.js';

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  reporter: string;
  priority: string;
  issueType: string;
  created: string;
  updated: string;
  description: string | null;
  labels: string[];
  components: string[];
}

interface JiraSearchResult {
  total: number;
  issues: JiraIssue[];
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${config.JIRA_USER_EMAIL}:${config.JIRA_API_TOKEN}`).toString('base64')}`;
}

function isConfigured(): boolean {
  return !!(config.JIRA_BASE_URL && config.JIRA_USER_EMAIL && config.JIRA_API_TOKEN);
}

function extractText(adfNode: any): string {
  if (!adfNode) return '';
  if (typeof adfNode === 'string') return adfNode;
  if (adfNode.type === 'text') return adfNode.text ?? '';
  if (Array.isArray(adfNode.content)) {
    return adfNode.content.map(extractText).join('');
  }
  return '';
}

function adfToPlainText(adf: any): string {
  if (!adf || !adf.content) return '';
  return adf.content
    .map((block: any) => {
      if (block.type === 'paragraph' || block.type === 'heading') {
        return extractText(block) + '\n';
      }
      if (block.type === 'bulletList' || block.type === 'orderedList') {
        return (block.content || [])
          .map((item: any) => `- ${extractText(item)}`)
          .join('\n') + '\n';
      }
      if (block.type === 'codeBlock') {
        return '```\n' + extractText(block) + '\n```\n';
      }
      if (block.type === 'table') {
        return '[table]\n';
      }
      return extractText(block) + '\n';
    })
    .join('')
    .trim();
}

function mapIssue(raw: any): JiraIssue {
  const f = raw.fields;
  return {
    key: raw.key,
    summary: f.summary ?? '',
    status: f.status?.name ?? 'Unknown',
    assignee: f.assignee?.displayName ?? null,
    reporter: f.reporter?.displayName ?? 'Unknown',
    priority: f.priority?.name ?? 'None',
    issueType: f.issuetype?.name ?? 'Unknown',
    created: f.created ?? '',
    updated: f.updated ?? '',
    description: f.description ? adfToPlainText(f.description) : null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c: any) => c.name),
  };
}

export const jiraService = {
  isConfigured,

  async searchIssues(jql: string, maxResults = 20): Promise<JiraSearchResult> {
    if (!isConfigured()) throw new Error('Jira is not configured');

    const url = new URL(`${config.JIRA_BASE_URL}/rest/api/3/search`);
    url.searchParams.set('jql', jql);
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('fields', 'summary,status,assignee,reporter,priority,issuetype,created,updated,description,labels,components');

    const res = await fetch(url.toString(), {
      headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira API error ${res.status}: ${body.substring(0, 300)}`);
    }

    const data = await res.json() as any;
    return {
      total: data.total,
      issues: (data.issues ?? []).map(mapIssue),
    };
  },

  async getIssue(issueKey: string): Promise<JiraIssue> {
    if (!isConfigured()) throw new Error('Jira is not configured');

    const url = `${config.JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,assignee,reporter,priority,issuetype,created,updated,description,labels,components`;

    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira API error ${res.status}: ${body.substring(0, 300)}`);
    }

    return mapIssue(await res.json());
  },

  async getIssueComments(issueKey: string): Promise<{ author: string; body: string; created: string }[]> {
    if (!isConfigured()) throw new Error('Jira is not configured');

    const url = `${config.JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?maxResults=30`;

    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira API error ${res.status}: ${body.substring(0, 300)}`);
    }

    const data = await res.json() as any;
    return (data.comments ?? []).map((c: any) => ({
      author: c.author?.displayName ?? 'Unknown',
      body: c.body ? adfToPlainText(c.body) : '',
      created: c.created ?? '',
    }));
  },

  getDefaultProject(): string {
    return config.JIRA_DEFAULT_PROJECT || 'AEGIS';
  },
};
