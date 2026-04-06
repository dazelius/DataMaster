import type { FastifyInstance } from 'fastify';
import { SSEWriter, startHeartbeat } from '../utils/sse.js';
import { getDb } from '../db/client.js';
import { randomUUID } from 'crypto';
import { chatService } from '../services/chat/chatService.js';

export async function chatRoutes(app: FastifyInstance) {
  app.post<{ Body: { message: string; sessionId?: string } }>(
    '/chat',
    async (request, reply) => {
      const { message, sessionId: existingSessionId } = request.body;
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      const sessionId = existingSessionId ?? randomUUID();

      if (!existingSessionId) {
        db.insert('chatSessions').values({
          id: sessionId,
          title: message.substring(0, 100),
          createdAt: now,
          updatedAt: now,
        }).run();
      }

      db.insert('chatMessages').values({
        id: randomUUID(),
        sessionId,
        role: 'user',
        content: message,
        createdAt: now,
      }).run();

      const writer = new SSEWriter(reply);
      const heartbeatTimer = startHeartbeat(writer);

      writer.send({ event: 'session', data: { sessionId } });

      try {
        const history = db.select().from('chatMessages')
          .where((r: any) => r.sessionId === sessionId)
          .orderBy('createdAt')
          .all();

        await chatService.processMessage(message, history, writer, sessionId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        writer.send({ event: 'error', data: { message: msg, recoverable: false } });
      } finally {
        clearInterval(heartbeatTimer);
        writer.close();
      }
    },
  );

  app.get('/chat/sessions', async () => {
    const db = getDb();
    const sessions = db.select().from('chatSessions').orderBy('updatedAt', 'desc').all();
    return { sessions };
  });

  app.get<{ Params: { id: string } }>('/chat/sessions/:id/messages', async (request) => {
    const db = getDb();
    const messages = db.select().from('chatMessages')
      .where((r: any) => r.sessionId === request.params.id)
      .orderBy('createdAt')
      .all();
    return { messages };
  });

  app.delete<{ Params: { id: string } }>('/chat/sessions/:id', async (request, reply) => {
    const db = getDb();
    const sid = request.params.id;
    db.delete('chatMessages').where((r: any) => r.sessionId === sid).run();
    db.delete('chatSessions').where((r: any) => r.id === sid).run();
    reply.status(204).send();
  });
}
