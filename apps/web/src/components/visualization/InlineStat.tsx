import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  RadarChart as ReRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Tooltip,
} from 'recharts';
import type { StatConfig, DataItem } from './types';
import { useChartData } from './useChartData';
import { CHART_COLORS, formatNumber, ChartTooltip } from './theme';

/* ── KPI Card ───────────────────────────────────── */

function KpiCard({ config, sqlData }: { config: StatConfig; sqlData: DataItem[] | null }) {
  const displayValue = useMemo(() => {
    if (config.value != null) return String(config.value);
    if (sqlData?.[0]) {
      const keys = Object.keys(sqlData[0]);
      const valKey = keys.find((k) => k.toLowerCase().includes('value') || k.toLowerCase().includes('avg') || k.toLowerCase().includes('count') || k.toLowerCase().includes('sum')) ?? keys[0];
      if (valKey) {
        const raw = sqlData[0][valKey];
        if (typeof raw === 'number') return formatNumber(raw);
        return String(raw ?? '');
      }
    }
    return '—';
  }, [config.value, sqlData]);

  const changeNum = config.change ? parseFloat(config.change) : null;
  const isPositive = changeNum != null && changeNum > 0;
  const isNegative = changeNum != null && changeNum < 0;

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        {config.title && (
          <div className="text-[11px] text-[var(--color-text-muted)] font-medium mb-1.5 truncate uppercase tracking-wider">{config.title}</div>
        )}
        <div className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight animate-[countUp_0.5s_ease-out]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {displayValue}
        </div>
      </div>
      {config.change && (
        <div className={`flex items-center gap-1 text-sm font-semibold px-2.5 py-1.5 rounded-lg ${
          isPositive ? 'text-emerald-400 bg-emerald-500/10' :
          isNegative ? 'text-red-400 bg-red-500/10' :
          'text-[var(--color-text-muted)] bg-[var(--color-surface-2)]'
        }`}>
          {isPositive && (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          )}
          {isNegative && (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
            </svg>
          )}
          {config.change}
        </div>
      )}
    </div>
  );
}

/* ── Sparkline ──────────────────────────────────── */

