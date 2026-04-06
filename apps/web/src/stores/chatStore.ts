import { create } from 'zustand';
import type { ChatMessage, ChatSession, ToolCall } from '@datamaster/shared';

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  activeTools: ToolCall[];
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
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  activeTools: [],

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (id) => set({ currentSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamingText: (text) => set({ streamingText: text }),
  appendStreamingText: (delta) => set((s) => ({ streamingText: s.streamingText + delta })),

  addActiveTool: (tool) => set((s) => ({ activeTools: [...s.activeTools, tool] })),
  updateToolStatus: (name, status, result) =>
    set((s) => ({
      activeTools: s.activeTools.map((t) =>
        t.name === name ? { ...t, status, result: result ?? t.result } : t,
      ),
    })),
  clearActiveTools: () => set({ activeTools: [] }),
}));
