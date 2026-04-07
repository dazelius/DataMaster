import {
  AreaChart as ReAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { DataItem } from '../types';
import { CHART_COLORS, ChartTooltip, AXIS_STYLE, GRID_STYLE, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
  stacked?: boolean;
}

export function AreaChartViz({ data, x, y, stacked }: Props) {
  const xKey = x ?? Object.keys(data[0] ?? {})[0] ?? 'name';
  const yKeys = y ?? Object.keys(data[0] ?? {}).filter((k) => k !== xKey);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ReAreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
        <defs>
          {yKeys.map((key, i) => (
            <linearGradient key={key} id={`area-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.35} />
              <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <YAxis tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <Tooltip content={<ChartTooltip />} />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />}
        {yKeys.map((key, i) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={`url(#area-grad-${key})`}
            strokeWidth={2.5}
            stackId={stacked ? 'stack' : undefined}
            activeDot={{ r: 5, fill: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 2, stroke: 'var(--color-surface-1)' }}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing="ease-out"
          />
        ))}
      </ReAreaChart>
    </ResponsiveContainer>
  );
}
