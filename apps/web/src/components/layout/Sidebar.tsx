import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useSyncStore, type RepoSyncStatus } from '../../stores/syncStore';
import { useChatStore } from '../../stores/chatStore';
import { useWikiStats } from '../../hooks/useWikiStats';

const NAV_ITEMS = [
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

const REPO_LABELS: Record<string, string> = {
  data: 'Game Data',
  code: 'Game Code',
  localize: 'Localizing',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  syncing: '동기화 중...',
  loading_data: '데이터 로딩...',
  done: '완료',
  error: '오류',
};

function ElapsedTimer() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 300);
    return () => clearInterval(id);
  }, []);

  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) return <span className="text-[9px] tabular-nums text-[var(--color-text-muted)]">{secs}s</span>;
  return <span className="text-[9px] tabular-nums text-[var(--color-text-muted)]">{Math.floor(secs / 60)}m{secs % 60}s</span>;
}

function IndeterminateBar() {
  return (
    <div className="h-1 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
      <div
        className="h-full w-1/3 rounded-full bg-[var(--color-accent)]"
        style={{ animation: 'indeterminate 1.4s ease-in-out infinite' }}
      />
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}

function RepoRow({ repo }: { repo: RepoSyncStatus }) {
  const isActive = repo.status === 'syncing' || repo.status === 'loading_data';
  const isDone = repo.status === 'done';
  const isError = repo.status === 'error';
  const isPending = repo.status === 'pending';

  return (
    <div className={`rounded-[var(--radius-md)] px-2.5 py-1.5 transition-all ${isActive ? 'bg-[var(--color-accent)]/5' : ''}`}>
      <div className="flex items-center gap-2">
        {/* Status icon */}
        <div className="flex-shrink-0">
          {isPending && <span className="block h-2 w-2 rounded-full bg-[var(--color-text-muted)] opacity-30" />}
          {isActive && (
            <svg className="h-3 w-3 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {isDone && (
            <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
          {isError && (
            <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        {/* Repo name */}
        <span className={`text-[10px] flex-1 truncate ${isActive ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>
          {REPO_LABELS[repo.id] ?? repo.id}
        </span>

        {/* Status text + timer */}
        <div className="flex items-center gap-1.5">
          {isActive && <ElapsedTimer />}
          {!isActive && repo.message && (
            <span className={`text-[9px] truncate max-w-[90px] ${isError ? 'text-red-400' : 'text-[var(--color-text-muted)]'}`} title={repo.message}>
              {repo.message.length > 25 ? repo.message.slice(0, 25) + '...' : repo.message}
            </span>
          )}
          {isActive && (
            <span className="text-[9px] text-[var(--color-accent)]">{STATUS_LABELS[repo.status]}</span>
          )}
        </div>
      </div>

      {/* Progress bar for active repos */}
      {isActive && (
        <div className="mt-1.5">
          <IndeterminateBar />
        </div>
      )}
    </div>
  );
}

function SyncPanel() {
  const { isSyncing, repos, phase, lastSync, error } = useSyncStore();

  if (!isSyncing && !lastSync && !error) return null;

  const doneCount = repos.filter((r) => r.status === 'done').length;
  const totalCount = repos.length;
  const hasAnyActive = repos.some((r) => r.status === 'syncing' || r.status === 'loading_data');
  const postGitPhase = !hasAnyActive && isSyncing;

  return (
    <div className="mx-2 mb-2 rounded-[var(--radius-lg)] bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          {isSyncing ? (
            <>
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              </div>
              <span className="text-[11px] font-medium text-[var(--color-accent)]">
                {postGitPhase ? (phase === 'loading_schema' ? '스키마 로딩...' : phase === 'loading_tables' ? '테이블 로딩...' : '처리 중...') : 'Git 동기화'}
              </span>
            </>
          ) : error ? (
            <>
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-[11px] font-medium text-red-400 truncate" title={error}>오류</span>
            </>
          ) : (
            <>
              <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-[11px] text-[var(--color-text-muted)]">동기화 완료</span>
            </>
          )}
        </div>

        {totalCount > 0 && (
          <span className="text-[9px] tabular-nums text-[var(--color-text-muted)]">
            {doneCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Overall progress bar */}
      {isSyncing && totalCount > 0 && (
        <div className="px-3 pb-1">
          <div className="h-0.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
              style={{ width: `${(doneCount / totalCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Per-repo status — always visible when repos exist */}
      {repos.length > 0 && (
        <div className="border-t border-[var(--color-border-subtle)] px-1.5 py-1 space-y-0.5">
          {repos.map((repo) => (
            <RepoRow key={repo.id} repo={repo} />
          ))}
        </div>
      )}

      {/* Post-git loading phases */}
      {postGitPhase && (
        <div className="border-t border-[var(--color-border-subtle)] px-3 py-1.5">
          <div className="flex items-center gap-2">
            <svg className="h-3 w-3 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {phase === 'loading_schema' ? '스키마 파싱 중...' : phase === 'loading_tables' ? '테이블 데이터 로딩...' : '데이터 처리 중...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const { stats: wikiStats } = useWikiStats();
  const isWikiWriting = useChatStore((s) => s.activeTools.some((t) => t.name === 'wiki_write' && (t.status === 'running' || t.status === 'generating')));

  return (
    <aside className="hidden md:flex w-60 h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)]">
      {/* Brand */}
      <div className="flex h-12 items-center gap-2 border-b border-[var(--color-border-subtle)] px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-[10px] font-bold text-white">
          D
        </div>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">DataMaster</span>
        {isSyncing && (
          <svg className="ml-auto h-3.5 w-3.5 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
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
            {item.to === '/wiki' && (
              <span className="flex items-center gap-1.5">
                {isWikiWriting && (
                  <span className="flex items-center gap-1 rounded-full bg-purple-500/20 px-1.5 py-0.5">
                    <svg className="w-3 h-3 text-purple-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                    </svg>
                    <span className="text-[9px] font-medium text-purple-300">저장 중</span>
                  </span>
                )}
                {!isWikiWriting && wikiStats.recentCount > 0 && (
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
                {wikiStats.totalPages > 0 && (
                  <span className="min-w-[20px] rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-[var(--color-text-secondary)]">
                    {wikiStats.totalPages}
                  </span>
                )}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Sync status panel */}
      <div className="mt-auto pb-2">
        <SyncPanel />
      </div>
    </aside>
  );
}
