/**
 * Database table type definitions.
 * Currently using JSON file storage; types kept for future SQLite migration.
 */

export interface ChatSessionRow {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageRow {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: string | null;
  createdAt: number;
}

export interface KnowledgeRow {
  id: string;
  key: string;
  title: string;
  content: string;
  tags: string | null;
  source: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactRow {
  id: string;
  title: string;
  description: string | null;
  html: string;
  folderId: string | null;
  source: string | null;
  author: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}
