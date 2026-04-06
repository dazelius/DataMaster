import { useCallback } from 'react';
import { useChatStore } from '../../../stores/chatStore';
import { startChatStream, cancelChatStream } from '../../../lib/chatStreamManager';

export function useChatStream() {
  const isStreaming = useChatStore((s) => s.isStreaming);

  const sendMessage = useCallback((message: string) => {
    startChatStream(message);
  }, []);

  const cancel = useCallback(() => {
    cancelChatStream();
  }, []);

  return { sendMessage, cancel, isStreaming };
}
