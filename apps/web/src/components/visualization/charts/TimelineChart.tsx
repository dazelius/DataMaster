import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DataItem } from '../types';
import { CHART_COLORS, ChartTooltip, AXIS_STYLE, GRID_STYLE, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
}

export function TimelineChartViz({ data, x, y }: Props) {
  const keys = Object.keys(data[0] ?? {});
  const nameKey = x ?? keys.find((k) => typeof data[0]?.[k] === 'string') ?? keys[0] ?? 'name';

  const hasStartEnd = keys.includes('start') && keys.includes('end');

  if (hasStartEnd) {
    const processed = data.map((item, i) => ({
      name: String(item[nameKey] ?? ''),
      start: Number(item.start) || 0,
      duration: (Number(item.end) || 0) - (Number(item.start) || 0),
      _color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={processed} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
          <YAxis dataKey="name" type="category" tick={AXIS_STYLE} width={80} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-3)', opacity: 0.3 }} />
          <Bar dataKey="start" stackId="timeline" fill="transparent" animationDuration={0} />
          <Bar dataKey="duration" stackId="timeline" radius={[0, 6, 6, 0]} animationDuration={CHART_ANIMATION.duration} animationEasing="ease-out">
            {processed.map((entry, i) => (
              <Cell key={i} fill={entry._color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const valueKey = y?.[0] ?? keys.find((k) => k !== nameKey && typeof data[0]?.[k] === 'number') ?? keys[1] ?? 'value';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis type="number" tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <YAxis dataKey={nameKey} type="category" tick={AXIS_STYLE} width={80} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-3)', opacity: 0.3 }} />
        <Bar dataKey={valueKey} radius={[0, 6, 6, 0]} animationDuration={CHART_ANIMATION.duration} animationEasing="ease-out">
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
