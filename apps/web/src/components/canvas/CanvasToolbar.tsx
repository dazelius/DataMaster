import { useReactFlow } from '@xyflow/react';

interface CanvasToolbarProps {
  onAutoLayout: () => void;
  onExportPng: () => void;
  direction: 'LR' | 'TB';
  onToggleDirection: () => void;
}

export function CanvasToolbar({ onAutoLayout, onExportPng, direction, onToggleDirection }: CanvasToolbarProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <div
      className="absolute right-3 top-3 z-10 flex flex-col gap-0.5 p-1"
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-elevated)',
      }}
    >
      <ToolbarButton onClick={() => zoomIn()} title="Zoom In" icon="M12 6v12m6-6H6" />
      <ToolbarButton onClick={() => zoomOut()} title="Zoom Out" icon="M18 12H6" />
      <ToolbarButton
        onClick={() => fitView({ padding: 0.15, duration: 300 })}
        title="Fit View"
        icon="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
      />

      <div className="my-0.5 h-px bg-[var(--color-border)]" />

      <ToolbarButton
        onClick={onAutoLayout}
        title="Auto Layout"
        icon="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4z"
      />
      <ToolbarButton onClick={onToggleDirection} title={`Layout: ${direction}`}>
        <span className="text-[10px] font-bold">{direction === 'LR' ? '\u2192' : '\u2193'}</span>
      </ToolbarButton>

      <div className="my-0.5 h-px bg-[var(--color-border)]" />

      <ToolbarButton
        onClick={onExportPng}
        title="Export PNG"
        icon="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  icon,
}: {
  children?: React.ReactNode;
  onClick: () => void;
  title: string;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
    >
      {icon ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      ) : children}
    </button>
  );
}
