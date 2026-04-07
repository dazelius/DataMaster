import {
  RadarChart as ReRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { DataItem } from '../types';
import { CHART_COLORS, ChartTooltip, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
}

export function RadarChartViz({ data, x, y }: Props) {
  const xKey = x ?? Object.keys(data[0] ?? {})[0] ?? 'subject';
  const yKeys = y ?? Object.keys(data[0] ?? {}).filter((k) => k !== xKey);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ReRadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
        <PolarGrid stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
        <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
        <PolarRadiusAxis tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }} axisLine={false} />
        <Tooltip content={<ChartTooltip />} />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />}
        {yKeys.map((key, i) => (
          <Radar
            key={key}
            name={key}
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing="ease-out"
            dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
          />
        ))}
      </ReRadarChart>
    </ResponsiveContainer>
  );
}
