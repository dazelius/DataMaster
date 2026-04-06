import { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount, loader } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import {
  DBML_LANGUAGE_ID,
  dbmlLanguageConfig,
  dbmlTokenProvider,
  dbmlThemeRules,
} from '../../lib/monaco/dbmlLanguage';

let languageRegistered = false;

function registerDbmlLanguage() {
  if (languageRegistered) return;
  languageRegistered = true;

  loader.init().then((monaco) => {
    if (!monaco.languages.getLanguages().some((l: { id: string }) => l.id === DBML_LANGUAGE_ID)) {
      monaco.languages.register({ id: DBML_LANGUAGE_ID });
      monaco.languages.setLanguageConfiguration(DBML_LANGUAGE_ID, dbmlLanguageConfig);
      monaco.languages.setMonarchTokensProvider(DBML_LANGUAGE_ID, dbmlTokenProvider);
    }

    monaco.editor.defineTheme('dbml-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: dbmlThemeRules,
      colors: {
        'editor.background': '#111113',
        'editor.lineHighlightBackground': '#18181b',
        'editorLineNumber.foreground': '#3f3f46',
        'editorLineNumber.activeForeground': '#71717a',
        'editor.selectionBackground': '#3b82f630',
        'editorCursor.foreground': '#60a5fa',
      },
    });
  });
}

export function DBMLEditor() {
  const editorRef = useRef<any>(null);
  const { dbmlText, setDbmlText, parseError } = useEditorStore();

  useEffect(() => {
    registerDbmlLanguage();
  }, []);

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.focus();
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) setDbmlText(value);
    },
    [setDbmlText],
  );

  return (
    <div className="relative flex h-full flex-col bg-[var(--color-surface-1)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3.5 py-2">
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">DBML Editor</span>
        {parseError && (
          <span className="text-[10px] text-[var(--color-danger)] truncate max-w-[200px]" title={parseError}>
            Parse Error
          </span>
        )}
      </div>

      {parseError && (
        <div className="border-b border-red-900/30 bg-red-950/20 px-3.5 py-1.5 text-[11px] text-[var(--color-danger)] font-mono">
          {parseError}
        </div>
      )}

      <Editor
        height="100%"
        language={DBML_LANGUAGE_ID}
        theme="dbml-dark"
        value={dbmlText}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          renderLineHighlight: 'line',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true },
          padding: { top: 8, bottom: 8 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
        }}
      />
    </div>
  );
}
