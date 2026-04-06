import { useState } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

const RELATION_LABELS: Record<string, string> = {
  'one-to-one': '1 : 1',
  'one-to-many': '1 : N',
  'many-to-one': 'N : 1',
  'many-to-many': 'N : N',
};

const RELATION_COLORS: Record<string, string> = {
  'one-to-one': '#a78bfa',
  'one-to-many': '#60a5fa',
  'many-to-one': '#34d399',
  'many-to-many': '#f472b6',
};

export function RelationEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const relationType = (data as any)?.relationType ?? 'one-to-many';
  const color = RELATION_COLORS[relationType] ?? '#6366f1';
  const active = hovered || selected;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Invisible wider path for easier hover */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={16} />

      <BaseEdge
        path={edgePath}
        style={{
          stroke: active ? color : `${color}88`,
          strokeWidth: active ? 2 : 1.2,
          transition: 'stroke 0.15s, stroke-width 0.15s',
        }}
      />

      {/* Label */}
      <foreignObject
        x={labelX - 18}
        y={labelY - 10}
        width={36}
        height={20}
        className="pointer-events-none overflow-visible"
      >
        <div
          className="flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border transition-all"
          style={{
            backgroundColor: active ? `${color}20` : '#18181b',
            borderColor: active ? color : '#3f3f46',
            color: active ? color : '#71717a',
          }}
        >
          {RELATION_LABELS[relationType] ?? '?'}
        </div>
      </foreignObject>
    </g>
  );
}
