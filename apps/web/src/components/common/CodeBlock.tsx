import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const customTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'var(--color-surface-0)',
    margin: 0,
    padding: '1rem',
    fontSize: '13px',
    lineHeight: '1.6',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'none',
    fontSize: '13px',
    lineHeight: '1.6',
  },
};

const LANG_LABELS: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript',
  ts: 'TypeScript', typescript: 'TypeScript',
  tsx: 'TSX', jsx: 'JSX',
  py: 'Python', python: 'Python',
  cs: 'C#', csharp: 'C#',
  lua: 'Lua',
  sql: 'SQL',
  json: 'JSON', yaml: 'YAML', xml: 'XML',
  html: 'HTML', css: 'CSS', scss: 'SCSS',
  bash: 'Bash', sh: 'Shell', shell: 'Shell', powershell: 'PowerShell',
  cpp: 'C++', c: 'C', java: 'Java', go: 'Go', rust: 'Rust',
  markdown: 'Markdown', md: 'Markdown',
};

interface CodeBlockProps {
  code: string;
  language?: string;
  compact?: boolean;
}

export function CodeBlock({ code, language, compact }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lang = language ?? 'text';
  const label = LANG_LABELS[lang] ?? lang.toUpperCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`group relative rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden ${compact ? 'my-1.5' : 'my-3'}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-2)] border-b border-[var(--color-border-subtle)]">
        <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={lang}
          style={customTheme}
          showLineNumbers={!compact && code.split('\n').length > 3}
          lineNumberStyle={{ color: 'var(--color-text-muted)', opacity: 0.4, fontSize: '11px', minWidth: '2em', paddingRight: '1em' }}
          wrapLongLines={false}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
