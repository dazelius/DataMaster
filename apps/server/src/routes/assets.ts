import { resolve, join, extname } from 'path';
import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const CACHE_HEADER = 'public, max-age=86400';

export async function assetRoutes(app: FastifyInstance) {
  const codeBase = resolve(config.GIT_CLONE_BASE_DIR, 'code');

  app.get<{ Params: { '*': string } }>('/code/*', async (request, reply) => {
    const relPath = (request.params as { '*': string })['*'];
    if (!relPath || relPath.includes('..')) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    const fullPath = join(codeBase, relPath);
    if (!existsSync(fullPath)) {
      return reply.code(404).send({ error: 'Not found' });
    }

    const ext = extname(fullPath).toLowerCase();
    const mime = MIME[ext];
    if (!mime) {
      return reply.code(415).send({ error: 'Unsupported file type' });
    }

    const buf = await readFile(fullPath);
    return reply
      .header('Content-Type', mime)
      .header('Cache-Control', CACHE_HEADER)
      .send(buf);
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>('/search/images', async (request) => {
    const { q = '', limit: limitStr = '20' } = request.query;
    const maxResults = Math.min(parseInt(limitStr, 10) || 20, 100);
    const keywords = q.toLowerCase().split(/[\s_\-/\\]+/).filter(Boolean);

    if (keywords.length === 0) {
      return { images: [], total: 0 };
    }

    const images: { path: string; name: string; url: string }[] = [];

    async function walk(dir: string, rel: string) {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }

      for (const entry of entries) {
        if (images.length >= maxResults) return;

        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          await walk(join(dir, entry.name), childRel);
        } else {
          const ext = extname(entry.name).toLowerCase();
          if (ext !== '.png') continue;

          const lower = childRel.toLowerCase();
          const match = keywords.every((kw) => lower.includes(kw));
          if (match) {
            images.push({
              path: childRel,
              name: entry.name,
              url: `/api/assets/code/${childRel}`,
            });
          }
        }
      }
    }

    await walk(codeBase, '');
    return { images, total: images.length, query: q };
  });
}
