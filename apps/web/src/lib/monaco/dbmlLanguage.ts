import type { languages } from 'monaco-editor';

export const DBML_LANGUAGE_ID = 'dbml';

export const dbmlLanguageConfig: languages.LanguageConfiguration = {
  comments: { lineComment: '//' },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string'] },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
};

export const dbmlTokenProvider: languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: true,

  keywords: [
    'Table', 'Ref', 'Enum', 'TableGroup', 'Project', 'Note',
    'as', 'null', 'not', 'unique', 'pk', 'primary', 'key',
    'default', 'increment', 'indexes', 'note', 'type',
    'headercolor', 'ref', 'cascade', 'restrict', 'set',
    'delete', 'update', 'no', 'action',
  ],

  typeKeywords: [
    'int', 'integer', 'bigint', 'smallint', 'tinyint',
    'float', 'double', 'decimal', 'numeric', 'real',
    'varchar', 'char', 'text', 'nvarchar', 'nchar', 'ntext',
    'boolean', 'bool', 'bit',
    'date', 'datetime', 'datetime2', 'timestamp', 'time',
    'json', 'jsonb', 'xml', 'blob', 'binary', 'varbinary',
    'uuid', 'serial', 'bigserial',
    'enum', 'array',
  ],

  operators: ['>', '<', '-', ':', '.'],

  symbols: /[=><!~?:&|+\-*/^%]+/,

  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],

      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@typeKeywords': 'type',
          '@default': 'identifier',
        },
      }],

      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/'([^'\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],
      [/'''/, 'string', '@string_multi'],

      [/\d+/, 'number'],

      [/[{}()[\]]/, '@brackets'],
      [/@symbols/, 'operator'],
      [/[;,.]/, 'delimiter'],
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/"/, 'string', '@pop'],
    ],

    string_single: [
      [/[^\\']+/, 'string'],
      [/'/, 'string', '@pop'],
    ],

    string_multi: [
      [/[^']+/, 'string'],
      [/'''/, 'string', '@pop'],
      [/'/, 'string'],
    ],
  },
};

export const dbmlThemeRules: { token: string; foreground: string; fontStyle?: string }[] = [
  { token: 'keyword', foreground: '#c084fc', fontStyle: 'bold' },
  { token: 'type', foreground: '#34d399' },
  { token: 'identifier', foreground: '#e4e4e7' },
  { token: 'string', foreground: '#fbbf24' },
  { token: 'number', foreground: '#f472b6' },
  { token: 'comment', foreground: '#52525b', fontStyle: 'italic' },
  { token: 'operator', foreground: '#60a5fa' },
  { token: 'delimiter', foreground: '#71717a' },
  { token: '@brackets', foreground: '#a1a1aa' },
];