function Sparkline({ config, sqlData }: { config: StatConfig; sqlData: DataItem[] | null }) {
  const chartData = config.data ?? sqlData;
  if (!chartData || chartData.length === 0) return <EmptyState />;

  const keys = Object.keys(chartData[0]);
  const yKey = config.y ?? keys.find((k) => typeof chartData[0]?.[k] === 'number') ?? keys[1] ?? keys[0];

  const stats = useMemo(() => {
    const values = chartData.map((d) => Number(d[yKey]) || 0);
    const last = values[values.length - 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { last, min, max };
  }, [chartData, yKey]);

  return (
    <div className="px-4 py-3">
      <div className="flex items-end justify-between mb-2">
        <div>
          {config.title && (
            <div className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wider">{config.title}</div>
          )}
          <div className="text-xl font-bold text-[var(--color-text-primary)] mt-0.5 animate-[countUp_0.5s_ease-out]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(stats.last)}
          </div>
        </div>
        <div className="flex gap-3 text-[9px] text-[var(--color-text-muted)]">
          <span>min <span className="text-[var(--color-text-secondary)] font-medium">{formatNumber(stats.min)}</span></span>
          <span>max <span className="text-[var(--color-text-secondary)] font-medium">{formatNumber(stats.max)}</span></span>
        </div>
      </div>
      <div style={{ height: 56 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id="spark-grad-v2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey={yKey}
              stroke={CHART_COLORS[0]}
              fill="url(#spark-grad-v2)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: CHART_COLORS[0], strokeWidth: 2, stroke: 'var(--color-surface-1)' }}
              animationDuration={800}
              animationEasing="ease-out"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                color: 'var(--color-text-primary)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
              formatter={(val) => [formatNumber(val), yKey]}
              labelStyle={{ display: 'none' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Progress Bars ──────────────────────────────── */

function ProgressBars({ config }: { config: StatConfig }) {
  const items = config.items ?? [];
  if (items.length === 0) return <EmptyState />;

  return (
    <div className="px-4 py-3 space-y-3">
      {config.title && (
        <div className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wider">{config.title}</div>
      )}
      {items.map((item, i) => {
        const pct = item.max > 0 ? Math.min(100, (item.value / item.max) * 100) : 0;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return (
          <div key={i}>
            <div className="flex justify-between items-baseline text-[11px] mb-1.5">
              <span className="text-[var(--color-text-secondary)] font-medium">{item.label}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold tabular-nums" style={{ color }}>{pct.toFixed(0)}%</span>
                <span className="text-[9px] text-[var(--color-text-muted)]">{formatNumber(item.value)}/{formatNumber(item.max)}</span>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--color-surface-0)] overflow-hidden">
              <div
                className="h-full rounded-full animate-[progressFill_0.8s_ease-out]"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}40`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Stat Comparison (Radar Overlay + Value Table) ─ */

function StatComparison({ config, sqlData }: { config: StatConfig; sqlData: DataItem[] | null }) {
  const chartData = config.data ?? sqlData;
  if (!chartData || chartData.length < 2) return <EmptyState />;

  const keys = config.keys ?? Object.keys(chartData[0]).filter((k) => typeof chartData[0]?.[k] === 'number');
  const nameKey = Object.keys(chartData[0]).find((k) => typeof chartData[0]?.[k] === 'string') ?? 'name';
  const names = chartData.map((row) => String(row[nameKey] ?? ''));

  const radarData = keys.map((key) => {
    const entry: Record<string, string | number> = { stat: key };
    chartData.forEach((row, i) => {
      entry[names[i] || `item${i}`] = Number(row[key]) || 0;
    });
    return entry;
  });

  return (
    <div className="px-3 py-3">
      {config.title && (
        <div className="text-[10px] text-[var(--color-text-muted)] font-medium mb-1 text-center uppercase tracking-wider">{config.title}</div>
      )}

      {/* Legend */}
      <div className="flex justify-center gap-4 mb-1">
        {names.map((name, i) => (
          <div key={name} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            {name}
          </div>
        ))}
      </div>

      {/* Radar */}
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ReRadarChart data={radarData} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="stat" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
            <Tooltip content={<ChartTooltip />} />
            {names.map((name, i) => (
              <Radar
                key={name}
                name={name}
                dataKey={name}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
          </ReRadarChart>
        </ResponsiveContainer>
      </div>

      {/* Value comparison table */}
      <div className="mt-2 rounded-lg bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)] overflow-hidden">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-1.5 text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border-subtle)]">Stat</th>
              {names.map((name, i) => (
                <th key={name} className="text-right px-2.5 py-1.5 font-semibold border-b border-[var(--color-border-subtle)]" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const values = chartData.map((row) => Number(row[key]) || 0);
              const maxVal = Math.max(...values);
              return (
                <tr key={key} className="hover:bg-[var(--color-surface-2)] transition-colors">
                  <td className="px-2.5 py-1 text-[var(--color-text-secondary)] font-medium">{key}</td>
                  {values.map((val, i) => (
                    <td
                      key={i}
                      className="text-right px-2.5 py-1 tabular-nums"
                      style={{
                        color: val === maxVal ? CHART_COLORS[i % CHART_COLORS.length] : 'var(--color-text-muted)',
                        fontWeight: val === maxVal ? 700 : 400,
                      }}
                    >
                      {formatNumber(val)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Empty State ────────────────────────────────── */

function EmptyState() {
  return (
    <div className="px-4 py-4 text-center">
      <svg className="w-6 h-6 mx-auto mb-1.5 text-[var(--color-text-muted)] opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <div className="text-[11px] text-[var(--color-text-muted)]">데이터가 없습니다</div>
    </div>
  );
}

/* ── Main Entry ─────────────────────────────────── */

export function InlineStat({ config }: { config: StatConfig }) {
  const { data: sqlData, loading, error } = useChartData(config.sql);

  return (
    <div className="my-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden animate-[fadeSlideIn_0.3s_ease-out]">
      {loading ? (
        <div className="px-4 py-6 flex items-center justify-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
          <span className="text-[11px] text-[var(--color-text-muted)]">데이터 로딩 중...</span>
        </div>
      ) : error ? (
        <div className="px-4 py-3 flex items-start gap-2">
          <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div className="text-[11px] text-red-400">{error}</div>
        </div>
      ) : (
        <>
          {config.type === 'kpi' && <KpiCard config={config} sqlData={sqlData} />}
          {config.type === 'sparkline' && <Sparkline config={config} sqlData={sqlData} />}
          {config.type === 'progress' && <ProgressBars config={config} />}
          {config.type === 'compare' && <StatComparison config={config} sqlData={sqlData} />}
        </>
      )}
    </div>
  );
}
