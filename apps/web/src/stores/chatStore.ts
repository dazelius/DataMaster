import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, ChatSession, ToolCall } from '@datamaster/shared';

export type StreamSegment =
  | { type: 'text'; content: string }
  | { type: 'tools'; tools: ToolCall[] };

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;

  /** Legacy — full accumulated text across all iterations */
  streamingText: string;
  /** Segments rendered in chronological order: text → tools → text → tools ... */
  streamingSegments: StreamSegment[];

  activeTools: ToolCall[];
  toolHistory: ToolCall[];
  iteration: number;
  streamingStartedAt: number | null;

  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamingText: (delta: string) => void;
  addActiveTool: (tool: ToolCall) => void;
  updateToolStatus: (name: string, status: ToolCall['status'], result?: string) => void;
  updateToolGeneratingProgress: (bytes: number, partial?: { path?: string; title?: string }, contentStarted?: boolean) => void;
  appendToolContent: (delta: string) => void;
  promoteGeneratingTool: (name: string, input: Record<string, unknown>) => void;
  clearActiveTools: () => void;
  advanceIteration: () => void;
  clearChat: () => void;
  resetStreamState: () => void;
  initStreamSegments: () => void;
}

function lastSegment(segs: StreamSegment[]): StreamSegment | undefined {
  return segs[segs.length - 1];
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      sessions: [],
      currentSessionId: null,
      messages: [],
      isStreaming: false,
      streamingText: '',
      streamingSegments: [],
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

      initStreamSegments: () =>
        set({ streamingText: '', streamingSegments: [{ type: 'text', content: '' }], activeTools: [], toolHistory: [], iteration: 0 }),

      appendStreamingText: (delta) =>
        set((s) => {
          const segs = [...s.streamingSegments];
          const last = lastSegment(segs);
          if (last?.type === 'text') {
            segs[segs.length - 1] = { type: 'text', content: last.content + delta };
          } else {
            segs.push({ type: 'text', content: delta });
          }
          return { streamingText: s.streamingText + delta, streamingSegments: segs };
        }),

      addActiveTool: (tool) =>
        set((s) => {
          const segs = [...s.streamingSegments];
          const last = lastSegment(segs);
          if (last?.type === 'tools') {
            segs[segs.length - 1] = { type: 'tools', tools: [...last.tools, tool] };
          } else {
            segs.push({ type: 'tools', tools: [tool] });
          }
          return { activeTools: [...s.activeTools, tool], streamingSegments: segs };
        }),

      updateToolStatus: (name, status, result) =>
        set((s) => {
          const updateTools = (tools: ToolCall[]) =>
            tools.map((t) =>
              t.name === name && (t.status === 'running' || t.status === 'generating')
                ? { ...t, status, result: result ?? t.result }
                : t,
            );
          const segs = s.streamingSegments.map((seg) =>
            seg.type === 'tools' ? { ...seg, tools: updateTools(seg.tools) } : seg,
          );
          return {
            activeTools: updateTools(s.activeTools),
            streamingSegments: segs,
          };
        }),

      updateToolGeneratingProgress: (bytes, partial?, contentStarted?) =>
        set((s) => {
          const update = (tools: ToolCall[]) =>
            tools.map((t) => {
              if (t.status !== 'generating') return t;
              const patch: Partial<ToolCall> = { generatingBytes: bytes };
              if (partial) patch.generatingPartial = partial;
              if (contentStarted) patch.contentStarted = true;
              return { ...t, ...patch };
            });
          const segs = s.streamingSegments.map((seg) =>
            seg.type === 'tools' ? { ...seg, tools: update(seg.tools) } : seg,
          );
          return { activeTools: update(s.activeTools), streamingSegments: segs };
        }),

      appendToolContent: (delta) =>
        set((s) => {
          const update = (tools: ToolCall[]) =>
            tools.map((t) =>
              t.status === 'generating'
                ? { ...t, generatingContent: (t.generatingContent ?? '') + delta }
                : t,
            );
          const segs = s.streamingSegments.map((seg) =>
            seg.type === 'tools' ? { ...seg, tools: update(seg.tools) } : seg,
          );
          return { activeTools: update(s.activeTools), streamingSegments: segs };
        }),

      promoteGeneratingTool: (name, input) =>
        set((s) => {
          const update = (tools: ToolCall[]) =>
            tools.map((t) =>
              t.name === name && t.status === 'generating'
                ? { ...t, status: 'running' as const, input, generatingBytes: undefined }
                : t,
            );
          const segs = s.streamingSegments.map((seg) =>
            seg.type === 'tools' ? { ...seg, tools: update(seg.tools) } : seg,
          );
          return { activeTools: update(s.activeTools), streamingSegments: segs };
        }),

      clearActiveTools: () => set({ activeTools: [] }),

      advanceIteration: () =>
        set((s) => ({
          iteration: s.iteration + 1,
          toolHistory: [...s.toolHistory, ...s.activeTools],
          activeTools: [],
        })),

      resetStreamState: () =>
        set({
          isStreaming: false,
          streamingText: '',
          streamingSegments: [],
          activeTools: [],
          toolHistory: [],
          iteration: 0,
          streamingStartedAt: null,
        }),

      clearChat: () =>
        set({
          messages: [],
          currentSessionId: null,
          streamingText: '',
          streamingSegments: [],
          activeTools: [],
          toolHistory: [],
          iteration: 0,
          streamingStartedAt: null,
        }),
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
