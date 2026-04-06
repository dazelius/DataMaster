import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, ChatSession, ToolCall } from '@datamaster/shared';

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  activeTools: ToolCall[];
  /** Completed tools from previous iterations (preserved across thinking boundaries) */
  toolHistory: ToolCall[];
  /** Current agentic loop iteration (0-based) */
  iteration: number;
  /** Timestamp when streaming started */
  streamingStartedAt: number | null;

  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (delta: string) => void;
  addActiveTool: (tool: ToolCall) => void;
  updateToolStatus: (name: string, status: ToolCall['status'], result?: string) => void;
  clearActiveTools: () => void;
  /** Move active tools → history, bump iteration */
  advanceIteration: () => void;
  clearChat: () => void;
  resetStreamState: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      sessions: [],
      currentSessionId: null,
      messages: [],
      isStreaming: false,
      streamingText: '',
      activeTools: [],
      toolHistory: [],
      iteration: 0,
      streamingStartedAt: null,

      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (id) => set({ currentSessionId: id }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
      setStreaming: (streaming) =>
        set({ isStreaming: streaming, streamingStartedAt: streaming ? Date.now() : null }),
      setStreamingText: (text) => set({ streamingText: text }),
      appendStreamingText: (delta) => set((s) => ({ streamingText: s.streamingText + delta })),

      addActiveTool: (tool) => set((s) => ({ activeTools: [...s.activeTools, tool] })),
      updateToolStatus: (name, status, result) =>
        set((s) => ({
          activeTools: s.activeTools.map((t) =>
            t.name === name && t.status === 'running' ? { ...t, status, result: result ?? t.result } : t,
          ),
        })),
      clearActiveTools: () => set({ activeTools: [] }),

      advanceIteration: () =>
        set((s) => ({
          iteration: s.iteration + 1,
          toolHistory: [...s.toolHistory, ...s.activeTools],
          activeTools: [],
        })),

      resetStreamState: () =>
        set({ isStreaming: false, streamingText: '', activeTools: [], toolHistory: [], iteration: 0, streamingStartedAt: null }),

      clearChat: () =>
        set({ messages: [], currentSessionId: null, streamingText: '', activeTools: [], toolHistory: [], iteration: 0, streamingStartedAt: null }),
    }),
    {
      name: 'datamaster-chat',
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        messages: state.messages,
      }),
    },
  ),
);
