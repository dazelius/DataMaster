import { useCallback, useRef } from 'react';
import { useChatStore } from '../../../stores/chatStore';
import { parseSSELines } from '../../../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null);
  const store = useChatStore();

  const sendMessage = useCallback(async (message: string) => {
    if (store.isStreaming) return;

    store.setStreaming(true);
    store.setStreamingText('');
    store.clearActiveTools();
    useChatStore.setState({ toolHistory: [], iteration: 0 });

    abortRef.current = new AbortController();
    let buffer = '';

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId: store.currentSessionId }),
        signal: abortRef.current.signal,
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
          try {
            const parsed = JSON.parse(data);
            switch (event) {
              case 'session':
                store.setCurrentSession(parsed.sessionId);
                break;
              case 'text_delta':
                store.appendStreamingText(parsed.delta);
                break;
              case 'thinking':
                store.advanceIteration();
                break;
              case 'tool_start':
                store.addActiveTool({
                  id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: parsed.toolName,
                  input: parsed.toolInput,
                  status: 'running',
                });
                break;
              case 'tool_done':
                store.updateToolStatus(parsed.toolName, 'done', parsed.result);
                break;
              case 'done':
                store.addMessage({
                  id: `msg-${Date.now()}`,
                  sessionId: store.currentSessionId ?? '',
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
      store.resetStreamState();
      abortRef.current = null;
    }
  }, [store]);

  const cancel = useCallback(() => {
    const currentText = useChatStore.getState().streamingText;
    if (currentText.trim()) {
      useChatStore.getState().addMessage({
        id: `msg-cancel-${Date.now()}`,
        sessionId: useChatStore.getState().currentSessionId ?? '',
        role: 'assistant',
        content: currentText + '\n\n_(응답이 중단되었습니다)_',
        createdAt: Date.now() / 1000,
      });
    }
    abortRef.current?.abort();
  }, []);

  return { sendMessage, cancel, isStreaming: store.isStreaming };
}
