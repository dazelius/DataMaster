import type { FastifyInstance, FastifyRequest } from 'fastify';
import { wikiService } from '../services/wiki/wikiService.js';
import { getCachedData } from '../services/data/dataService.js';

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

  app.get('/history/*', async (req, reply) => {
    const raw = (req.params as Record<string, string>)['*'];
    if (!raw) return reply.status(400).send({ error: 'Page path required' });

    const parts = raw.split('/');
    const lastPart = parts[parts.length - 1];
    const isHash = /^[0-9a-f]{7,40}$/.test(lastPart);

    if (isHash) {
      const pagePath = parts.slice(0, -1).join('/');
      const content = await wikiService.getPageVersion(pagePath, lastPart);
      if (content === null) return reply.status(404).send({ error: 'Version not found' });
      return { hash: lastPart, content };
    }

    const pagePath = raw;
    const history = await wikiService.getPageHistory(pagePath);
    return { path: pagePath, history };
  });

  app.get<{ Querystring: { from: string; to: string } }>('/diff/*', async (req, reply) => {
    const pagePath = (req.params as Record<string, string>)['*'];
    if (!pagePath) return reply.status(400).send({ error: 'Page path required' });
    const { from, to } = req.query;
    if (!from || !to) return reply.status(400).send({ error: 'from and to hash required' });

    const diff = await wikiService.getPageDiff(pagePath, from, to);
    return { path: pagePath, from, to, diff };
  });

  app.post('/revert/*', async (req, reply) => {
    const pagePath = (req.params as Record<string, string>)['*'];
    if (!pagePath) return reply.status(400).send({ error: 'Page path required' });
    const { commitHash } = req.body as { commitHash: string };
    if (!commitHash) return reply.status(400).send({ error: 'commitHash required' });
    const result = await wikiService.revertPage(pagePath, commitHash);
    if (!result.success) return reply.status(404).send(result);
    return result;
  });

  app.get('/graph', async () => {
    const graph = await wikiService.getGraph();
    return graph;
  });

  app.post('/lint', async () => {
    const result = await wikiService.lint();
    return result;
  });

  app.get('/related/*', async (req, reply) => {
    const pagePath = (req.params as Record<string, string>)['*'];
    if (!pagePath) return reply.status(400).send({ error: 'Page path required' });
    const related = await wikiService.getRelatedPages(pagePath);
    return { related };
  });

  app.get('/impact/*', async (req, reply) => {
    const pagePath = (req.params as Record<string, string>)['*'];
    if (!pagePath) return reply.status(400).send({ error: 'Page path required' });
    const impact = await wikiService.getImpactAnalysis(pagePath);
    return impact;
  });

  app.get('/gaps', async () => {
    const data = getCachedData();
    const tableNames = data
      ? data.dataFiles.flatMap((f) => f.sheets.map((s) => s.name))
      : [];
    const gaps = await wikiService.discoverGaps(tableNames);
    return gaps;
  });
}
