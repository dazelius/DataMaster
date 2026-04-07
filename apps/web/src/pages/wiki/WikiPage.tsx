import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import { api } from '../../lib/api';
import { useWikiStats } from '../../hooks/useWikiStats';
import { useSchemaStore } from '../../stores/schemaStore';
import { InlineChart, InlineStat, parseChartBlock, parseStatBlock } from '../../components/visualization';
import { WikiGraphView } from '../../components/wiki/WikiGraphView';
import { TableNode } from '../../components/canvas/TableNode';
import { RelationEdge } from '../../components/canvas/RelationEdge';
import { applyDagreLayout } from '../../lib/dbml/layout';
import { parseDbml } from '../../lib/dbml/parser';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: 'transparent',
    primaryColor: '#6366f1',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#4f46e5',
    lineColor: '#64748b',
    secondaryColor: '#1e1b4b',
    tertiaryColor: '#0f172a',
    fontFamily: 'inherit',
    fontSize: '13px',
  },
});

/* ── Types ─────────────────────────────────────────── */

interface WikiFrontmatter {
  title: string;
  tags?: string[];
  sources?: string[];
  created?: string;
  updated?: string;
  confidence?: string;
}

interface WikiPageMeta {
  path: string;
  frontmatter: WikiFrontmatter;
}

interface WikiPageData {
  path: string;
  frontmatter: WikiFrontmatter;
  content: string;
}

interface WikiSearchResult {
  path: string;
  frontmatter: WikiFrontmatter;
  score: number;
  snippet: string;
}

interface BacklinkInfo {
  path: string;
  title: string;
}

interface HistoryEntry {
  hash: string;
  hashShort: string;
  date: string;
  message: string;
}

interface SectionChange {
  heading: string;
  status: 'new' | 'modified';
}

/* ── Constants ─────────────────────────────────────── */

