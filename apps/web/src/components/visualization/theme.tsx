import type { ReactNode } from 'react';

export const CHART_COLORS = [
  '#6366f1', // indigo (accent)
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#facc15', // yellow
  '#34d399', // emerald
  '#fb923c', // orange
  '#a78bfa', // violet
  '#38bdf8', // sky
  '#f87171', // red
  '#4ade80', // green
];

export const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: 'var(--color-text-primary)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

export const LEGEND_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-secondary)',
};

export const AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--color-text-muted)',
};

export const GRID_STYLE = {
  stroke: 'var(--color-border-subtle)',
  strokeDasharray: '3 3',
};

export function formatNumber(val: unknown): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

interface TooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  children?: ReactNode;
}

export function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      minWidth: 120,
    }}>
      {label != null && (
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 5 }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--color-text-muted)', flex: 1 }}>{entry.name ?? entry.dataKey}</span>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const CHART_ANIMATION = {
  duration: 800,
  easing: 'ease-out' as const,
};
