type IFrameMessage =
  | { type: 'theme'; payload: { mode: 'light' | 'dark' } }
  | { type: 'navigate'; payload: { path: string } }
  | { type: 'config'; payload: { projectId: string; apiBase?: string } };

type MessageHandler = (msg: IFrameMessage) => void;

const handlers = new Set<MessageHandler>();

export function onIFrameMessage(handler: MessageHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function sendToParent(type: string, payload: unknown): void {
  if (window.parent !== window) {
    window.parent.postMessage({ source: 'datamaster', type, payload }, '*');
  }
}

function handleMessage(event: MessageEvent) {
  if (!event.data || typeof event.data !== 'object') return;
  const msg = event.data as IFrameMessage;
  if (!msg.type) return;
  for (const handler of handlers) {
    handler(msg);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', handleMessage);
}
