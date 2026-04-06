import { NavLink } from 'react-router-dom';
import { useWikiStats } from '../../hooks/useWikiStats';

const NAV_ITEMS = [
  { to: '/editor', label: 'ERD', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { to: '/query', label: 'SQL', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { to: '/chat', label: 'Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { to: '/wiki', label: 'Wiki', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
];

export function BottomNav() {
  const { stats: wikiStats } = useWikiStats();

  return (
    <nav className="flex md:hidden h-14 border-t border-[var(--color-border)] bg-[var(--color-surface-1)] safe-bottom">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
            }`
          }
        >
          <div className="relative">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {item.to === '/wiki' && wikiStats.recentCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--color-surface-1)]" />
            )}
            {item.to === '/wiki' && wikiStats.totalPages > 0 && wikiStats.recentCount === 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] rounded-full bg-[var(--color-surface-3)] px-1 py-0.5 text-center text-[8px] font-bold leading-none text-[var(--color-text-secondary)]">
                {wikiStats.totalPages}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
