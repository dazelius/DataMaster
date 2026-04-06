import { useState, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSyncStore } from '../../stores/syncStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { useWikiStats } from '../../hooks/useWikiStats';

const NAV_ITEMS = [
  {
    to: '/editor',
    label: 'ERD Editor',
    icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  },
  {
    to: '/query',
    label: 'SQL Query',
    icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    to: '/chat',
    label: 'AI Chat',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  {
    to: '/wiki',
    label: 'Wiki',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
];

export function Sidebar() {
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const schema = useSchemaStore((s) => s.schema);
  const selectedTable = useSchemaStore((s) => s.selectedTable);
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);
  const location = useLocation();
  const { stats: wikiStats } = useWikiStats();

  const [search, setSearch] = useState('');

  const isEditorPage = location.pathname === '/editor' || location.pathname === '/';

  const filteredTables = useMemo(() => {
    if (!schema?.tables) return [];
    const q = search.toLowerCase();
    return schema.tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [schema, search]);

  return (
    <aside className="hidden md:flex w-60 h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)]">
      {/* Brand */}
      <div className="flex h-12 items-center gap-2 border-b border-[var(--color-border-subtle)] px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-[10px] font-bold text-white">
          D
        </div>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">DataMaster</span>
        {isSyncing && (
          <div className="ml-auto h-2 w-2 animate-pulse rounded-full bg-[var(--color-warning)]" title="Syncing..." />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
              }`
            }
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="flex-1">{item.label}</span>
            {item.to === '/wiki' && wikiStats.totalPages > 0 && (
              <span className="flex items-center gap-1.5">
                {wikiStats.recentCount > 0 && (
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
                <span className="min-w-[20px] rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-[var(--color-text-secondary)]">
                  {wikiStats.totalPages}
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Table list (ERD page) */}
      {isEditorPage && schema && (
        <div className="flex flex-1 flex-col overflow-hidden border-t border-[var(--color-border-subtle)]">
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-0)] px-2.5 py-1.5">
              <svg className="h-3.5 w-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tables..."
                className="flex-1 bg-transparent text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none"
              />
            </div>
          </div>

          <div className="px-3 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              Tables &middot; {filteredTables.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filteredTables.map((table) => (
              <button
                key={table.name}
                onClick={() => setSelectedTable(selectedTable === table.name ? null : table.name)}
                className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-xs transition-colors ${
                  selectedTable === table.name
                    ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: table.headerColor ?? '#3b82f6' }}
                />
                <span className="flex-1 truncate">{table.name}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">{table.columns.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
