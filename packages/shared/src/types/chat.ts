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
  status: 'pending' | 'running' | 'done' | 'error';
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
