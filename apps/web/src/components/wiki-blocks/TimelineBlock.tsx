interface TimelineEntry {
  time: string;
  label: string;
  color?: string;
  detail?: string;
}

interface Props {
  entries: TimelineEntry[];
}

const COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  gray: 'bg-gray-500',
  cyan: 'bg-cyan-500',
  pink: 'bg-pink-500',
};

const COLOR_TEXT: Record<string, string> = {
  red: 'text-red-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  green: 'text-green-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  gray: 'text-gray-400',
  cyan: 'text-cyan-400',
  pink: 'text-pink-400',
};

const COLOR_BG: Record<string, string> = {
  red: 'bg-red-500/10 border-red-500/30',
  orange: 'bg-orange-500/10 border-orange-500/30',
  yellow: 'bg-yellow-500/10 border-yellow-500/30',
  green: 'bg-green-500/10 border-green-500/30',
  blue: 'bg-blue-500/10 border-blue-500/30',
  purple: 'bg-purple-500/10 border-purple-500/30',
  gray: 'bg-gray-500/10 border-gray-500/30',
  cyan: 'bg-cyan-500/10 border-cyan-500/30',
  pink: 'bg-pink-500/10 border-pink-500/30',
};

export function TimelineBlock({ entries }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="px-4 py-2 bg-[var(--color-surface-3)] border-b border-[var(--color-border)] flex items-center gap-2">
        <span className="text-xs">📅</span>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">Timeline</span>
        <span className="text-xs text-[var(--color-text-muted)]">{entries.length} events</span>
      </div>
      <div className="relative px-4 py-4">
        <div className="absolute left-[7.5rem] top-4 bottom-4 w-px bg-[var(--color-border)]" />
        <div className="space-y-0">
          {entries.map((entry, i) => {
            const c = entry.color || 'blue';
            return (
              <div key={i} className="flex items-start gap-4 relative group">
                <div className={`w-24 flex-shrink-0 text-right text-xs font-mono py-2 ${COLOR_TEXT[c] || 'text-blue-400'}`}>
                  {entry.time}
                </div>
                <div className="relative flex flex-col items-center flex-shrink-0" style={{ width: '12px' }}>
                  <div className={`w-3 h-3 rounded-full mt-2.5 z-10 ring-2 ring-[var(--color-surface-2)] ${COLOR_MAP[c] || 'bg-blue-500'}`} />
                  {i < entries.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[16px] ${COLOR_MAP[c] || 'bg-blue-500'} opacity-20`} />
                  )}
                </div>
                <div className={`flex-1 rounded-md border px-3 py-2 mb-2 ${COLOR_BG[c] || 'bg-blue-500/10 border-blue-500/30'}`}>
                  <div className={`text-sm font-medium ${COLOR_TEXT[c] || 'text-blue-400'}`}>
                    {entry.label}
                  </div>
                  {entry.detail && (
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{entry.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
