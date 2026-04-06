import { useChatStore } from '../stores/chatStore';
import { useToastStore } from '../stores/toastStore';
import { parseSSELines } from './api';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function getChatEndpoint(): string {
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:3001/api/chat`;
  }
  return `${API_BASE}/api/chat`;
}

let abortController: AbortController | null = null;

export function isChatStreaming(): boolean {
  return abortController !== null;
}

export async function startChatStream(message: string): Promise<void> {
  const store = useChatStore.getState();
  if (store.isStreaming) return;

  store.setStreaming(true);
  store.initStreamSegments();

  abortController = new AbortController();
  let buffer = '';

  try {
    const res = await fetch(getChatEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId: store.currentSessionId }),
      signal: abortController.signal,
    });

    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = parseSSELines(buffer);

      const lastNewline = buffer.lastIndexOf('\n\n');
      buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 2) : buffer;

      for (const { event, data } of events) {
        const s = useChatStore.getState();
        try {
          const parsed = JSON.parse(data);
          switch (event) {
            case 'session':
              s.setCurrentSession(parsed.sessionId);
              break;
            case 'text_delta':
              s.appendStreamingText(parsed.delta);
              break;
            case 'thinking':
              s.advanceIteration();
              break;
            case 'tool_generating':
              s.addActiveTool({
                id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: parsed.toolName,
                input: {},
                status: 'generating',
              });
              break;
            case 'tool_generating_progress':
              s.updateToolGeneratingProgress(parsed.bytes, parsed.partial, parsed.contentStarted);
              break;
            case 'tool_content_delta':
              s.appendToolContent(parsed.delta);
              break;
            case 'tool_start':
              s.promoteGeneratingTool(parsed.toolName, parsed.toolInput);
              break;
            case 'tool_done':
              s.updateToolStatus(parsed.toolName, 'done', parsed.result);
              if (parsed.toolName === 'wiki_write') {
                try {
                  const res = JSON.parse(parsed.result);
                  useToastStore.getState().addToast({
                    message: `위키 업데이트: ${res.title ?? res.path}`,
                    type: 'success',
                    icon: 'wiki',
                  });
                } catch { /* ignore */ }
              }
              break;
            case 'done':
              s.addMessage({
                id: `msg-${Date.now()}`,
                sessionId: s.currentSessionId ?? '',
                role: 'assistant',
                content: parsed.content,
                toolCalls: parsed.toolCalls,
                createdAt: Date.now() / 1000,
              });
              break;
            case 'error':
              console.error('SSE error:', parsed.message);
              break;
          }
        } catch { /* ignore malformed events */ }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Chat stream error:', err);
    }
  } finally {
    useChatStore.getState().resetStreamState();
    abortController = null;
  }
}

export function cancelChatStream(): void {
  const st = useChatStore.getState();
  const fullText = st.streamingSegments
    .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
    .map((s) => s.content)
    .join('\n\n');
  if (fullText.trim()) {
    st.addMessage({
      id: `msg-cancel-${Date.now()}`,
      sessionId: st.currentSessionId ?? '',
      role: 'assistant',
      content: fullText + '\n\n_(응답이 중단되었습니다)_',
      createdAt: Date.now() / 1000,
    });
  }
  abortController?.abort();
}
