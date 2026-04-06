import type { ToolCall } from '@datamaster/shared';
import { getToolLabel } from '@datamaster/shared';

interface ToolProgressBarProps {
  tools: ToolCall[];
}

export function ToolProgressBar({ tools }: ToolProgressBarProps) {
  if (tools.length === 0) return null;

  return (
    <div className="mx-4 md:mx-6 my-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
      <div className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Processing...</div>
      <div className="space-y-1">
        {tools.map((tool, i) => (
          <div key={`${tool.name}-${i}`} className="flex items-center gap-2 text-xs">
            <span>
              {tool.status === 'done' ? '\u2705' : tool.status === 'error' ? '\u274C' : '\u23F3'}
            </span>
            <span className="text-[var(--color-text-secondary)]">{getToolLabel(tool.name)}</span>
            {tool.status === 'running' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
