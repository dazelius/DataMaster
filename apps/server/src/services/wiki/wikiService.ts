import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import { join, relative, dirname, extname, basename } from 'path';
import { existsSync } from 'fs';
import { config } from '../../config.js';

/* ── Types ─────────────────────────────────────────── */

export interface WikiFrontmatter {
  title: string;
  tags?: string[];
  sources?: string[];
  created?: string;
  updated?: string;
  confidence?: 'low' | 'medium' | 'high';
  aliases?: string[];
}

export interface WikiPage {
  path: string;
  frontmatter: WikiFrontmatter;
  content: string;
}

export interface WikiPageMeta {
  path: string;
  frontmatter: WikiFrontmatter;
}

export interface WikiSearchResult {
  path: string;
  frontmatter: WikiFrontmatter;
  score: number;
  snippet: string;
}

export interface WikiGraphNode {
  id: string;
  title: string;
  category: string;
  nodeType: 'page' | 'tag' | 'unresolved';
}

export interface WikiGraphEdge {
  source: string;
  target: string;
}

export interface WikiGraph {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
}

export interface WikiLintResult {
  orphanPages: string[];
  brokenLinks: string[];
  duplicateTitles: string[];
}

export interface WikiLogEntry {
  timestamp: string;
  action: string;
  details: string;
}

/* ── Frontmatter Parser ────────────────────────────── */

function parseFrontmatter(raw: string): { frontmatter: WikiFrontmatter; content: string } {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: { title: 'Untitled' }, content: raw };
  }

  const yaml = fmMatch[1];
  const content = fmMatch[2];
  const fm: WikiFrontmatter = { title: 'Untitled' };

  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    switch (key) {
      case 'title': fm.title = value.replace(/^["']|["']$/g, ''); break;
      case 'confidence': fm.confidence = value.trim() as WikiFrontmatter['confidence']; break;
      case 'created': fm.created = value.trim(); break;
      case 'updated': fm.updated = value.trim(); break;
      case 'tags':
      case 'sources':
      case 'aliases': {
        const arr = value.trim();
        if (arr.startsWith('[')) {
          fm[key] = arr.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
        }
        break;
      }
    }
  }

  return { frontmatter: fm, content };
}

function serializeFrontmatter(fm: WikiFrontmatter): string {
  const lines = ['---'];
  lines.push(`title: "${fm.title}"`);
  if (fm.tags?.length) lines.push(`tags: [${fm.tags.map((t) => `"${t}"`).join(', ')}]`);
  if (fm.sources?.length) lines.push(`sources: [${fm.sources.map((s) => `"${s}"`).join(', ')}]`);
  if (fm.aliases?.length) lines.push(`aliases: [${fm.aliases.map((a) => `"${a}"`).join(', ')}]`);
  if (fm.confidence) lines.push(`confidence: ${fm.confidence}`);
  if (fm.created) lines.push(`created: ${fm.created}`);
  lines.push(`updated: ${new Date().toISOString().split('T')[0]}`);
  lines.push('---');
  return lines.join('\n');
}

/* ── Change Summary Builder ───────────────────────── */

