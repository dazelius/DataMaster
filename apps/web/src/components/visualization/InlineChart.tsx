import { useState, useMemo } from 'react';
import type { ChartConfig, ChartType } from './types';
import { useChartData } from './useChartData';
import { formatNumber } from './theme';
import {
  BarChartViz,
  LineChartViz,
  AreaChartViz,
  PieChartViz,
  RadarChartViz,
  ScatterChartViz,
  TreemapChartViz,
  FunnelChartViz,
  TimelineChartViz,
} from './charts';

const CHART_TYPE_LABELS: Record<string, string> = {
  bar: '바 차트',
  line: '라인 차트',
  area: '에리어 차트',
  pie: '파이 차트',
  radar: '레이더 차트',
  scatter: '산점도',
  treemap: '트리맵',
  funnel: '퍼널',
  timeline: '타임라인',
};

const CHART_TYPE_ICONS: Record<string, string> = {
  bar: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  line: 'M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941',
  area: 'M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941',
  pie: 'M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z',
  radar: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15',
  scatter: 'M3 3v18h18 M7 14a1 1 0 110-2 1 1 0 010 2zm4-4a1 1 0 110-2 1 1 0 010 2zm5 2a1 1 0 110-2 1 1 0 010 2zm3-5a1 1 0 110-2 1 1 0 010 2z',
  treemap: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  funnel: 'M12 3c4.97 0 9 1.343 9 3v1.5L14 14v5.25c0 .414-.672.75-1.5.75h-1c-.828 0-1.5-.336-1.5-.75V14L3 7.5V6c0-1.657 4.03-3 9-3z',
  timeline: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
};

const SWITCHABLE_TYPES: ChartType[] = ['bar', 'line', 'area'];

function heightForType(type: string, dataLen: number): number {
  if (type === 'pie' || type === 'radar') return 320;
  if (type === 'treemap') return Math.max(260, Math.min(420, dataLen * 30));
  if (type === 'funnel') return Math.max(220, Math.min(420, dataLen * 50));
  if (type === 'timeline') return Math.max(220, Math.min(500, dataLen * 36 + 40));
  return 300;
}

export function InlineChart({ config }: { config: ChartConfig }) {
  const { data: sqlData, loading, error } = useChartData(config.sql);
  const [collapsed, setCollapsed] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [activeType, setActiveType] = useState<ChartType>(config.type);

  const chartData = config.data ?? sqlData;
  const chartHeight = heightForType(activeType, chartData?.length ?? 0);
  const canSwitch = SWITCHABLE_TYPES.includes(config.type);
  const iconPath = CHART_TYPE_ICONS[activeType] ?? CHART_TYPE_ICONS.bar;

  const columns = useMemo(() => {
    if (!chartData?.length) return [];
    return Object.keys(chartData[0]);
  }, [chartData]);

  const effectiveConfig = useMemo(() => ({
    ...config,
    type: activeType,
  }), [config, activeType]);

  return (
    <div className="my-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <svg className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
          <span className="flex-1 text-[11px] font-semibold text-[var(--color-text-secondary)] truncate">
            {config.title ?? CHART_TYPE_LABELS[activeType] ?? activeType}
          </span>
        </button>

        {/* Row count badge */}
        {chartData && chartData.length > 0 && !collapsed && (
          <span className="text-[9px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-3)] rounded-full px-1.5 py-0.5 tabular-nums flex-shrink-0">
            {chartData.length} rows
          </span>
        )}

        {/* Chart type switcher */}
        {canSwitch && !collapsed && (
          <div className="flex items-center gap-px bg-[var(--color-surface-0)] rounded-lg p-0.5 flex-shrink-0">
            {SWITCHABLE_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all ${
                  activeType === t
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {t === 'bar' ? 'Bar' : t === 'line' ? 'Line' : 'Area'}
              </button>
            ))}
          </div>
        )}

        {/* Data table toggle */}
        {chartData && chartData.length > 0 && !collapsed && (
          <button
            onClick={() => setShowTable(!showTable)}
            className={`p-1 rounded-md transition-colors flex-shrink-0 ${
              showTable ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
            }`}
            title="데이터 테이블 보기"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v.375" />
            </svg>
          </button>
        )}

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors flex-shrink-0">
          <svg className={`w-3 h-3 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="animate-[fadeSlideIn_0.3s_ease-out]">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
              <span className="text-[11px] text-[var(--color-text-muted)]">데이터 로딩 중...</span>
            </div>
          ) : error ? (
            <div className="px-4 py-4 flex items-start gap-2">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <div className="text-[11px] font-medium text-red-400 mb-0.5">쿼리 오류</div>
                <div className="text-[10px] text-red-400/70 font-mono">{error}</div>
              </div>
            </div>
          ) : !chartData || chartData.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)] opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
              <div className="text-[11px] text-[var(--color-text-muted)]">데이터가 없습니다</div>
            </div>
          ) : (
            <>
              {/* Chart */}
              <div className="px-3 py-3" style={{ height: chartHeight }}>
                <ChartRenderer config={effectiveConfig} data={chartData} />
              </div>

              {/* Data Table */}
              {showTable && (
                <div className="border-t border-[var(--color-border-subtle)] max-h-[200px] overflow-auto">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0">
                      <tr>
                        {columns.map((col) => (
                          <th key={col} className="bg-[var(--color-surface-2)] text-[var(--color-text-muted)] font-semibold text-left px-2.5 py-1.5 border-b border-[var(--color-border-subtle)]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row, ri) => (
                        <tr key={ri} className="hover:bg-[var(--color-surface-2)] transition-colors">
                          {columns.map((col) => (
                            <td key={col} className="px-2.5 py-1 text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] tabular-nums">
                              {typeof row[col] === 'number' ? formatNumber(row[col]) : String(row[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChartRenderer({ config, data }: { config: ChartConfig; data: NonNullable<ChartConfig['data']> }) {
  const { type, x, y, stacked, horizontal } = config;

  switch (type) {
    case 'bar':
      return <BarChartViz data={data} x={x} y={y} stacked={stacked} horizontal={horizontal} />;
    case 'line':
      return <LineChartViz data={data} x={x} y={y} />;
    case 'area':
      return <AreaChartViz data={data} x={x} y={y} stacked={stacked} />;
    case 'pie':
      return <PieChartViz data={data} x={x} y={y} />;
    case 'radar':
      return <RadarChartViz data={data} x={x} y={y} />;
    case 'scatter':
      return <ScatterChartViz data={data} x={x} y={y} />;
    case 'treemap':
      return <TreemapChartViz data={data} x={x} y={y} />;
    case 'funnel':
      return <FunnelChartViz data={data} x={x} y={y} />;
    case 'timeline':
      return <TimelineChartViz data={data} x={x} y={y} />;
    default:
      return <div className="px-4 py-3 text-[11px] text-[var(--color-text-muted)]">지원하지 않는 차트 타입: {type}</div>;
  }
}
