import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useChatStream } from './hooks/useChatStream';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';

export default function ChatPage() {
  const { messages, streamingText, isStreaming, activeTools } = useChatStore();
  const { sendMessage } = useChatStream();

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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center border-b border-[var(--color-border)] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">AI Chat</h2>
        {isStreaming && (
          <div className="ml-3 flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
            Thinking...
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          activeTools={activeTools}
          onSuggest={handleSend}
        />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 md:p-4">
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
