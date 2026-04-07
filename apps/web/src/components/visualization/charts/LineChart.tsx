import {
  LineChart as ReLineChart,
  Line,
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
}

export function LineChartViz({ data, x, y }: Props) {
  const xKey = x ?? Object.keys(data[0] ?? {})[0] ?? 'name';
  const yKeys = y ?? Object.keys(data[0] ?? {}).filter((k) => k !== xKey);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ReLineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <YAxis tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <Tooltip content={<ChartTooltip />} />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />}
        {yKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--color-surface-1)', strokeWidth: 2, stroke: CHART_COLORS[i % CHART_COLORS.length] }}
            activeDot={{ r: 6, fill: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 2, stroke: 'var(--color-surface-1)' }}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing="ease-out"
          />
        ))}
      </ReLineChart>
    </ResponsiveContainer>
  );
}
