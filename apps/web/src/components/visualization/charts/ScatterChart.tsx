import {
  ScatterChart as ReScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from 'recharts';
import type { DataItem } from '../types';
import { CHART_COLORS, ChartTooltip, AXIS_STYLE, GRID_STYLE, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
}

export function ScatterChartViz({ data, x, y }: Props) {
  const numericKeys = Object.keys(data[0] ?? {}).filter((k) => typeof data[0]?.[k] === 'number');
  const xKey = x ?? numericKeys[0] ?? 'x';
  const yKey = y?.[0] ?? numericKeys[1] ?? numericKeys[0] ?? 'y';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ReScatterChart margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} name={xKey} tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <YAxis dataKey={yKey} name={yKey} tick={AXIS_STYLE} axisLine={{ stroke: 'var(--color-border-subtle)' }} />
        <ZAxis range={[40, 200]} />
        <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-border)' }} />
        <Scatter
          data={data}
          fill={CHART_COLORS[0]}
          fillOpacity={0.7}
          stroke={CHART_COLORS[0]}
          strokeWidth={1}
          animationDuration={CHART_ANIMATION.duration}
          animationEasing="ease-out"
        />
      </ReScatterChart>
    </ResponsiveContainer>
  );
}