function buildChangeSummary(
  oldFm: WikiFrontmatter, oldContent: string,
  newFm: WikiFrontmatter, newContent: string,
): string {
  const changes: string[] = [];

  const oldLines = oldContent.trim().split('\n');
  const newLines = newContent.trim().split('\n');
  const addedLines = newLines.length - oldLines.length;
  if (addedLines > 0) changes.push(`+${addedLines}줄`);
  else if (addedLines < 0) changes.push(`${addedLines}줄`);

  const oldSections = oldContent.split('\n').filter((l) => l.startsWith('#')).map((l) => l.replace(/^#+\s*/, ''));
  const newSections = newContent.split('\n').filter((l) => l.startsWith('#')).map((l) => l.replace(/^#+\s*/, ''));
  const addedSections = newSections.filter((s) => !oldSections.includes(s));
  const removedSections = oldSections.filter((s) => !newSections.includes(s));
  if (addedSections.length > 0) changes.push(`섹션 추가: ${addedSections.slice(0, 3).join(', ')}`);
  if (removedSections.length > 0) changes.push(`섹션 제거: ${removedSections.slice(0, 3).join(', ')}`);

  const oldTags = new Set(oldFm.tags ?? []);
  const newTags = new Set(newFm.tags ?? []);
  const addedTags = [...newTags].filter((t) => !oldTags.has(t));
  const removedTags = [...oldTags].filter((t) => !newTags.has(t));
  if (addedTags.length > 0) changes.push(`태그+: ${addedTags.join(', ')}`);
  if (removedTags.length > 0) changes.push(`태그-: ${removedTags.join(', ')}`);

  const oldSrc = (oldFm.sources ?? []).length;
  const newSrc = (newFm.sources ?? []).length;
  if (newSrc > oldSrc) changes.push(`출처 ${newSrc - oldSrc}개 추가`);
  else if (newSrc < oldSrc) changes.push(`출처 ${oldSrc - newSrc}개 제거`);

  if (oldFm.confidence !== newFm.confidence && newFm.confidence) {
    changes.push(`신뢰도: ${oldFm.confidence ?? '없음'} → ${newFm.confidence}`);
  }

  return changes.length > 0 ? changes.join(', ') : '내용 수정';
}

/* ── BM25 Search Engine ────────────────────────────── */

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s가-힣]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
}

function bm25Search(docs: { path: string; text: string; fm: WikiFrontmatter }[], query: string): WikiSearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const k1 = 1.5;
  const b = 0.75;
  const N = docs.length;

  const docTokens = docs.map((d) => tokenize(d.text));
  const avgDl = docTokens.reduce((s, t) => s + t.length, 0) / (N || 1);

  const df: Record<string, number> = {};
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const t of seen) df[t] = (df[t] || 0) + 1;
  }

  const scores: { idx: number; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    let score = 0;
    const tokens = docTokens[i];
    const dl = tokens.length;
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;

    for (const qt of queryTokens) {
      const n = df[qt] || 0;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      const freq = tf[qt] || 0;
      score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * dl / avgDl));
    }

    if (score > 0) scores.push({ idx: i, score });
  }

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, 20).map(({ idx, score }) => {
    const doc = docs[idx];
    const lines = doc.text.split('\n').filter(Boolean);
    const snippet = lines.slice(0, 3).join(' ').substring(0, 200);
    return { path: doc.path, frontmatter: doc.fm, score, snippet };
  });
}

/* ── WikiService ───────────────────────────────────── */

class WikiService {
  private baseDir: string;

  constructor() {
    this.baseDir = config.WIKI_DIR;
  }

  private resolvePath(pagePath: string): string {
    const normalized = pagePath.replace(/\\/g, '/');
    if (!normalized.endsWith('.md')) return join(this.baseDir, `${normalized}.md`);
    return join(this.baseDir, normalized);
  }

  private toPagePath(fullPath: string): string {
    return relative(this.baseDir, fullPath).replace(/\\/g, '/').replace(/\.md$/, '');
  }

  async ensureDir(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
    for (const sub of ['entities', 'concepts', 'analysis', 'guides']) {
      const dir = join(this.baseDir, sub);
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    }
  }

