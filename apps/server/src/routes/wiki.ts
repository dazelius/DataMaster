import type { FastifyInstance, FastifyRequest } from 'fastify';
import { wikiService } from '../services/wiki/wikiService.js';

export async function wikiRoutes(app: FastifyInstance) {
  app.get('/pages', async (req: FastifyRequest<{ Querystring: { category?: string } }>) => {
    const { category } = req.query;
    const pages = await wikiService.listPages(category);
    return { pages };
  });

  app.get('/pages/*', async (req, reply) => {
    const pagePath = (req.params as Record<string, string>)['*'];
    if (!pagePath) return reply.status(400).send({ error: 'Page path required' });

    const page = await wikiService.readPage(pagePath);
    if (!page) return reply.status(404).send({ error: 'Page not found' });
    return page;
  });

  app.put('/pages/*', async (req, reply) => {
    const pagePath = (req.params as Record<string, string>)['*'];
    if (!pagePath) return reply.status(400).send({ error: 'Page path required' });

    const body = req.body as { frontmatter?: Record<string, unknown>; content?: string } | null;
    if (!body?.content && !body?.frontmatter) {
      return reply.status(400).send({ error: 'content or frontmatter required' });
    }

    const frontmatter = {
      title: String(body.frontmatter?.title ?? pagePath.split('/').pop() ?? 'Untitled'),
      tags: Array.isArray(body.frontmatter?.tags) ? body.frontmatter.tags as string[] : undefined,
      sources: Array.isArray(body.frontmatter?.sources) ? body.frontmatter.sources as string[] : undefined,
      confidence: body.frontmatter?.confidence as any,
      aliases: Array.isArray(body.frontmatter?.aliases) ? body.frontmatter.aliases as string[] : undefined,
    };

    await wikiService.writePage(pagePath, frontmatter, body.content ?? '');
    return { success: true, path: pagePath };
  });

  app.delete('/pages/*', async (req, reply) => {
    const pagePath = (req.params as Record<string, string>)['*'];
    if (!pagePath) return reply.status(400).send({ error: 'Page path required' });

    const deleted = await wikiService.deletePage(pagePath);
    if (!deleted) return reply.status(404).send({ error: 'Page not found' });
    return { success: true };
  });

  app.get('/stats', async () => {
    return wikiService.getStats();
  });

  app.get('/search', async (req: FastifyRequest<{ Querystring: { q: string } }>) => {
    const { q } = req.query;
    if (!q) return { results: [] };
    const results = await wikiService.searchPages(q);
    return { results };
  });

  app.get('/graph', async () => {
    const graph = await wikiService.getGraph();
    return graph;
  });

  app.post('/lint', async () => {
    const result = await wikiService.lint();
    return result;
  });
}
