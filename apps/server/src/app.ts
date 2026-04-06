import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { errorHandler } from './plugins/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { gitRoutes } from './routes/git.js';
import { dataRoutes } from './routes/data.js';
import { chatRoutes } from './routes/chat.js';
import { wikiRoutes } from './routes/wiki.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Session-Id'],
    credentials: true,
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Frame-Options', 'ALLOWALL');
    reply.header('Content-Security-Policy', "frame-ancestors *");
    return payload;
  });

  app.register(errorHandler);
  app.register(healthRoutes, { prefix: '/api' });
  app.register(gitRoutes, { prefix: '/api/git' });
  app.register(dataRoutes, { prefix: '/api/data' });
  app.register(chatRoutes, { prefix: '/api' });
  app.register(wikiRoutes, { prefix: '/api/wiki' });

  return app;
}