  async listPages(category?: string): Promise<WikiPageMeta[]> {
    await this.ensureDir();
    const pages: WikiPageMeta[] = [];
    const searchDir = category ? join(this.baseDir, category) : this.baseDir;

    await this.walkDir(searchDir, async (filePath) => {
      if (!filePath.endsWith('.md')) return;
      const pagePath = this.toPagePath(filePath);
      if (pagePath === 'index' || pagePath === 'log') return;
      try {
        const raw = await readFile(filePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw);
        pages.push({ path: pagePath, frontmatter });
      } catch {
        // skip unreadable files
      }
    });

    return pages.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readPage(pagePath: string): Promise<WikiPage | null> {
    const fullPath = this.resolvePath(pagePath);
    try {
      const raw = await readFile(fullPath, 'utf-8');
      const { frontmatter, content } = parseFrontmatter(raw);
      return { path: pagePath, frontmatter, content };
    } catch {
      return null;
    }
  }

  async writePage(pagePath: string, frontmatter: WikiFrontmatter, content: string): Promise<void> {
    const fullPath = this.resolvePath(pagePath);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const isNew = !existsSync(fullPath);
    let changeSummary = '';

    if (!frontmatter.created) {
      if (isNew) {
        frontmatter.created = new Date().toISOString().split('T')[0];
      } else {
        const existing = await this.readPage(pagePath);
        if (existing) {
          if (existing.frontmatter.created) frontmatter.created = existing.frontmatter.created;
          changeSummary = buildChangeSummary(existing.frontmatter, existing.content, frontmatter, content);
        }
      }
    } else if (!isNew) {
      const existing = await this.readPage(pagePath);
      if (existing) {
        changeSummary = buildChangeSummary(existing.frontmatter, existing.content, frontmatter, content);
      }
    }

    if (isNew) {
      const sections = content.split('\n').filter((l) => l.startsWith('#')).map((l) => l.replace(/^#+\s*/, ''));
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      changeSummary = `새 페이지 (${wordCount}자, 섹션: ${sections.slice(0, 4).join(', ') || '없음'})`;
    }

    const fm = serializeFrontmatter(frontmatter);
    await writeFile(fullPath, `${fm}\n\n${content.trim()}\n`, 'utf-8');

    const logDetail = changeSummary
      ? `${pagePath} — ${frontmatter.title} ⟫ ${changeSummary}`
      : `${pagePath} — ${frontmatter.title}`;
    await this.appendLog(isNew ? 'create' : 'update', logDetail);
    await this.updateIndex();
  }

  async deletePage(pagePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(pagePath);
    try {
      await unlink(fullPath);
      await this.appendLog('delete', pagePath);
      await this.updateIndex();
      return true;
    } catch {
      return false;
    }
  }

  async searchPages(query: string): Promise<WikiSearchResult[]> {
    const pages = await this.listPages();
    const docs: { path: string; text: string; fm: WikiFrontmatter }[] = [];

    for (const page of pages) {
      const full = await this.readPage(page.path);
      if (!full) continue;
      const text = `${full.frontmatter.title} ${full.frontmatter.tags?.join(' ') ?? ''} ${full.content}`;
      docs.push({ path: page.path, text, fm: full.frontmatter });
    }

    return bm25Search(docs, query);
  }

  async updateIndex(): Promise<void> {
    const pages = await this.listPages();
    const categories = new Map<string, WikiPageMeta[]>();

    for (const page of pages) {
      const cat = page.path.includes('/') ? page.path.split('/')[0] : '_root';
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(page);
    }

    const lines = [
      '---',
      'title: "Wiki Index"',
      `updated: ${new Date().toISOString().split('T')[0]}`,
      '---',
      '',
      '# Wiki Index',
      '',
      `Total pages: ${pages.length}`,
      '',
    ];

    for (const [cat, catPages] of categories) {
      lines.push(`## ${cat === '_root' ? 'Uncategorized' : cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      lines.push('');
      for (const p of catPages) {
        const tags = p.frontmatter.tags?.map((t) => `\`${t}\``).join(' ') ?? '';
        lines.push(`- [[${p.path}|${p.frontmatter.title}]] ${tags}`);
      }
      lines.push('');
    }

    const indexPath = join(this.baseDir, 'index.md');
    await writeFile(indexPath, lines.join('\n'), 'utf-8');
  }

  async appendLog(action: string, details: string): Promise<void> {
    const logPath = join(this.baseDir, 'log.md');
    const timestamp = new Date().toISOString();
    const entry = `| ${timestamp} | ${action} | ${details} |\n`;

    let existing = '';
    try {
      existing = await readFile(logPath, 'utf-8');
    } catch {
      existing = [
        '---',
        'title: "Wiki Changelog"',
        '---',
        '',
        '# Wiki Changelog',
        '',
        '| Timestamp | Action | Details |',
        '|---|---|---|',
        '',
      ].join('\n');
    }

    const lines = existing.split('\n');
    const tableEnd = lines.findIndex((l, i) => i > 5 && l.startsWith('|---'));
    if (tableEnd >= 0) {
      lines.splice(tableEnd + 1, 0, entry.trim());
    } else {
      lines.push(entry.trim());
    }

    await writeFile(logPath, lines.join('\n'), 'utf-8');
  }

  async getGraph(): Promise<WikiGraph> {
    const pages = await this.listPages();
    const nodes: WikiGraphNode[] = [];
    const edges: WikiGraphEdge[] = [];
    const pageSet = new Set(pages.map((p) => p.path));
    const tagSet = new Set<string>();
    const unresolvedSet = new Set<string>();
    const edgeDedup = new Set<string>();

    for (const page of pages) {
      const category = page.path.includes('/') ? page.path.split('/')[0] : 'root';
      nodes.push({ id: page.path, title: page.frontmatter.title, category, nodeType: 'page' });

      // Tag nodes from frontmatter
      if (page.frontmatter.tags) {
        for (const tag of page.frontmatter.tags) {
          const tagId = `#${tag}`;
          tagSet.add(tagId);
          const edgeKey = `${page.path}→${tagId}`;
          if (!edgeDedup.has(edgeKey)) {
            edgeDedup.add(edgeKey);
            edges.push({ source: page.path, target: tagId });
          }
        }
      }

      const full = await this.readPage(page.path);
      if (!full) continue;

      // Wikilink edges (resolved + unresolved)
      const wikilinks = full.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
      for (const match of wikilinks) {
        const target = match[1].trim();
        const edgeKey = `${page.path}→${target}`;
        if (edgeDedup.has(edgeKey)) continue;
        edgeDedup.add(edgeKey);

        if (pageSet.has(target)) {
          edges.push({ source: page.path, target });
        } else {
          unresolvedSet.add(target);
          edges.push({ source: page.path, target });
        }
      }

      // Inline #tags from body
      const inlineTags = full.content.matchAll(/(?:^|\s)#([a-zA-Z가-힣][a-zA-Z0-9가-힣_-]*)/g);
      for (const match of inlineTags) {
        const tagId = `#${match[1]}`;
        tagSet.add(tagId);
        const edgeKey = `${page.path}→${tagId}`;
        if (!edgeDedup.has(edgeKey)) {
          edgeDedup.add(edgeKey);
          edges.push({ source: page.path, target: tagId });
        }
      }
    }

    // Add tag nodes
    for (const tagId of tagSet) {
      nodes.push({ id: tagId, title: tagId, category: 'tag', nodeType: 'tag' });
    }

    // Add unresolved link nodes
    for (const unresolved of unresolvedSet) {
      if (!pageSet.has(unresolved) && !tagSet.has(unresolved)) {
        nodes.push({ id: unresolved, title: unresolved.split('/').pop() ?? unresolved, category: 'unresolved', nodeType: 'unresolved' });
      }
    }

    return { nodes, edges };
  }

  async getStats(): Promise<{
    totalPages: number;
    recentCount: number;
    categoryCounts: Record<string, number>;
    lastUpdated: string | null;
    recentPages: { path: string; title: string; updated: string; action: string; category: string; tags: string[]; confidence: string; agoMs: number; summary: string }[];
  }> {
    const pages = await this.listPages();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const categoryCounts: Record<string, number> = {};
    let lastUpdated: string | null = null;

    const pageMeta = new Map<string, { tags: string[]; confidence: string }>();
    for (const page of pages) {
      const cat = page.path.includes('/') ? page.path.split('/')[0] : '_other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      const updated = page.frontmatter.updated || page.frontmatter.created || '';
      if (updated && (!lastUpdated || updated > lastUpdated)) lastUpdated = updated;

      pageMeta.set(page.path, {
        tags: page.frontmatter.tags ?? [],
        confidence: page.frontmatter.confidence ?? '',
      });
    }

    let recentCount = 0;
    const recentPages: { path: string; title: string; updated: string; action: string; category: string; tags: string[]; confidence: string; agoMs: number; summary: string }[] = [];
    try {
      const logPath = join(this.baseDir, 'log.md');
      const logRaw = await readFile(logPath, 'utf-8');
      const logLines = logRaw.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('| Timestamp') && !l.startsWith('|---'));
      for (const line of logLines) {
        const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
        if (cols.length >= 3) {
          const ts = new Date(cols[0]).getTime();
          const agoMs = now - ts;
          if (agoMs < oneDayMs) recentCount++;
          if (recentPages.length < 20) {
            const detail = cols[2];
            let mainPart = detail;
            let summary = '';
            const splitIdx = detail.indexOf(' ⟫ ');
            if (splitIdx >= 0) {
              mainPart = detail.substring(0, splitIdx);
              summary = detail.substring(splitIdx + 3).trim();
            }
            const [pagePath, title] = mainPart.includes(' — ') ? mainPart.split(' — ', 2) : [mainPart, mainPart];
            const category = pagePath.includes('/') ? pagePath.split('/')[0] : '_other';
            const meta = pageMeta.get(pagePath);
            recentPages.push({
              path: pagePath,
              title: title || pagePath,
              updated: cols[0],
              action: cols[1],
              category,
              tags: meta?.tags ?? [],
              confidence: meta?.confidence ?? '',
              agoMs,
              summary,
            });
          }
        }
      }
    } catch { /* no log file */ }

    return { totalPages: pages.length, recentCount, categoryCounts, lastUpdated, recentPages };
  }

  async lint(): Promise<WikiLintResult> {
    const pages = await this.listPages();
    const pageSet = new Set(pages.map((p) => p.path));
    const incomingLinks = new Set<string>();
    const brokenLinks: string[] = [];
    const titleMap = new Map<string, string[]>();

    for (const page of pages) {
      const titleKey = page.frontmatter.title.toLowerCase();
      if (!titleMap.has(titleKey)) titleMap.set(titleKey, []);
      titleMap.get(titleKey)!.push(page.path);

      const full = await this.readPage(page.path);
      if (!full) continue;

      const wikilinks = full.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
      for (const match of wikilinks) {
        const target = match[1].trim();
        if (pageSet.has(target)) {
          incomingLinks.add(target);
        } else {
          brokenLinks.push(`${page.path} -> [[${target}]]`);
        }
      }
    }

    const orphanPages = pages
      .filter((p) => !incomingLinks.has(p.path))
      .map((p) => p.path);

    const duplicateTitles = Array.from(titleMap.entries())
      .filter(([, paths]) => paths.length > 1)
      .map(([title, paths]) => `"${title}": ${paths.join(', ')}`);

    return { orphanPages, brokenLinks, duplicateTitles };
  }

  private async walkDir(dir: string, callback: (filePath: string) => Promise<void>): Promise<void> {
    if (!existsSync(dir)) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, callback);
      } else if (entry.isFile()) {
        await callback(fullPath);
      }
    }
  }
}

export const wikiService = new WikiService();
