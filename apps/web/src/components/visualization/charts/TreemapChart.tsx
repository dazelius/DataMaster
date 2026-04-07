import { useState } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import type { DataItem } from '../types';
import { CHART_COLORS, TOOLTIP_STYLE, formatNumber, CHART_ANIMATION } from '../theme';

interface Props {
  data: DataItem[];
  x?: string;
  y?: string[];
}

interface TreeNode {
  name: string;
  size: number;
  fill: string;
  [key: string]: string | number;
}

function CustomContent(props: {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; fill?: string; size?: number;
  depth?: number; index?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, fill, size } = props;
  const [hovered, setHovered] = useState(false);

  if (width < 20 || height < 16) return null;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <rect
        x={x} y={y} width={width} height={height}
        rx={5}
        fill={fill}
        fillOpacity={hovered ? 1 : 0.8}
        stroke="var(--color-surface-1)"
        strokeWidth={2}
        style={{ transition: 'fill-opacity 150ms ease' }}
      />
      {width > 50 && height > 28 && (
        <>
          <text
            x={x + width / 2} y={y + height / 2 - (height > 44 ? 6 : 0)}
            textAnchor="middle" dominantBaseline="central"
            fontSize={Math.min(13, width / 8)} fill="#fff" fontWeight={600}
          >
            {String(name).length > Math.floor(width / 8) ? `${String(name).slice(0, Math.floor(width / 8))}…` : name}
          </text>
          {height > 44 && size != null && (
            <text
              x={x + width / 2} y={y + height / 2 + 12}
              textAnchor="middle" dominantBaseline="central"
              fontSize={10} fill="rgba(255,255,255,0.7)"
            >
              {formatNumber(size)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

export function TreemapChartViz({ data, x, y }: Props) {
  const keys = Object.keys(data[0] ?? {});
  const nameKey = x ?? keys.find((k) => typeof data[0]?.[k] === 'string') ?? keys[0] ?? 'name';
  const valueKey = y?.[0] ?? keys.find((k) => typeof data[0]?.[k] === 'number') ?? keys[1] ?? 'value';

  const treeData: TreeNode[] = data.map((item, i) => ({
    name: String(item[nameKey] ?? ''),
    size: Number(item[valueKey]) || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={treeData}
        dataKey="size"
        nameKey="name"
        content={<CustomContent />}
        animationDuration={CHART_ANIMATION.duration}
        animationEasing="ease-out"
      >
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(val) => formatNumber(val)}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}
