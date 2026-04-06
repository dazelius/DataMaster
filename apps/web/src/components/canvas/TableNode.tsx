import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SchemaColumn } from '@datamaster/shared';

interface TableNodeData {
  label: string;
  columns: SchemaColumn[];
  headerColor?: string | null;
  isSelected?: boolean;
  [key: string]: unknown;
}

const TYPE_COLORS: Record<string, string> = {
  int: '#34d399',
  integer: '#34d399',
  bigint: '#34d399',
  float: '#fbbf24',
  double: '#fbbf24',
  decimal: '#fbbf24',
  varchar: '#60a5fa',
  text: '#60a5fa',
  string: '#60a5fa',
  boolean: '#a78bfa',
  bool: '#a78bfa',
  date: '#fb923c',
  datetime: '#fb923c',
  timestamp: '#fb923c',
  json: '#f472b6',
  enum: '#f472b6',
};

function getTypeColor(type: string): string {
  const lower = type.toLowerCase();
  for (const [key, color] of Object.entries(TYPE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#71717a';
}

function TableNodeComponent({ data, selected }: NodeProps) {
  const { label, columns, headerColor, isSelected } = data as TableNodeData;
  const [expanded, setExpanded] = useState(true);
  const highlight = selected || isSelected;

  const pkCols = columns.filter((c) => c.isPrimaryKey);
  const fkCols = columns.filter((c) => c.isForeignKey && !c.isPrimaryKey);
  const regularCols = columns.filter((c) => !c.isPrimaryKey && !c.isForeignKey);
  const headerBg = headerColor ?? '#3b82f6';

  return (
    <div
      className="min-w-[260px] max-w-[340px] overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--color-surface-1)',
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${highlight ? 'var(--color-accent)' : 'var(--color-border)'}`,
        boxShadow: highlight
          ? '0 0 0 3px var(--color-accent-subtle), var(--shadow-elevated)'
          : 'var(--shadow-card)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !border-2 !rounded-full !-left-[5px]"
        style={{ background: headerBg, borderColor: 'var(--color-surface-1)' }}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2 cursor-pointer select-none"
        style={{ backgroundColor: headerBg }}
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-[12px] font-semibold text-white tracking-wide">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/50 font-medium">{columns.length}</span>
          <svg
            className={`w-3 h-3 text-white/40 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Columns */}
      {expanded && (
        <div className="py-1">
          {pkCols.length > 0 && (
            <div className="border-b border-[var(--color-border-subtle)] pb-1 mb-1">
              {pkCols.map((col) => <ColumnRow key={col.name} col={col} />)}
            </div>
          )}
          {fkCols.length > 0 && (
            <div className="border-b border-[var(--color-border-subtle)] pb-1 mb-1">
              {fkCols.map((col) => <ColumnRow key={col.name} col={col} />)}
            </div>
          )}
          {regularCols.map((col) => <ColumnRow key={col.name} col={col} />)}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !border-2 !rounded-full !-right-[5px]"
        style={{ background: headerBg, borderColor: 'var(--color-surface-1)' }}
      />
    </div>
  );
}

function ColumnRow({ col }: { col: SchemaColumn }) {
  const typeColor = getTypeColor(col.type);

  return (
    <div className="group flex items-center gap-2 px-3 py-[3px] hover:bg-[var(--color-surface-2)] transition-colors">
      <span className="w-5 flex-shrink-0 text-center">
        {col.isPrimaryKey ? (
          <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>PK</span>
        ) : col.isForeignKey ? (
          <span className="text-[10px] font-bold" style={{ color: '#60a5fa' }}>FK</span>
        ) : (
          <span className="text-[var(--color-text-muted)] text-[10px]">&middot;</span>
        )}
      </span>
      <span
        className="flex-1 truncate text-[11px]"
        style={{
          color: col.isPrimaryKey ? '#fcd34d' : col.isForeignKey ? '#93c5fd' : 'var(--color-text-primary)',
          fontWeight: col.isPrimaryKey ? 500 : 400,
        }}
      >
        {col.name}
      </span>
      <span className="flex-shrink-0 text-[10px] font-mono opacity-70" style={{ color: typeColor }}>
        {col.type}
      </span>
      {col.isNotNull && (
        <span className="flex-shrink-0 text-[8px] font-bold" style={{ color: 'var(--color-danger)', opacity: 0.7 }}>!</span>
      )}
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
