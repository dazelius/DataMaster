import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../../lib/api';

interface Props {
  path: string;
  startLine?: number;
  endLine?: number;
  lang?: string;
}

export function CodeEmbedBlock({ path, startLine, endLine, lang }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ repo: 'code', path });
    api.get<{ content: string }>(`/api/git/file?${params}`)
      .then((r) => {
        let lines = r.content.split('\n');
        if (startLine || endLine) {
          const s = Math.max((startLine ?? 1) - 1, 0);
          const e = endLine ?? lines.length;
          lines = lines.slice(s, e);
        }
        setCode(lines.join('\n'));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [path, startLine, endLine]);

  const detectedLang = lang || detectLang(path);
  const fileName = path.split(/[\\/]/).pop() || path;
  const lineRange = startLine && endLine ? ` (L${startLine}–${endLine})` : '';

  if (loading) return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 animate-pulse">
      <div className="h-4 w-48 bg-[var(--color-surface-3)] rounded mb-3" />
      <div className="h-32 bg-[var(--color-surface-3)] rounded" />
    </div>
  );

  if (error) return (
    <div className="my-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
      코드 로드 실패: {error}
    </div>
  );

  return (
    <div className="my-4 rounded-lg border border-[var(--color-border)] overflow-hidden">
      <div className="px-4 py-2 bg-[var(--color-surface-3)] border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs">💻</span>
          <span className="text-xs font-mono text-[var(--color-accent)]">{fileName}</span>
          <span className="text-[10px] text-[var(--color-text-muted)]">{lineRange}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{detectedLang}</span>
      </div>
      <SyntaxHighlighter
        language={detectedLang}
        style={oneDark}
        showLineNumbers
        startingLineNumber={startLine ?? 1}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '12px',
          background: 'var(--color-surface-1)',
          maxHeight: '500px',
        }}
      >
        {code || ''}
      </SyntaxHighlighter>
    </div>
  );
}

function detectLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    cs: 'csharp', lua: 'lua', json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', py: 'python',
    shader: 'hlsl', hlsl: 'hlsl', cginc: 'hlsl', compute: 'hlsl',
    md: 'markdown', sql: 'sql', proto: 'protobuf', toml: 'toml', ini: 'ini',
  };
  return map[ext] || 'text';
}
