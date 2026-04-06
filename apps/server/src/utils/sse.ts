import type { FastifyReply } from 'fastify';
import type { SSEEvent } from '@datamaster/shared';

export class SSEWriter {
  private closed = false;

  constructor(private reply: FastifyReply) {
    const origin = reply.request.headers.origin;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin && {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      }),
    });
    reply.raw.socket?.setNoDelay(true);
  }

  send(event: SSEEvent): void {
    if (this.closed) return;
    const raw = this.reply.raw;
    raw.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    if (typeof (raw as any).flush === 'function') (raw as any).flush();
  }

  heartbeat(): void {
    this.send({ event: 'heartbeat', data: {} });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reply.raw.end();
  }

  get isClosed(): boolean {
    return this.closed || this.reply.raw.destroyed;
  }
}

export function startHeartbeat(writer: SSEWriter, intervalMs = 15000): NodeJS.Timeout {
  return setInterval(() => {
    if (writer.isClosed) return;
    writer.heartbeat();
  }, intervalMs);
}
