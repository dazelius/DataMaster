import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useState } from 'react';
import type { DataItem } from '../types';
import { CHART_COLORS, ChartTooltip, AXIS_STYLE, GRID_STYLE, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
  stacked?: boolean;
  horizontal?: boolean;
}

export function BarChartViz({ data, x, y, stacked, horizontal }: Props) {
  const xKey = x ?? Object.keys(data[0] ?? {})[0] ?? 'name';
  const yKeys = y ?? Object.keys(data[0] ?? {}).filter((k) => k !== xKey);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const singleSeries = yKeys.length === 1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ReBarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
        onMouseMove={(state) => {
          if (state?.activeTooltipIndex != null) setHoverIdx(Number(state.activeTooltipIndex));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <CartesianGrid {...GRID_STYLE} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
            <YAxis dataKey={xKey} type="category" tick={AXIS_STYLE} width={80} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
            <YAxis tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
          </>
        )}
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-3)', opacity: 0.5 }} />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />}
        {yKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            stackId={stacked ? 'stack' : undefined}
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing="ease-out"
          >
            {singleSeries && data.map((_, di) => (
              <Cell
                key={di}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={hoverIdx != null && hoverIdx !== di ? 0.4 : 1}
                style={{ transition: 'fill-opacity 150ms ease' }}
              />
            ))}
          </Bar>
        ))}
      </ReBarChart>
    </ResponsiveContainer>
  );
}