const CATEGORIES = [
  { id: '_policies', label: 'Policies', icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z' },
  { id: 'entities', label: 'Entities', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { id: 'concepts', label: 'Concepts', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { id: 'analysis', label: 'Analysis', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'guides', label: 'Guides', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
];

const ALL_CATEGORIES = [
  ...CATEGORIES,
  { id: '_other', label: 'Other', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
];

/* ── WikiPage Component ────────────────────────────── */

export default function WikiPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const pagePath = location.pathname.replace(/^\/wiki\/?/, '') || '';
  const [pages, setPages] = useState<WikiPageMeta[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<WikiPageData | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<WikiSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showFullGraph, setShowFullGraph] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showChanges, setShowChanges] = useState(true);
  const [sectionChanges, setSectionChanges] = useState<SectionChange[]>([]);
  const [relatedPages, setRelatedPages] = useState<{ path: string; title: string; score: number; reasons: string[] }[]>([]);
  const [impactData, setImpactData] = useState<{
    referencingPages: { path: string; title: string; updated: string | null; isEmbed: boolean; stale: boolean }[];
    currentUpdated: string | null;
    staleCount: number;
    totalReferences: number;
  } | null>(null);
  const [showImpactDetails, setShowImpactDetails] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const [gapData, setGapData] = useState<{
    undocumentedTables: string[];
    orphanPages: string[];
    brokenLinks: string[];
    stalePages: { path: string; title: string; updated: string; daysAgo: number }[];
    isolatedPages: { path: string; title: string; tags: string[] }[];
  } | null>(null);
  const [gapLoading, setGapLoading] = useState(false);

  const loadPages = useCallback(async () => {
    try {
      const data = await api.get<{ pages: WikiPageMeta[] }>('/api/wiki/pages');
      setPages(data.pages);
      setPagesLoading(false);
      if (data.pages.length === 0) {
        setTimeout(async () => {
          try {
            const retry = await api.get<{ pages: WikiPageMeta[] }>('/api/wiki/pages');
            if (retry.pages.length > 0) setPages(retry.pages);
          } catch { /* ignore */ }
        }, 3000);
      }
    } catch {
      setPagesLoading(false);
      setTimeout(async () => {
        try {
          const retry = await api.get<{ pages: WikiPageMeta[] }>('/api/wiki/pages');
          setPages(retry.pages);
        } catch { /* ignore */ }
      }, 2000);
    }
  }, []);

  const loadPage = useCallback(async (path: string) => {
    if (!path) { setCurrentPage(null); return; }
    setLoading(true);
    setShowHistory(false);
    setShowChanges(true);
    setSectionChanges([]);
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const data = await api.get<WikiPageData>(`/api/wiki/pages/${encodedPath}`);
      setCurrentPage(data);
      loadSectionChanges(encodedPath, data.content);
    } catch {
      setCurrentPage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSectionChanges = useCallback(async (encodedPath: string, currentContent: string) => {
    try {
      const { history } = await api.get<{ history: HistoryEntry[] }>(`/api/wiki/history/${encodedPath}`);
      if (history.length < 2) {
        if (history.length === 1 && history[0].message.startsWith('create:')) {
          const headings = currentContent.split('\n').filter((l) => /^#{1,4}\s/.test(l)).map((l) => l.replace(/^#+\s*/, '').trim());
          setSectionChanges(headings.map((h) => ({ heading: h, status: 'new' as const })));
        }
        return;
      }
      const prev = history[1];
      const { content: prevRaw } = await api.get<{ content: string }>(`/api/wiki/history/${encodedPath}/${prev.hash}`);
      const prevBody = prevRaw.replace(/^---[\s\S]*?---\s*/, '');
      const parseSections = (text: string) => {
        const sections = new Map<string, string>();
        const lines = text.split('\n');
        let curHeading = '';
        let curContent: string[] = [];
        for (const line of lines) {
          const m = line.match(/^(#{1,4})\s+(.+)$/);
          if (m) {
            if (curHeading) sections.set(curHeading, curContent.join('\n').trim());
            curHeading = m[2].trim();
            curContent = [];
          } else {
            curContent.push(line);
          }
        }
        if (curHeading) sections.set(curHeading, curContent.join('\n').trim());
        return sections;
      };
      const oldSections = parseSections(prevBody);
      const newSections = parseSections(currentContent);
      const changes: SectionChange[] = [];
      for (const [heading, content] of newSections) {
        if (!oldSections.has(heading)) {
          changes.push({ heading, status: 'new' });
        } else if (oldSections.get(heading) !== content) {
          changes.push({ heading, status: 'modified' });
        }
      }
      setSectionChanges(changes);
    } catch { /* ignore */ }
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return; }
    try {
      const data = await api.get<{ results: WikiSearchResult[] }>(`/api/wiki/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    }
  }, []);

  const loadBacklinks = useCallback(async (path: string) => {
    if (!path) { setBacklinks([]); return; }
    try {
      const graph = await api.get<{ nodes: { id: string; title: string }[]; edges: { source: string; target: string }[] }>('/api/wiki/graph');
      const incoming = graph.edges.filter((e) => e.target === path).map((e) => e.source);
      const titleMap = new Map(graph.nodes.map((n) => [n.id, n.title]));
      setBacklinks(incoming.map((p) => ({ path: p, title: titleMap.get(p) ?? p })));
    } catch { setBacklinks([]); }
  }, []);

  const loadRelated = useCallback(async (path: string) => {
    if (!path) { setRelatedPages([]); return; }
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const data = await api.get<{ related: { path: string; title: string; score: number; reasons: string[] }[] }>(`/api/wiki/related/${encodedPath}`);
      setRelatedPages(data.related);
    } catch { setRelatedPages([]); }
  }, []);

  const loadImpact = useCallback(async (path: string) => {
    if (!path) { setImpactData(null); return; }
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const data = await api.get<{
        referencingPages: { path: string; title: string; updated: string | null; isEmbed: boolean; stale: boolean }[];
        currentUpdated: string | null;
        staleCount: number;
        totalReferences: number;
      }>(`/api/wiki/impact/${encodedPath}`);
      setImpactData(data);
    } catch { setImpactData(null); }
  }, []);

  const loadGaps = useCallback(async () => {
    setGapLoading(true);
    try {
      const data = await api.get<{
        undocumentedTables: string[];
        orphanPages: string[];
        brokenLinks: string[];
        stalePages: { path: string; title: string; updated: string; daysAgo: number }[];
        isolatedPages: { path: string; title: string; tags: string[] }[];
      }>('/api/wiki/gaps');
      setGapData(data);
    } catch { setGapData(null); }
    setGapLoading(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setQuickSwitcherOpen((v) => !v);
      }
      if (e.key === 'Escape') { setQuickSwitcherOpen(false); setShowFullGraph(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    loadPages();
    const interval = setInterval(loadPages, 30_000);
    return () => clearInterval(interval);
  }, [loadPages]);
  useEffect(() => { loadPage(pagePath); }, [pagePath, loadPage]);
  useEffect(() => { loadBacklinks(pagePath); }, [pagePath, loadBacklinks]);
  useEffect(() => { loadRelated(pagePath); }, [pagePath, loadRelated]);
  useEffect(() => { loadImpact(pagePath); }, [pagePath, loadImpact]);
  useEffect(() => {
    const timer = setTimeout(() => handleSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search, handleSearch]);

  const navigateToPage = useCallback((path: string) => {
    navigate(`/wiki/${path}`);
    setSidebarOpen(false);
  }, [navigate]);

  const handleDeletePage = useCallback(async (path: string) => {
    try {
      await api.del(`/api/wiki/pages/${path.split('/').map(encodeURIComponent).join('/')}`);
      setDeleteConfirm(null);
      setCurrentPage(null);
      navigate('/wiki');
      loadPages();
    } catch { /* ignore */ }
  }, [navigate, loadPages]);

  const categorizedPages = useMemo(() => {
    const map = new Map<string, WikiPageMeta[]>();
    for (const cat of ALL_CATEGORIES) map.set(cat.id, []);

    for (const page of pages) {
      const cat = page.path.includes('/') ? page.path.split('/')[0] : '_other';
      const bucket = map.get(cat) ?? map.get('_other')!;
      bucket.push(page);
    }
    return map;
  }, [pages]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed left-3 top-2 z-30 btn-ghost card-elevated p-2.5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        fixed md:relative z-50 md:z-auto
        w-72 h-full flex-shrink-0 flex flex-col
        border-r border-[var(--color-border)]
        bg-[var(--color-surface-1)]
        transition-transform duration-200
      `}>
        {/* Search */}
        <div className="p-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-0)] px-2.5 py-2.5">
            <svg className="h-4 w-4 text-[var(--color-text-muted)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search wiki..."
              className="flex-1 bg-transparent text-[16px] md:text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none"
            />
            {search && (
              <button onClick={() => { setSearch(''); setSearchResults(null); }} className="p-1 text-[var(--color-text-muted)]">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Page list / Gaps panel */}
        <div className="flex-1 overflow-y-auto p-2">
          {showGaps ? (
            <KnowledgeGapsPanel
              data={gapData}
              loading={gapLoading}
              onRefresh={loadGaps}
              onNavigate={navigateToPage}
            />
          ) : searchResults ? (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Search Results &middot; {searchResults.length}
              </div>
              {searchResults.map((r) => (
                <button
                  key={r.path}
                  onClick={() => { navigateToPage(r.path); setSearch(''); setSearchResults(null); }}
                  className="w-full text-left rounded-[var(--radius-sm)] px-2.5 py-2 hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <div className="text-xs font-medium text-[var(--color-text-primary)] truncate">{r.frontmatter.title}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">{r.snippet}</div>
                </button>
              ))}
            </div>
          ) : (
            <>
              {ALL_CATEGORIES.map((cat) => {
                const catPages = categorizedPages.get(cat.id) ?? [];
                if (catPages.length === 0) return null;
                return (
                  <div key={cat.id} className="mb-3">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <svg className="h-3.5 w-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                      </svg>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                        {cat.label} &middot; {catPages.length}
                      </span>
                    </div>
                    {catPages.map((page) => (
                      <button
                        key={page.path}
                        onClick={() => navigateToPage(page.path)}
                        className={`w-full text-left rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs transition-colors ${
                          page.path === pagePath
                            ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
                        }`}
                      >
                        <span className="truncate">{page.frontmatter.title}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {pages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  {pagesLoading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
                  ) : (
                    <>
                      <svg className="w-8 h-8 text-[var(--color-text-muted)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <p className="text-xs text-[var(--color-text-muted)]">위키가 비어있습니다</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-1">AI 챗봇이 대화 중 지식을 축적합니다</p>
                      <button onClick={loadPages} className="mt-2 text-[10px] text-[var(--color-accent)] hover:underline">
                        새로고침
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Knowledge Gaps + Graph toggle */}
        <div className="flex-shrink-0 border-t border-[var(--color-border-subtle)] p-2 space-y-1">
          <button
            onClick={() => {
              if (!showGaps && !gapData) loadGaps();
              setShowGaps((v) => !v);
            }}
            className={`w-full flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-xs font-medium transition-colors ${
              showGaps
                ? 'bg-amber-500/10 text-amber-400'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            Knowledge Gaps
            {gapData && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                {gapData.undocumentedTables.length + gapData.orphanPages.length + gapData.stalePages.length + gapData.isolatedPages.length + gapData.brokenLinks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setShowFullGraph((v) => !v); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-xs font-medium transition-colors ${
              showFullGraph
                ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            Knowledge Graph
            {showFullGraph && (
              <span className="ml-auto text-[10px] opacity-60">ESC</span>
            )}
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {showFullGraph ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">Knowledge Graph</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">{pages.length} pages</span>
              </div>
              <button
                onClick={() => setShowFullGraph(false)}
                className="btn-ghost rounded-[var(--radius-sm)] p-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <WikiGraphView onPageClick={(path) => { navigateToPage(path); setShowFullGraph(false); }} />
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
          </div>
        ) : currentPage ? (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Article */}
            <article className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
                {/* Frontmatter badges */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {currentPage.frontmatter.confidence && (
                    <span className={`badge ${
                      currentPage.frontmatter.confidence === 'high' ? 'bg-green-500/15 text-green-400' :
                      currentPage.frontmatter.confidence === 'medium' ? 'bg-yellow-500/15 text-yellow-400' :
                      'bg-red-500/15 text-red-400'
                    }`}>
                      {currentPage.frontmatter.confidence}
                    </span>
                  )}
                  {currentPage.frontmatter.tags?.map((tag) => (
                    <span key={tag} className="badge bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">{tag}</span>
                  ))}
                  {currentPage.frontmatter.updated && (
                    <button
                      onClick={() => setShowHistory((v) => !v)}
                      className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors flex items-center gap-1"
                      title="버전 히스토리 보기"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Updated: {currentPage.frontmatter.updated}
                    </button>
                  )}
                  {sectionChanges.length > 0 && (
                    <button
                      onClick={() => setShowChanges((v) => !v)}
                      className={`text-[10px] rounded-full px-2 py-0.5 font-medium transition-colors ${
                        showChanges
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-emerald-400'
                      }`}
                    >
                      {showChanges ? '✓ ' : ''}변경 {sectionChanges.length}
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-1 md:gap-2">
                    {/* Quick Switcher (mobile) */}
                    <button
                      onClick={() => setQuickSwitcherOpen(true)}
                      className="md:hidden flex items-center p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                      title="페이지 검색"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                    {/* Delete page */}
                    <button
                      onClick={() => setDeleteConfirm(pagePath)}
                      className="flex items-center p-1.5 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                      title="페이지 삭제"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                    {/* Right panel toggle */}
                    <button
                      onClick={() => setShowRightPanel(!showRightPanel)}
                      className="hidden md:flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                      title={showRightPanel ? 'Hide panel' : 'Show graph & backlinks'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                      </svg>
                      {showRightPanel ? 'Hide' : 'Graph'}
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] mb-4">
                  {currentPage.frontmatter.title}
                </h1>

                {/* Sources */}
                {currentPage.frontmatter.sources && currentPage.frontmatter.sources.length > 0 && (
                  <div className="mb-6 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <svg className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.56a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                      </svg>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Sources</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentPage.frontmatter.sources.map((src, i) => (
                        <SourceBadge key={i} source={src} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Markdown content with embeds */}
                <div className="wiki-content prose prose-invert max-w-none">
                  <WikiMarkdown content={currentPage.content} navigateToPage={navigateToPage} sectionChanges={showChanges ? sectionChanges : []} />
                </div>

                {/* Mobile: Backlinks (below content) */}
                {backlinks.length > 0 && (
                  <div className="md:hidden mt-8 pt-6 border-t border-[var(--color-border-subtle)]">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                      </svg>
                      Backlinks &middot; {backlinks.length}
                    </h3>
                    <div className="space-y-1">
                      {backlinks.map((bl) => (
                        <button
                          key={bl.path}
                          onClick={() => navigateToPage(bl.path)}
                          className="w-full text-left rounded-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] transition-colors"
                        >
                          ← {bl.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mobile: History Panel */}
                {showHistory && (
                  <div className="md:hidden mt-8 pt-6 border-t border-[var(--color-border-subtle)]">
                    <HistoryPanel pagePath={pagePath} onClose={() => setShowHistory(false)} />
                  </div>
                )}
              </div>
            </article>

            {/* Right panel: Local graph + Backlinks (desktop) */}
            {showRightPanel && (
              <aside className="hidden md:flex flex-col w-72 flex-shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface-1)]">
                {/* Local Graph */}
                <div className="h-56 flex-shrink-0 border-b border-[var(--color-border-subtle)]">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border-subtle)]">
                    <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Local Graph</span>
                  </div>
                  <div className="h-[calc(100%-28px)] relative">
                    <WikiGraphView
                      focusedPage={pagePath}
                      onPageClick={navigateToPage}
                      compact
                    />
                  </div>
                </div>

                {/* Backlinks */}
                <div className="flex-1 overflow-y-auto">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border-subtle)]">
                    <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                    </svg>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                      Backlinks {backlinks.length > 0 ? `· ${backlinks.length}` : ''}
                    </span>
                  </div>
                  {backlinks.length > 0 ? (
                    <div className="p-2 space-y-0.5">
                      {backlinks.map((bl) => (
                        <button
                          key={bl.path}
                          onClick={() => navigateToPage(bl.path)}
                          className="w-full text-left rounded-[var(--radius-sm)] px-2.5 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] transition-colors"
                        >
                          <div className="font-medium truncate">{bl.title}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)] truncate">{bl.path}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-[11px] text-[var(--color-text-muted)]">
                      이 페이지를 참조하는 다른 페이지가 없습니다
                    </div>
                  )}
                </div>

                {/* Related Pages */}
                {relatedPages.length > 0 && (
                  <div className="border-t border-[var(--color-border-subtle)]">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border-subtle)]">
                      <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-1.757l4.5-4.5a4.5 4.5 0 00-6.364-6.364l-1.757 1.757" />
                      </svg>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                        Related · {relatedPages.length}
                      </span>
                    </div>
                    <div className="p-2 space-y-0.5">
                      {relatedPages.map((rp) => (
                        <button
                          key={rp.path}
                          onClick={() => navigateToPage(rp.path)}
                          className="w-full text-left rounded-[var(--radius-sm)] px-2.5 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors group"
                        >
                          <div className="font-medium truncate text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)]">{rp.title}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">
                            {rp.reasons.slice(0, 2).join(' · ')}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Impact Analysis */}
                {impactData && impactData.totalReferences > 0 && (
                  <div className="border-t border-[var(--color-border-subtle)]">
                    <button
                      onClick={() => setShowImpactDetails(!showImpactDetails)}
                      className="w-full flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-2)] transition-colors"
                    >
                      <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                      </svg>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)] flex-1 text-left">
                        Impact · {impactData.totalReferences}
                      </span>
                      {impactData.staleCount > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                          {impactData.staleCount} stale
                        </span>
                      )}
                      <svg className={`w-3 h-3 text-[var(--color-text-muted)] transition-transform ${showImpactDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {showImpactDetails && (
                      <div className="p-2 space-y-0.5 max-h-48 overflow-y-auto">
                        {impactData.referencingPages.map((rp) => (
                          <button
                            key={rp.path}
                            onClick={() => navigateToPage(rp.path)}
                            className="w-full text-left rounded-[var(--radius-sm)] px-2.5 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors group"
                          >
                            <div className="flex items-center gap-1.5">
                              {rp.stale && (
                                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="업데이트 필요" />
                              )}
                              {rp.isEmbed && (
                                <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">embed</span>
                              )}
                              <span className="font-medium truncate text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)]">{rp.title}</span>
                            </div>
                            {rp.updated && (
                              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                                업데이트: {rp.updated}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Outline / Table of Contents */}
                <OutlinePanel content={currentPage.content} />

                {/* History Panel */}
                {showHistory && (
                  <HistoryPanel pagePath={pagePath} onClose={() => setShowHistory(false)} />
                )}
              </aside>
            )}
          </div>
        ) : (
          <WikiWelcome totalPages={pages.length} onNavigate={navigateToPage} onPageClick={navigateToPage} />
        )}
      </div>

      {/* Quick Switcher Modal (Ctrl+K) */}
      {quickSwitcherOpen && (
        <QuickSwitcher
          pages={pages}
          onSelect={(path) => { navigateToPage(path); setQuickSwitcherOpen(false); }}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">페이지 삭제</h3>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">이 작업은 되돌릴 수 없습니다</p>
                </div>
              </div>
              <div className="rounded-lg bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)] px-3 py-2">
                <div className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                  {currentPage?.frontmatter.title ?? deleteConfirm}
                </div>
                <div className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">{deleteConfirm}</div>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-[var(--color-border-subtle)]">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleDeletePage(deleteConfirm)}
                className="flex-1 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function processWikilinks(content: string): string {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    return `[${label ?? target}](#/wiki/${target})`;
  });
}

/* ── Source Badge ──────────────────────────────────── */

function SourceBadge({ source }: { source: string }) {
  const [type, ...rest] = source.split(':');
  const value = rest.join(':').trim();

  const config: Record<string, { bg: string; text: string; icon: string }> = {
    table: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: 'M3 10h18M3 14h18m-9-4v8' },
    query: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: 'M8 9l3 3-3 3m5 0h3' },
    jira: { bg: 'bg-orange-500/15', text: 'text-orange-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    confluence: { bg: 'bg-purple-500/15', text: 'text-purple-400', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2' },
    git: { bg: 'bg-green-500/15', text: 'text-green-400', icon: 'M16 3h5m0 0v5m0-5l-6 6M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28' },
    user: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  };

  const c = config[type] ?? config.user!;
  const label = value || source;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.bg} ${c.text}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
      </svg>
      <span className="max-w-[200px] truncate">{label}</span>
    </span>
  );
}

/* ── Mermaid Diagram ─────────────────────────────── */

let mermaidIdCounter = 0;

function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${++mermaidIdCounter}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(idRef.current, code.trim());
        if (!cancelled) { setSvg(rendered); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Mermaid render error');
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
        <div className="text-[11px] text-red-400 font-medium mb-1">Mermaid Error</div>
        <pre className="text-[11px] text-red-300/70 whitespace-pre-wrap">{error}</pre>
        <pre className="mt-2 text-[11px] text-[var(--color-text-muted)] whitespace-pre-wrap bg-[var(--color-surface-0)] rounded p-2">{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ── Query Embed (:::query ... :::) ──────────────── */

function WikiQueryEmbed({ sql }: { sql: string }) {
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, unknown>[]; rowCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.post<{ columns: string[]; rows: Record<string, unknown>[]; rowCount: number }>('/api/data/query', { sql });
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Query failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sql]);

  return (
    <div className="my-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12v-1.5c0-.621-.504-1.125-1.125-1.125M9.75 8.625c0 .621.504 1.125 1.125 1.125" />
        </svg>
        <code className="text-[11px] font-mono text-emerald-400 truncate flex-1">{sql}</code>
        {result && (
          <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">
            {result.rowCount} rows{result.rowCount > result.rows.length ? ` (showing ${result.rows.length})` : ''}
          </span>
        )}
        <svg className={`w-3 h-3 text-[var(--color-text-muted)] transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {!collapsed && (
        <div className="border-t border-[var(--color-border-subtle)]">
          {loading && (
            <div className="px-4 py-6 text-center">
              <div className="inline-block h-4 w-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-xs text-red-400 bg-red-500/5">
              <span className="font-medium">Error:</span> {error}
            </div>
          )}
          {result && result.columns.length > 0 && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="bg-[var(--color-surface-2)] border-b border-r border-[var(--color-border)] px-2.5 py-1.5 text-left font-medium text-[var(--color-text-muted)] text-[10px] w-8">#</th>
                    {result.columns.map((col) => (
                      <th key={col} className="bg-[var(--color-surface-2)] border-b border-r border-[var(--color-border)] px-2.5 py-1.5 text-left font-medium text-[var(--color-text-secondary)] text-[11px] whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-[var(--color-surface-2)]/50 transition-colors">
                      <td className="border-b border-r border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[10px] text-[var(--color-text-muted)] font-mono">{ri + 1}</td>
                      {result.columns.map((col) => {
                        const val = row[col];
                        const isNum = typeof val === 'number';
                        return (
                          <td key={col} className={`border-b border-r border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[11px] whitespace-nowrap ${isNum ? 'text-right font-mono text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
                            {val == null ? <span className="text-[var(--color-text-muted)] italic">null</span> : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && result.columns.length === 0 && (
            <div className="px-4 py-3 text-xs text-[var(--color-text-muted)] text-center">No results</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ERD Embed (:::erd ... :::) ───────────────────── */

const erdNodeTypes = { table: TableNode };
const erdEdgeTypes = { relation: RelationEdge };

function WikiErdEmbedInner({ tables: tableNames, depth }: { tables: string[]; depth: number }) {
  const storeSchema = useSchemaStore((s) => s.schema);
  const dbml = useSchemaStore((s) => s.dbml);
  const schema = useMemo(() => {
    if (storeSchema) return storeSchema;
    if (!dbml) return null;
    try { return parseDbml(dbml); } catch { return null; }
  }, [storeSchema, dbml]);

  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!schema || tableNames.length === 0) return { layoutNodes: [], layoutEdges: [] };

    const focusSet = new Set(tableNames.map((t) => t.trim()));
    const includeSet = new Set<string>(focusSet);

    if (depth > 0) {
      for (let d = 0; d < depth; d++) {
        const current = [...includeSet];
        for (const ref of schema.refs) {
          if (current.includes(ref.fromTable)) includeSet.add(ref.toTable);
          if (current.includes(ref.toTable)) includeSet.add(ref.fromTable);
        }
      }
    }

    const filteredTables = schema.tables.filter((t) => includeSet.has(t.name));
    const filteredRefs = schema.refs.filter(
      (r) => includeSet.has(r.fromTable) && includeSet.has(r.toTable),
    );

    const rawNodes: Node[] = filteredTables.map((t) => ({
      id: t.name,
      type: 'table',
      position: { x: 0, y: 0 },
      data: {
        label: t.name,
        columns: t.columns,
        headerColor: focusSet.has(t.name) ? '#6366f1' : '#475569',
        isSelected: focusSet.has(t.name),
      },
    }));

    const rawEdges: Edge[] = filteredRefs.map((r) => ({
      id: r.id,
      source: r.fromTable,
      target: r.toTable,
      type: 'relation',
      data: { relationType: r.type },
    }));

    const result = applyDagreLayout(rawNodes, rawEdges, 'LR');
    return { layoutNodes: result.nodes, layoutEdges: result.edges };
  }, [schema, tableNames, depth]);

  if (!schema) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[11px] text-[var(--color-text-muted)]">
        {dbml ? (
          <span>스키마 파싱 실패</span>
        ) : (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
            <span>데이터 동기화 후 사용 가능합니다</span>
          </>
        )}
      </div>
    );
  }

  return (
    <ReactFlow
      key={tableNames.join(',') + depth}
      defaultNodes={layoutNodes}
      defaultEdges={layoutEdges}
      nodeTypes={erdNodeTypes}
      edgeTypes={erdEdgeTypes}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.05}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      panOnDrag
      zoomOnScroll
      className="bg-transparent"
    />
  );
}

function WikiErdEmbed({ tables, depth = 1 }: { tables: string[]; depth?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const estimatedHeight = Math.max(350, Math.min(600, tables.length * 120 + 100));

  return (
    <div className="my-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="text-[11px] font-medium text-blue-400 truncate flex-1">
          ERD: {tables.join(', ')}
        </span>
        {depth > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">depth: {depth}</span>
        )}
        <svg className={`w-3 h-3 text-[var(--color-text-muted)] transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {!collapsed && (
        <div className="border-t border-[var(--color-border-subtle)] relative" style={{ height: estimatedHeight }}>
          <ReactFlowProvider>
            <WikiErdEmbedInner tables={tables} depth={depth} />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}

/* ── Wiki Embed (![[page]]) ───────────────────────── */

function WikiEmbed({ pagePath, navigateToPage }: { pagePath: string; navigateToPage: (p: string) => void }) {
  const [embedded, setEmbedded] = useState<WikiPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const encodedPath = pagePath.split('/').map(encodeURIComponent).join('/');
        const data = await api.get<WikiPageData>(`/api/wiki/pages/${encodedPath}`);
        if (!cancelled) setEmbedded(data);
      } catch {
        if (!cancelled) setEmbedded(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pagePath]);

  if (loading) {
    return (
      <div className="my-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <div className="h-3 w-3 animate-spin rounded-full border border-[var(--color-border)] border-t-[var(--color-accent)]" />
          Loading {pagePath}...
        </div>
      </div>
    );
  }

  if (!embedded) {
    return (
      <div className="my-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
        <span className="text-xs text-[var(--color-text-muted)]">Embed not found: {pagePath}</span>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/30 bg-[var(--color-surface-1)]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-surface-2)] transition-colors rounded-t-[var(--radius-lg)]"
      >
        <svg className={`w-3 h-3 text-[var(--color-accent)] transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-3.5 h-3.5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.56a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
        </svg>
        <span className="text-xs font-medium text-[var(--color-accent)]">{embedded.frontmatter.title}</span>
        <button
          onClick={(e) => { e.stopPropagation(); navigateToPage(pagePath); }}
          className="ml-auto text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
        >
          Open →
        </button>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--color-border-subtle)]">
          <div className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed wiki-embed-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              p: ({ children }) => <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)] mb-3">{children}</p>,
              h1: ({ children }) => <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mt-3 mb-2">{children}</h3>,
              h2: ({ children }) => <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mt-3 mb-2">{children}</h3>,
              h3: ({ children }) => <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] mt-2 mb-1">{children}</h4>,
              a: ({ href, children }) => {
                if (href?.startsWith('#/wiki/')) {
                  const target = href.replace('#/wiki/', '');
                  return <button onClick={() => navigateToPage(target)} className="text-[var(--color-accent)] hover:underline cursor-pointer">{children}</button>;
                }
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[var(--color-accent)] hover:underline">
                    {children}
                    <svg className="w-2.5 h-2.5 flex-shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                );
              },
              code: ({ className, children, ...props }) => {
                if (!className) return <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-[12px] font-mono" {...props}>{children}</code>;
                if (className === 'language-mermaid') {
                  const raw = String(children).replace(/\n$/, '');
                  return <MermaidDiagram code={raw} />;
                }
                return <pre className="rounded bg-[var(--color-surface-0)] border border-[var(--color-border)] p-3 overflow-x-auto text-[12px]"><code className={className} {...props}>{children}</code></pre>;
              },
              table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
              th: ({ children }) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-left text-[11px]">{children}</th>,
              td: ({ children }) => <td className="border border-[var(--color-border-subtle)] px-2 py-1 text-[11px]">{children}</td>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-[13px] text-[var(--color-text-secondary)]">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-[13px] text-[var(--color-text-secondary)]">{children}</ol>,
            }}>
              {processWikilinks(embedded.content)}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── WikiMarkdown — handles both [[links]] and ![[embeds]] ── */

function WikiMarkdown({ content, navigateToPage, sectionChanges = [] }: { content: string; navigateToPage: (p: string) => void; sectionChanges?: SectionChange[] }) {
  const changeMap = useMemo(() => {
    const m = new Map<string, 'new' | 'modified'>();
    for (const c of sectionChanges) m.set(c.heading.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ''), c.status);
    return m;
  }, [sectionChanges]);
  const parts = useMemo(() => {
    const segments: { type: 'text' | 'embed' | 'query' | 'erd' | 'chart' | 'stat'; value: string }[] = [];
    const combinedRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]|:::query\s*\n([\s\S]*?)\n:::|:::erd\s*\n([\s\S]*?)\n:::|:::chart\s*\n([\s\S]*?)\n:::|:::stat\s*\n([\s\S]*?)\n:::/g;
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }
      if (match[1] !== undefined) {
        segments.push({ type: 'embed', value: match[1].trim() });
      } else if (match[2] !== undefined) {
        segments.push({ type: 'query', value: match[2].trim() });
      } else if (match[3] !== undefined) {
        segments.push({ type: 'erd', value: match[3].trim() });
      } else if (match[4] !== undefined) {
        segments.push({ type: 'chart', value: match[4].trim() });
      } else if (match[5] !== undefined) {
        segments.push({ type: 'stat', value: match[5].trim() });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      segments.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return segments;
  }, [content]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'embed') {
          return <WikiEmbed key={`embed-${i}`} pagePath={part.value} navigateToPage={navigateToPage} />;
        }
        if (part.type === 'query') {
          return <WikiQueryEmbed key={`query-${i}`} sql={part.value} />;
        }
        if (part.type === 'erd') {
          const lines = part.value.split('\n').map((l) => l.trim()).filter(Boolean);
          const tableNames: string[] = [];
          let erdDepth = 1;
          for (const line of lines) {
            const depthMatch = line.match(/^depth\s*:\s*(\d+)$/i);
            if (depthMatch) { erdDepth = parseInt(depthMatch[1], 10); continue; }
            for (const name of line.split(',')) {
              const trimmed = name.trim();
              if (trimmed) tableNames.push(trimmed);
            }
          }
          return <WikiErdEmbed key={`erd-${i}`} tables={tableNames} depth={erdDepth} />;
        }
        if (part.type === 'chart') {
          const chartConfig = parseChartBlock(part.value);
          if (chartConfig) return <InlineChart key={`chart-${i}`} config={chartConfig} />;
          return null;
        }
        if (part.type === 'stat') {
          const statConfig = parseStatBlock(part.value);
          if (statConfig) return <InlineStat key={`stat-${i}`} config={statConfig} />;
          return null;
        }
        return (
          <ReactMarkdown
            key={`md-${i}`}
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith('#/wiki/')) {
                  const target = href.replace('#/wiki/', '');
                  return <WikiLink target={target} navigateToPage={navigateToPage}>{children}</WikiLink>;
                }
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[var(--color-accent)] hover:underline">
                    {children}
                    <svg className="w-3 h-3 flex-shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                );
              },
              code: ({ className, children, ...props }) => {
                if (!className) return <code className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[13px] font-mono text-[var(--color-text-primary)]" {...props}>{children}</code>;
                if (className === 'language-mermaid') {
                  const raw = String(children).replace(/\n$/, '');
                  return <MermaidDiagram code={raw} />;
                }
                return (
                  <pre className="rounded-[var(--radius-lg)] bg-[var(--color-surface-0)] border border-[var(--color-border)] p-4 overflow-x-auto">
                    <code className={`${className} text-[13px] font-mono`} {...props}>{children}</code>
                  </pre>
                );
              },
              table: ({ children }) => <div className="overflow-x-auto my-4"><table className="w-full text-sm border-collapse">{children}</table></div>,
              th: ({ children }) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">{children}</th>,
              td: ({ children }) => <td className="border border-[var(--color-border-subtle)] px-3 py-2 text-[var(--color-text-primary)]">{children}</td>,
              h1: ({ children }) => {
                const text = String(children ?? '');
                const key = text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
                const change = changeMap.get(key);
                return (
                  <h1 className={`text-xl font-bold text-[var(--color-text-primary)] mt-8 mb-4 pb-2 border-b ${change ? 'border-l-3 pl-3 rounded-sm' : ''} ${change === 'new' ? 'border-l-emerald-500 border-b-[var(--color-border-subtle)] bg-emerald-500/5' : change === 'modified' ? 'border-l-blue-500 border-b-[var(--color-border-subtle)] bg-blue-500/5' : 'border-[var(--color-border-subtle)]'}`}>
                    {children}
                    {change && <span className={`ml-2 inline-block text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 align-middle ${change === 'new' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{change === 'new' ? 'NEW' : '수정'}</span>}
                  </h1>
                );
              },
              h2: ({ children }) => {
                const text = String(children ?? '');
                const key = text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
                const change = changeMap.get(key);
                return (
                  <h2 className={`text-lg font-semibold text-[var(--color-text-primary)] mt-6 mb-3 ${change ? 'border-l-3 pl-3 rounded-sm' : ''} ${change === 'new' ? 'border-l-emerald-500 bg-emerald-500/5' : change === 'modified' ? 'border-l-blue-500 bg-blue-500/5' : ''}`}>
                    {children}
                    {change && <span className={`ml-2 inline-block text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 align-middle ${change === 'new' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{change === 'new' ? 'NEW' : '수정'}</span>}
                  </h2>
                );
              },
              h3: ({ children }) => {
                const text = String(children ?? '');
                const key = text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
                const change = changeMap.get(key);
                return (
                  <h3 className={`text-base font-semibold text-[var(--color-text-primary)] mt-5 mb-2 ${change ? 'border-l-3 pl-3 rounded-sm' : ''} ${change === 'new' ? 'border-l-emerald-500 bg-emerald-500/5' : change === 'modified' ? 'border-l-blue-500 bg-blue-500/5' : ''}`}>
                    {children}
                    {change && <span className={`ml-2 inline-block text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 align-middle ${change === 'new' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{change === 'new' ? 'NEW' : '수정'}</span>}
                  </h3>
                );
              },
              p: ({ children }) => <p className="text-[14px] leading-relaxed text-[var(--color-text-secondary)] mb-4">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1 text-[14px] text-[var(--color-text-secondary)]">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-[14px] text-[var(--color-text-secondary)]">{children}</ol>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--color-accent)] pl-4 my-4 text-[var(--color-text-muted)] italic">{children}</blockquote>,
              img: ({ src, alt }) => (
                <span className="inline-block my-3">
                  <img
                    src={src}
                    alt={alt ?? ''}
                    loading="lazy"
                    className="max-w-full rounded-lg border border-[var(--color-border)] shadow-sm"
                    style={{ maxHeight: '320px' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {alt && <span className="block text-xs text-[var(--color-text-muted)] mt-1">{alt}</span>}
                </span>
              ),
            }}
          >
            {processWikilinks(part.value)}
          </ReactMarkdown>
        );
      })}
    </>
  );
}

function formatRelativeTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return '방금 전';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

function KnowledgeGapsPanel({ data, loading, onRefresh, onNavigate }: {
  data: {
    undocumentedTables: string[];
    orphanPages: string[];
    brokenLinks: string[];
    stalePages: { path: string; title: string; updated: string; daysAgo: number }[];
    isolatedPages: { path: string; title: string; tags: string[] }[];
  } | null;
  loading: boolean;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-amber-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-xs text-[var(--color-text-muted)]">
        갭 분석 데이터를 불러올 수 없습니다
        <button onClick={onRefresh} className="block mx-auto mt-2 text-[var(--color-accent)] hover:underline">재시도</button>
      </div>
    );
  }

  const sections: { key: string; label: string; count: number; icon: string; color: string }[] = [
    { key: 'undocumented', label: '미문서화 테이블', count: data.undocumentedTables.length, icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v.75', color: 'text-blue-400' },
    { key: 'orphan', label: '고아 페이지', count: data.orphanPages.length, icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636', color: 'text-orange-400' },
    { key: 'broken', label: '깨진 링크', count: data.brokenLinks.length, icon: 'M13.181 8.68a4.503 4.503 0 011.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 006.364 6.365l.457-.456a1.5 1.5 0 00-2.122-2.122l-.457.457a1.5 1.5 0 01-2.121-2.121l1.756-1.757', color: 'text-red-400' },
    { key: 'stale', label: '오래된 페이지', count: data.stalePages.length, icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-yellow-400' },
    { key: 'isolated', label: '고립된 페이지', count: data.isolatedPages.length, icon: 'M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-purple-400' },
  ];

  const totalGaps = sections.reduce((a, s) => a + s.count, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
          Knowledge Gaps · {totalGaps}
        </span>
        <button onClick={onRefresh} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
          새로고침
        </button>
      </div>
      {totalGaps === 0 ? (
        <div className="text-center py-6 text-xs text-emerald-400">
          <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          모든 지식이 잘 연결되어 있습니다!
        </div>
      ) : (
        sections.filter((s) => s.count > 0).map((section) => (
          <div key={section.key} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] overflow-hidden">
            <button
              onClick={() => toggle(section.key)}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${section.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
              </svg>
              <span className="flex-1 text-left font-medium text-[var(--color-text-secondary)]">{section.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${section.color} bg-[var(--color-surface-2)]`}>
                {section.count}
              </span>
              <svg className={`w-3 h-3 text-[var(--color-text-muted)] transition-transform ${expanded.has(section.key) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {expanded.has(section.key) && (
              <div className="border-t border-[var(--color-border-subtle)] max-h-36 overflow-y-auto">
                {section.key === 'undocumented' && data.undocumentedTables.map((tbl) => (
                  <div key={tbl} className="px-3 py-1.5 text-[11px] text-[var(--color-text-muted)] truncate">
                    {tbl}
                  </div>
                ))}
                {section.key === 'orphan' && data.orphanPages.map((p) => (
                  <button key={p} onClick={() => onNavigate(p)} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] truncate">
                    {p}
                  </button>
                ))}
                {section.key === 'broken' && data.brokenLinks.map((bl) => (
                  <div key={bl} className="px-3 py-1.5 text-[11px] text-[var(--color-text-muted)] truncate">
                    {bl}
                  </div>
                ))}
                {section.key === 'stale' && data.stalePages.map((sp) => (
                  <button key={sp.path} onClick={() => onNavigate(sp.path)} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]">
                    <span className="truncate block">{sp.title}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{sp.daysAgo}일 전</span>
                  </button>
                ))}
                {section.key === 'isolated' && data.isolatedPages.map((ip) => (
                  <button key={ip.path} onClick={() => onNavigate(ip.path)} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]">
                    <span className="truncate block">{ip.title}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{ip.tags.map((t) => `#${t}`).join(' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function WikiWelcome({ totalPages, onNavigate, onPageClick }: { totalPages: number; onNavigate: (path: string) => void; onPageClick: (path: string) => void }) {
  const { stats } = useWikiStats(15_000);
  const [showFullGraph, setShowFullGraph] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  if (showFullGraph) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Knowledge Graph</span>
            <span className="text-[10px] text-[var(--color-text-muted)]">{totalPages} pages</span>
          </div>
          <button
            onClick={() => setShowFullGraph(false)}
            className="btn-ghost rounded-[var(--radius-sm)] p-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <WikiGraphView onPageClick={onPageClick} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-start gap-6 px-4 py-8 md:py-12 overflow-y-auto">
      {/* Graph Hero */}
      {totalPages > 0 && (
        <button
          onClick={() => setShowFullGraph(true)}
          className="w-full max-w-2xl h-52 md:h-64 rounded-[var(--radius-xl)] overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-all group relative"
        >
          <WikiGraphView onPageClick={() => setShowFullGraph(true)} compact />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1b26] via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 pointer-events-none">
            <span className="text-xs font-medium text-white/80 group-hover:text-white transition-colors">
              Knowledge Graph 열기
            </span>
            <svg className="w-3.5 h-3.5 text-white/60 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          </div>
        </button>
      )}

      <div className="text-center">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Knowledge Wiki</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
          AI 챗봇이 대화 중 발견한 지식을 자동으로 축적하는 Second Brain입니다.
          {totalPages > 0 ? ` 현재 ${totalPages}개의 페이지가 연결되어 있습니다.` : ' 아직 페이지가 없습니다. AI에게 질문해보세요!'}
        </p>
      </div>

      {/* Stats cards */}
      {stats.totalPages > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-xl">
          <div className="card rounded-[var(--radius-lg)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-accent)]">{stats.totalPages}</div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1">Total Pages</div>
          </div>
          <div className="card rounded-[var(--radius-lg)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-text-primary)]">
              {Object.keys(stats.categoryCounts).length}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1">Categories</div>
          </div>
          <div className="card rounded-[var(--radius-lg)] p-4 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <div className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.recentCount}</div>
              {stats.recentCount > 0 && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1">24h Changes</div>
          </div>
          <div className="card rounded-[var(--radius-lg)] p-4 text-center">
            <div className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {stats.lastUpdated ?? '-'}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1">Last Updated</div>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {stats.totalPages > 0 && Object.keys(stats.categoryCounts).length > 0 && (
        <div className="w-full max-w-xl">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-2 px-1">Category Breakdown</h3>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(stats.categoryCounts).map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => onNavigate(cat)}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: { _policies: '#f472b6', entities: '#c084fc', concepts: '#60a5fa', analysis: '#34d399', guides: '#fbbf24' }[cat] ?? '#94a3b8' }} />
                <span className="text-[var(--color-text-secondary)]">{cat}</span>
                <span className="min-w-[20px] rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-center text-[10px] font-bold text-[var(--color-text-muted)]">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity — Timeline */}
      {stats.recentPages.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Recent Changes
              {stats.recentCount > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-[10px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  {stats.recentCount} today
                </span>
              )}
            </h3>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-[var(--color-border-subtle)]" />

            <div className="space-y-1">
              {stats.recentPages.map((rp, i) => {
                const actionConfig = {
                  create: { label: '생성', color: 'bg-green-500', textColor: 'text-green-400', bgColor: 'bg-green-500/10', icon: 'M12 4.5v15m7.5-7.5h-15' },
                  update: { label: '수정', color: 'bg-blue-500', textColor: 'text-blue-400', bgColor: 'bg-blue-500/10', icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z' },
                  delete: { label: '삭제', color: 'bg-red-500', textColor: 'text-red-400', bgColor: 'bg-red-500/10', icon: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0' },
                }[rp.action] ?? { label: rp.action, color: 'bg-zinc-500', textColor: 'text-zinc-400', bgColor: 'bg-zinc-500/10', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' };

                const catColor = { _policies: '#f472b6', entities: '#c084fc', concepts: '#60a5fa', analysis: '#34d399', guides: '#fbbf24' }[rp.category] ?? '#94a3b8';

                const isToday = rp.agoMs < 86_400_000;

                const isExpanded = expandedItems.has(i);
                const hasSummary = !!rp.summary;

                return (
                  <div key={`${rp.path}-${i}`} className="relative">
                    <div
                      className="relative flex items-start gap-3 w-full pl-3 pr-4 py-2.5 text-left rounded-[var(--radius-lg)] hover:bg-[var(--color-surface-2)] transition-colors group cursor-pointer"
                      onClick={() => hasSummary ? toggleExpand(i) : onPageClick(rp.path)}
                    >
                      {/* Timeline dot */}
                      <div className={`relative z-10 mt-0.5 flex-shrink-0 h-[14px] w-[14px] rounded-full border-2 border-[var(--color-surface-0)] ${actionConfig.color} ${isToday ? 'ring-2 ring-offset-1 ring-offset-[var(--color-surface-0)]' : ''}`}
                        style={isToday ? { ['--tw-ring-color' as string]: actionConfig.color.replace('bg-', '').replace('-500', '') } : {}}
                      />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); onPageClick(rp.path); }}
                            className="text-xs font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors truncate hover:underline"
                          >
                            {rp.title}
                          </button>
                          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${actionConfig.bgColor} ${actionConfig.textColor}`}>
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={actionConfig.icon} />
                            </svg>
                            {actionConfig.label}
                          </span>
                          {rp.confidence && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                              rp.confidence === 'high' ? 'bg-green-500/10 text-green-400' :
                              rp.confidence === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                              'bg-red-500/10 text-red-400'
                            }`}>
                              {rp.confidence}
                            </span>
                          )}
                          {hasSummary && (
                            <svg className={`w-3 h-3 text-[var(--color-text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                          <span className="text-[10px] text-[var(--color-text-muted)] truncate">{rp.path}</span>
                          {rp.tags.length > 0 && (
                            <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                              {rp.tags.slice(0, 2).map((t) => `#${t}`).join(' ')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Relative time */}
                      <div className="flex-shrink-0 text-right mt-0.5">
                        <div className={`text-[10px] font-medium ${isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}>
                          {formatRelativeTime(rp.agoMs)}
                        </div>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && hasSummary && (
                      <div className="ml-[26px] pl-4 pb-2 border-l-2 border-[var(--color-border-subtle)]">
                        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] px-3 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">변경 내역</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {rp.summary.split(', ').map((part, pi) => {
                              const isAdd = part.startsWith('+') || part.includes('추가') || part.includes('새 ');
                              const isRemove = part.startsWith('-') || part.includes('제거') || part.includes('삭제');
                              const isChange = part.includes('→') || part.includes('수정');
                              const badgeColor = isAdd ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : isRemove ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : isChange ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]';
                              return (
                                <span key={pi} className={`inline-block rounded-[var(--radius-sm)] border px-2 py-0.5 text-[10px] font-medium ${badgeColor}`}>
                                  {part.trim()}
                                </span>
                              );
                            })}
                          </div>
                          <div className="mt-2 text-[10px] text-[var(--color-text-muted)]">
                            {rp.updated}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Category shortcuts */}
      <div className="flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onNavigate(cat.id)}
            className="flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
            </svg>
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Quick Switcher (Ctrl+K) ─────────────────────── */

function QuickSwitcher({ pages, onSelect, onClose }: { pages: WikiPageMeta[]; onSelect: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return pages.slice(0, 15);
    const q = query.toLowerCase();
    return pages
      .filter((p) => p.frontmatter.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
      .slice(0, 15);
  }, [pages, query]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && filtered[selectedIdx]) { onSelect(filtered[selectedIdx].path); }
    else if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <svg className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="페이지 이름으로 이동..."
            className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">결과 없음</div>
          ) : (
            filtered.map((page, idx) => {
              const cat = page.path.includes('/') ? page.path.split('/')[0] : '';
              return (
                <button
                  key={page.path}
                  onClick={() => onSelect(page.path)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    idx === selectedIdx ? 'bg-[var(--color-accent-subtle)]' : 'hover:bg-[var(--color-surface-2)]'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{
                    backgroundColor: { _policies: '#f472b6', entities: '#c084fc', concepts: '#60a5fa', analysis: '#34d399', guides: '#fbbf24' }[cat] ?? '#94a3b8',
                  }} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${idx === selectedIdx ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
                      {page.frontmatter.title}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] truncate">{page.path}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--color-border-subtle)] flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1"><kbd className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 font-mono">↑↓</kbd> 탐색</span>
          <span className="flex items-center gap-1"><kbd className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 font-mono">↵</kbd> 열기</span>
          <span className="flex items-center gap-1"><kbd className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 font-mono">esc</kbd> 닫기</span>
        </div>
      </div>
    </div>
  );
}

/* ── WikiLink with Hover Preview ─────────────────── */

function WikiLink({ target, navigateToPage, children }: { target: string; navigateToPage: (p: string) => void; children: React.ReactNode }) {
  const [preview, setPreview] = useState<WikiPageData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout>>(null);
  const fetchedRef = useRef(false);

  const fetchPreview = useCallback(async () => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      try {
        const encodedPath = target.split('/').map(encodeURIComponent).join('/');
        const data = await api.get<WikiPageData>(`/api/wiki/pages/${encodedPath}`);
        setPreview(data);
      } catch { /* ignore */ }
    }
  }, [target]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left, y: rect.bottom + 8 });
    timerRef.current = setTimeout(() => {
      setShowPreview(true);
      fetchPreview();
    }, 400);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowPreview(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setPos({ x: touch.clientX - 140, y: touch.clientY - 200 });
    longPressRef.current = setTimeout(() => {
      setShowPreview(true);
      fetchPreview();
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  return (
    <span className="relative inline">
      <button
        onClick={() => { if (!showPreview) navigateToPage(target); else setShowPreview(false); }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="text-[var(--color-accent)] hover:underline cursor-pointer font-medium"
      >
        {children}
      </button>

      {showPreview && (
        <>
          <div className="fixed inset-0 z-[79] md:hidden" onClick={() => setShowPreview(false)} />
          <div
            className="fixed z-[80] w-72 md:w-80 max-h-64 overflow-hidden rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-2xl"
            style={{ left: Math.max(8, Math.min(pos.x, window.innerWidth - 300)), top: Math.max(8, Math.min(pos.y, window.innerHeight - 280)) }}
            onMouseEnter={() => setShowPreview(true)}
            onMouseLeave={() => setShowPreview(false)}
          >
          {preview ? (
            <>
              <div className="px-4 py-2.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
                <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{preview.frontmatter.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {preview.frontmatter.tags?.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[9px] rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)] px-1.5 py-0.5">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3 text-[12px] text-[var(--color-text-secondary)] leading-relaxed overflow-hidden" style={{ maxHeight: 160 }}>
                {preview.content.slice(0, 300)}{preview.content.length > 300 ? '...' : ''}
              </div>
            </>
          ) : (
            <div className="px-4 py-6 flex items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
            </div>
          )}
        </div>
        </>
      )}
    </span>
  );
}

/* ── History Panel ────────────────────────────────── */

function HistoryPanel({ pagePath, onClose }: { pagePath: string; onClose: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const encodedPath = pagePath.split('/').map(encodeURIComponent).join('/');
        const data = await api.get<{ history: HistoryEntry[] }>(`/api/wiki/history/${encodedPath}`);
        if (!cancelled) setHistory(data.history);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [pagePath]);

  const loadDiff = useCallback(async (hash: string, idx: number) => {
    if (selectedHash === hash) {
      setSelectedHash(null);
      setDiffContent(null);
      setVersionContent(null);
      return;
    }
    setSelectedHash(hash);
    setDiffLoading(true);
    try {
      const encodedPath = pagePath.split('/').map(encodeURIComponent).join('/');
      const prevEntry = history[idx + 1];
      if (prevEntry) {
        const data = await api.get<{ diff: string }>(`/api/wiki/diff/${encodedPath}?from=${prevEntry.hash}&to=${hash}`);
        setDiffContent(data.diff);
        setVersionContent(null);
      } else {
        const data = await api.get<{ content: string }>(`/api/wiki/history/${encodedPath}/${hash}`);
        setVersionContent(data.content);
        setDiffContent(null);
      }
    } catch { /* ignore */ }
    setDiffLoading(false);
  }, [pagePath, history, selectedHash]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return '방금 전';
      if (diffMin < 60) return `${diffMin}분 전`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}시간 전`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 7) return `${diffDay}일 전`;
      return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const parseMessage = (msg: string) => {
    const action = msg.split(':')[0] || '';
    const detail = msg.substring(msg.indexOf(':') + 1).trim();
    return { action, detail };
  };

  return (
    <div className="flex-shrink-0 border-t border-[var(--color-border-subtle)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            History {history.length > 0 ? `· ${history.length}` : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors p-0.5"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="p-4 flex justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
          </div>
        ) : history.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-[var(--color-text-muted)]">
            아직 버전 히스토리가 없습니다
          </div>
        ) : (
          <div className="relative pl-5 pr-2 py-2">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-[var(--color-border-subtle)]" />

            {history.map((entry, idx) => {
              const { action, detail } = parseMessage(entry.message);
              const isSelected = selectedHash === entry.hash;
              const actionColor = action === 'create' ? 'text-green-400' :
                action === 'delete' ? 'text-red-400' :
                action === 'patch' ? 'text-yellow-400' : 'text-blue-400';

              return (
                <div key={entry.hash}>
                  <button
                    onClick={() => loadDiff(entry.hash, idx)}
                    className={`w-full text-left relative py-1.5 pl-3 pr-1 rounded-[var(--radius-sm)] transition-colors ${
                      isSelected ? 'bg-[var(--color-accent-subtle)]' : 'hover:bg-[var(--color-surface-2)]'
                    }`}
                  >
                    {/* Timeline dot */}
                    <div className={`absolute left-[-11px] top-[11px] w-2 h-2 rounded-full border-2 ${
                      idx === 0 ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : 'bg-[var(--color-surface-1)] border-[var(--color-border)]'
                    }`} />

                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-mono font-bold uppercase ${actionColor}`}>{action}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">{formatDate(entry.date)}</span>
                    </div>
                    <div className="text-[11px] text-[var(--color-text-secondary)] truncate mt-0.5" title={detail}>
                      {detail || entry.message}
                    </div>
                    <div className="text-[9px] font-mono text-[var(--color-text-muted)] mt-0.5">{entry.hashShort}</div>
                  </button>

                  {/* Expanded diff/version view */}
                  {isSelected && (
                    <div className="ml-3 mt-1 mb-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)] overflow-hidden">
                      {diffLoading ? (
                        <div className="p-3 flex justify-center">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
                        </div>
                      ) : diffContent ? (
                        <DiffView diff={diffContent} />
                      ) : versionContent ? (
                        <div className="p-2 text-[10px] font-mono text-[var(--color-text-secondary)] max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {versionContent}
                        </div>
                      ) : (
                        <div className="p-2 text-[10px] text-[var(--color-text-muted)]">내용을 불러올 수 없습니다</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Diff View ───────────────────────────────────── */

function DiffView({ diff }: { diff: string }) {
  const lines = useMemo(() => {
    if (!diff) return [];
    return diff.split('\n').filter((l) => !l.startsWith('diff --git') && !l.startsWith('index ') && !l.startsWith('---') && !l.startsWith('+++'));
  }, [diff]);

  if (lines.length === 0) {
    return <div className="p-2 text-[10px] text-[var(--color-text-muted)]">변경사항 없음</div>;
  }

  return (
    <div className="max-h-48 overflow-y-auto text-[10px] font-mono leading-relaxed">
      {lines.map((line, i) => {
        const isHunk = line.startsWith('@@');
        const isAdd = line.startsWith('+');
        const isRemove = line.startsWith('-');
        return (
          <div
            key={i}
            className={`px-2 py-px whitespace-pre-wrap break-all ${
              isHunk ? 'text-[var(--color-accent)] bg-[var(--color-accent-subtle)] font-semibold' :
              isAdd ? 'text-green-400 bg-green-500/10' :
              isRemove ? 'text-red-400 bg-red-500/10' :
              'text-[var(--color-text-muted)]'
            }`}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
}

/* ── Outline Panel (ToC) ─────────────────────────── */

function OutlinePanel({ content }: { content: string }) {
  const headings = useMemo(() => {
    const lines = content.split('\n');
    const result: { level: number; text: string; id: string }[] = [];
    for (const line of lines) {
      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        result.push({
          level: match[1].length,
          text: match[2].replace(/[*_`\[\]]/g, ''),
          id: match[2].toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/(^-|-$)/g, ''),
        });
      }
    }
    return result;
  }, [content]);

  if (headings.length === 0) return null;

  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <div className="flex-shrink-0 border-t border-[var(--color-border-subtle)]">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Outline</span>
      </div>
      <div className="p-2 max-h-48 overflow-y-auto">
        {headings.map((h, i) => (
          <div
            key={`${h.id}-${i}`}
            className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] py-0.5 px-1 rounded cursor-default truncate transition-colors"
            style={{ paddingLeft: `${(h.level - minLevel) * 12 + 4}px` }}
          >
            {h.text}
          </div>
        ))}
      </div>
    </div>
  );
}
