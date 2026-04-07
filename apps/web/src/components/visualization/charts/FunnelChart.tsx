import { Funnel, FunnelChart as ReFunnelChart, Tooltip, LabelList, ResponsiveContainer, Cell } from 'recharts';
import type { DataItem } from '../types';
import { CHART_COLORS, TOOLTIP_STYLE, formatNumber, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
}

export function FunnelChartViz({ data, x, y }: Props) {
  const keys = Object.keys(data[0] ?? {});
  const nameKey = x ?? keys.find((k) => typeof data[0]?.[k] === 'string') ?? keys[0] ?? 'name';
  const valueKey = y?.[0] ?? keys.find((k) => typeof data[0]?.[k] === 'number') ?? keys[1] ?? 'value';

  const funnelData = data.map((item, i) => ({
    name: String(item[nameKey] ?? ''),
    value: Number(item[valueKey]) || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const maxVal = Math.max(...funnelData.map((d) => d.value), 1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ReFunnelChart margin={{ top: 8, right: 80, left: 8, bottom: 8 }}>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(val) => {
            const n = Number(val) || 0;
            const pct = ((n / maxVal) * 100).toFixed(1);
            return `${formatNumber(n)} (${pct}%)`;
          }}
        />
        <Funnel
          dataKey="value"
          data={funnelData}
          isAnimationActive
          animationDuration={CHART_ANIMATION.duration}
          animationEasing="ease-out"
        >
          {funnelData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} stroke="var(--color-surface-1)" strokeWidth={2} />
          ))}
          <LabelList
            position="right"
            fill="var(--color-text-secondary)"
            stroke="none"
            fontSize={11}
            dataKey="name"
          />
        </Funnel>
      </ReFunnelChart>
    </ResponsiveContainer>
  );
}
