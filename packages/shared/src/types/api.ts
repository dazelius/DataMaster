import type { ParsedSchema } from './schema.js';
import type { ChatSession, ChatMessage } from './chat.js';
import type { GitCommit, GitDiff, GitStatus, GitSyncResult } from './git.js';

export interface ApiError {
  error: string;
  code: string;
  statusCode: number;
  recoverable: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime: number;
}

export interface DataFilesResponse {
  files: { path: string; size: number; lastModified: string }[];
}

export interface DataSchemaResponse {
  schema: ParsedSchema;
  dbml: string;
  dataFiles: string[];
}

export interface GitLogResponse {
  commits: GitCommit[];
  total: number;
}

export interface GitDiffResponse {
  diff: GitDiff;
}

export interface GitStatusResponse {
  repos: GitStatus[];
}

export interface GitSyncResponse {
  results: GitSyncResult[];
}

export interface ChatSessionsResponse {
  sessions: ChatSession[];
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
}
