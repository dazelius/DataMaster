import type { FastifyInstance } from 'fastify';
import { confluenceService } from '../services/atlassian/confluenceService.js';

export async function confluenceRoutes(app: FastifyInstance) {
  app.get<{ Params: { pageId: string } }>('/page/:pageId', async (req, reply) => {
    try {
      const page = await confluenceService.getPage(req.params.pageId);
      return page;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(502).send({ error: msg });
    }
  });
}
