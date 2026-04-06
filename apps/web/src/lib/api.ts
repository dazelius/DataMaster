const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = { ...init?.headers as Record<string, string> };
  if (init?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? 'Request failed', body.code);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function createSSEStream(path: string, body: unknown): EventSource | ReadableStream {
  const url = `${API_BASE}${path}`;

  const ctrl = new AbortController();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });

        if (!res.body) {
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(decoder.decode(value, { stream: true }));
        }
        controller.close();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          controller.error(err);
        }
      }
    },
    cancel() {
      ctrl.abort();
    },
  });

  return readable;
}

export function parseSSELines(chunk: string): { event: string; data: string }[] {
  const events: { event: string; data: string }[] = [];
  let currentEvent = '';
  let currentData = '';

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7);
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6);
    } else if (line === '' && currentEvent) {
      events.push({ event: currentEvent, data: currentData });
      currentEvent = '';
      currentData = '';
    }
  }

  return events;
}
