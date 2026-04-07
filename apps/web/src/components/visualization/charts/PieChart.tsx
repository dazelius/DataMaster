import {
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { DataItem } from '../types';
import { CHART_COLORS, formatNumber, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
}

function CustomTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value?: number; payload?: { fill?: string } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div style={{
      backgroundColor: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      minWidth: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.payload?.fill, flexShrink: 0 }} />
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{item.name}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(item.value)}
      </div>
    </div>
  );
}

export function PieChartViz({ data, x, y }: Props) {
  const keys = Object.keys(data[0] ?? {});
  const nameKey = x ?? keys.find((k) => typeof data[0]?.[k] === 'string') ?? keys[0] ?? 'label';
  const valueKey = y?.[0] ?? keys.find((k) => typeof data[0]?.[k] === 'number') ?? keys[1] ?? 'value';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RePieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius="70%"
          innerRadius="42%"
          paddingAngle={2}
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={{ stroke: 'var(--color-text-muted)', strokeWidth: 1 }}
          style={{ fontSize: 11, outline: 'none' }}
          animationDuration={CHART_ANIMATION.duration}
          animationEasing="ease-out"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--color-surface-1)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
      </RePieChart>
    </ResponsiveContainer>
  );
}
