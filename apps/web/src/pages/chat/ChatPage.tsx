import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useChatStream } from './hooks/useChatStream';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';

export default function ChatPage() {
  const { messages, streamingText, isStreaming, activeTools, toolHistory, iteration, streamingSegments } = useChatStore();
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
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 md:px-4 py-1.5 md:py-2.5 min-h-[44px]">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] hidden md:block">AI Chat</h2>
          {isStreaming && (
            <div className="flex items-center gap-1.5 md:gap-2 rounded-full bg-[var(--color-accent)]/10 px-2 md:px-2.5 py-1">
              <div className="relative flex h-2 w-2 flex-shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              </div>
              <span className="text-[11px] font-medium text-[var(--color-accent)] truncate">
                {statusText}...
              </span>
              {iteration > 0 && (
                <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums flex-shrink-0">
                  ({iteration + 1})
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isStreaming && (
            <button
              onClick={cancel}
              className="flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              </svg>
              <span className="hidden md:inline">중지</span>
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (isStreaming) cancel();
                useChatStore.getState().clearChat();
              }}
              className="flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] active:bg-[var(--color-surface-3)] transition-colors"
              title="대화 초기화"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              <span className="hidden md:inline">초기화</span>
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
          streamingSegments={streamingSegments}
          onSuggest={handleSend}
        />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 md:p-4 safe-bottom">
        <ChatInput onSend={handleSend} disabled={isStreaming} onCancel={isStreaming ? cancel : undefined} />
      </div>
    </div>
  );
}
