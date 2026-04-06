import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useChatStream } from './hooks/useChatStream';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';

export default function ChatPage() {
  const { messages, streamingText, isStreaming, activeTools, toolHistory, iteration } = useChatStore();
  const { sendMessage, cancel } = useChatStream();

  const handleSend = useCallback(
    (message: string) => {
      useChatStore.getState().addMessage({
        id: `user-${Date.now()}`,
        sessionId: useChatStore.getState().currentSessionId ?? '',
        role: 'user',
        content: message,
        createdAt: Date.now() / 1000,
      });
      sendMessage(message);
    },
    [sendMessage],
  );

  const runningToolName = activeTools.find((t) => t.status === 'running')?.name;
  const statusText = runningToolName
    ? '도구 실행 중'
    : streamingText
      ? '응답 생성 중'
      : '생각하는 중';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">AI Chat</h2>
          {isStreaming && (
            <div className="flex items-center gap-2 rounded-full bg-[var(--color-accent)]/10 px-2.5 py-1">
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              </div>
              <span className="text-[11px] font-medium text-[var(--color-accent)]">
                {statusText}...
              </span>
              {iteration > 0 && (
                <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                  (반복 {iteration + 1})
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isStreaming && (
            <button
              onClick={cancel}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              </svg>
              중지
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (isStreaming) cancel();
                useChatStore.getState().clearChat();
              }}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
              title="대화 초기화"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              초기화
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0">
        <MessageList
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          activeTools={activeTools}
          toolHistory={toolHistory}
          iteration={iteration}
          onSuggest={handleSend}
        />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 md:p-4">
        <ChatInput onSend={handleSend} disabled={isStreaming} onCancel={isStreaming ? cancel : undefined} />
      </div>
    </div>
  );
}
