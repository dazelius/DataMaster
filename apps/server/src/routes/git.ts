import { resolve } from 'path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { gitService } from '../services/git/gitService.js';
import { loadGameData, invalidateCache } from '../services/data/dataService.js';
import { initServerQueryEngine } from '../services/data/serverQueryEngine.js';

function sseWrite(reply: FastifyReply, event: string, data: Record<string, unknown>) {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function reloadDataAfterSync(logger: { info: (msg: string) => void; warn: (msg: string) => void }) {
  const dataRepoDir = resolve(config.GIT_CLONE_BASE_DIR, 'data');
  try {
    invalidateCache();
    await loadGameData(dataRepoDir, config.REPO_SCHEMA_SUBPATH, config.REPO_DATA_SUBPATH);
    initServerQueryEngine();
    logger.info('Game data reloaded after sync');
  } catch (err) {
    logger.warn(`Data reload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function gitRoutes(app: FastifyInstance) {
  app.post('/sync', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const repoIds = gitService.getRegisteredRepoIds();

    if (repoIds.length === 0) {
      sseWrite(reply, 'complete', { results: [], message: 'No repos configured' });
      reply.raw.end();
      return;
    }

    sseWrite(reply, 'start', { repos: repoIds.map((id) => ({ id, label: id })) });

    const allResults = [];

    for (const id of repoIds) {
      if (reply.raw.destroyed) break;
      sseWrite(reply, 'repo_start', { repoId: id });

      const result = await gitService.sync(id);
      allResults.push(result);

      sseWrite(reply, 'repo_done', {
        repoId: result.repoId,
        success: result.success,
        message: result.message,
        commitsBehind: result.commitsBehind ?? 0,
      });

      if (id === 'data' && result.success) {
        sseWrite(reply, 'phase', { repoId: id, phase: 'loading_data' });
        await reloadDataAfterSync(app.log);
        sseWrite(reply, 'phase', { repoId: id, phase: 'data_loaded' });
      }
    }

    sseWrite(reply, 'complete', {
      results: allResults,
      message: `Synced ${allResults.filter((r) => r.success).length}/${allResults.length} repos`,
    });

    reply.raw.end();
  });

  app.get('/status', async () => {
    const repoIds = gitService.getRegisteredRepoIds();
    const repos = await Promise.all(repoIds.map((id) => gitService.getStatus(id)));
    return { repos };
  });

  app.get<{ Querystring: { repo?: string; limit?: string; skip?: string } }>(
    '/log',
    async (request) => {
      const { repo = 'data', limit = '50', skip = '0' } = request.query;
      return gitService.getLog(repo, parseInt(limit, 10), parseInt(skip, 10));
    },
  );

  app.get<{ Querystring: { repo?: string; from: string; to: string } }>(
    '/diff',
    async (request) => {
      const { repo = 'data', from, to } = request.query;
      const diff = await gitService.getDiff(repo, from, to);
      return { diff };
    },
  );

  app.get<{ Querystring: { repo?: string; path: string; commit?: string } }>(
    '/file',
    async (request) => {
      const { repo = 'data', path, commit } = request.query;
      const content = await gitService.getFileContent(repo, path, commit);
      return { content };
    },
  );

  app.get<{ Querystring: { repo?: string; commit?: string } }>(
    '/files',
    async (request) => {
      const { repo = 'data', commit } = request.query;
      const files = await gitService.getFileList(repo, commit);
      return { files };
    },
  );
}
