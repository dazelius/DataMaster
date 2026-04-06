export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  createdAt: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'generating' | 'running' | 'done' | 'error';
  /** Bytes of tool input generated so far (while status is 'generating') */
  generatingBytes?: number;
  /** Streamed content preview for content-heavy tools (e.g. wiki_write) */
  generatingContent?: string;
  /** Partial info extracted before content field starts (path, title) */
  generatingPartial?: { path?: string; title?: string };
  /** Whether the content field has started being generated */
  contentStarted?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type SSEEvent =
  | { event: 'session'; data: { sessionId: string } }
  | { event: 'text_delta'; data: { delta: string; snapshot: string } }
  | { event: 'tool_start'; data: { toolName: string; toolInput: Record<string, unknown> } }
  | { event: 'tool_done'; data: { toolName: string; result: string } }
  | { event: 'tool_generating'; data: { toolName: string } }
  | { event: 'tool_generating_progress'; data: { bytes: number } }
  | { event: 'tool_content_delta'; data: { delta: string } }
  | { event: 'thinking'; data: { iteration: number } }
  | {
      event: 'done';
      data: { content: string; toolCalls: ToolCall[]; usage: TokenUsage };
    }
  | { event: 'error'; data: { message: string; recoverable: boolean } }
  | { event: 'heartbeat'; data: Record<string, never> };

export interface ChatSession {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
}
