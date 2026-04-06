import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../lib/api';
import { useWikiStats } from '../../hooks/useWikiStats';
import { WikiGraphView } from '../../components/wiki/WikiGraphView';

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

/* ── Constants ─────────────────────────────────────── */

const CATEGORIES = [
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
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

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
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const data = await api.get<WikiPageData>(`/api/wiki/pages/${encodedPath}`);
      setCurrentPage(data);
    } catch {
      setCurrentPage(null);
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setQuickSwitcherOpen((v) => !v);
      }
      if (e.key === 'Escape') setQuickSwitcherOpen(false);
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
  useEffect(() => {
    const timer = setTimeout(() => handleSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search, handleSearch]);

  const navigateToPage = useCallback((path: string) => {
    navigate(`/wiki/${path}`);
    setSidebarOpen(false);
  }, [navigate]);

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
        className="md:hidden fixed left-3 top-16 z-30 btn-ghost card-elevated p-2"
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
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-0)] px-2.5 py-2">
            <svg className="h-3.5 w-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search wiki..."
              className="flex-1 bg-transparent text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none"
            />
          </div>
        </div>

        {/* Page list */}
        <div className="flex-1 overflow-y-auto p-2">
            {searchResults ? (
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
              ALL_CATEGORIES.map((cat) => {
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
              })
            )}

            {pages.length === 0 && !searchResults && (
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
          </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {loading ? (
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
                    <span className="text-[10px] text-[var(--color-text-muted)]">Updated: {currentPage.frontmatter.updated}</span>
                  )}
                  {/* Right panel toggle */}
                  <button
                    onClick={() => setShowRightPanel(!showRightPanel)}
                    className="ml-auto hidden md:flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                    title={showRightPanel ? 'Hide panel' : 'Show graph & backlinks'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                    {showRightPanel ? 'Hide' : 'Graph'}
                  </button>
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
                  <WikiMarkdown content={currentPage.content} navigateToPage={navigateToPage} />
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

                {/* Outline / Table of Contents */}
                <OutlinePanel content={currentPage.content} />
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
                return <a href={href} className="text-[var(--color-accent)] hover:underline">{children}</a>;
              },
              code: ({ className, children, ...props }) => {
                if (!className) return <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-[12px] font-mono" {...props}>{children}</code>;
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

function WikiMarkdown({ content, navigateToPage }: { content: string; navigateToPage: (p: string) => void }) {
  const parts = useMemo(() => {
    const segments: { type: 'text' | 'embed'; value: string }[] = [];
    const embedRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = embedRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'embed', value: match[1].trim() });
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
                return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{children}</a>;
              },
              code: ({ className, children, ...props }) => {
                if (!className) return <code className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[13px] font-mono text-[var(--color-text-primary)]" {...props}>{children}</code>;
                return (
                  <pre className="rounded-[var(--radius-lg)] bg-[var(--color-surface-0)] border border-[var(--color-border)] p-4 overflow-x-auto">
                    <code className={`${className} text-[13px] font-mono`} {...props}>{children}</code>
                  </pre>
                );
              },
              table: ({ children }) => <div className="overflow-x-auto my-4"><table className="w-full text-sm border-collapse">{children}</table></div>,
              th: ({ children }) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">{children}</th>,
              td: ({ children }) => <td className="border border-[var(--color-border-subtle)] px-3 py-2 text-[var(--color-text-primary)]">{children}</td>,
              h1: ({ children }) => <h1 className="text-xl font-bold text-[var(--color-text-primary)] mt-8 mb-4 pb-2 border-b border-[var(--color-border-subtle)]">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mt-6 mb-3">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-semibold text-[var(--color-text-primary)] mt-5 mb-2">{children}</h3>,
              p: ({ children }) => <p className="text-[14px] leading-relaxed text-[var(--color-text-secondary)] mb-4">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1 text-[14px] text-[var(--color-text-secondary)]">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-[14px] text-[var(--color-text-secondary)]">{children}</ol>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--color-accent)] pl-4 my-4 text-[var(--color-text-muted)] italic">{children}</blockquote>,
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
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: { entities: '#c084fc', concepts: '#60a5fa', analysis: '#34d399', guides: '#fbbf24' }[cat] ?? '#94a3b8' }} />
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

                const catColor = { entities: '#c084fc', concepts: '#60a5fa', analysis: '#34d399', guides: '#fbbf24' }[rp.category] ?? '#94a3b8';

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
                        style={isToday ? { ringColor: actionConfig.color.replace('bg-', '').replace('-500', '') } : {}}
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
                    backgroundColor: { entities: '#c084fc', concepts: '#60a5fa', analysis: '#34d399', guides: '#fbbf24' }[cat] ?? '#94a3b8',
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
  const fetchedRef = useRef(false);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left, y: rect.bottom + 8 });

    timerRef.current = setTimeout(async () => {
      setShowPreview(true);
      if (!fetchedRef.current) {
        fetchedRef.current = true;
        try {
          const encodedPath = target.split('/').map(encodeURIComponent).join('/');
          const data = await api.get<WikiPageData>(`/api/wiki/pages/${encodedPath}`);
          setPreview(data);
        } catch { /* ignore */ }
      }
    }, 400);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowPreview(false);
  };

  return (
    <span className="relative inline">
      <button
        onClick={() => navigateToPage(target)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="text-[var(--color-accent)] hover:underline cursor-pointer font-medium"
      >
        {children}
      </button>

      {showPreview && (
        <div
          className="fixed z-[80] w-80 max-h-64 overflow-hidden rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-2xl"
          style={{ left: Math.min(pos.x, window.innerWidth - 340), top: Math.min(pos.y, window.innerHeight - 280) }}
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
      )}
    </span>
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
