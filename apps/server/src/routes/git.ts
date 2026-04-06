import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { gitService } from '../services/git/gitService.js';
import { loadGameData, invalidateCache } from '../services/data/dataService.js';

async function reloadDataAfterSync(logger: { info: (msg: string) => void; warn: (msg: string) => void }) {
  const dataRepoDir = resolve(config.GIT_CLONE_BASE_DIR, 'data');
  try {
    invalidateCache();
    await loadGameData(dataRepoDir, config.REPO_SCHEMA_SUBPATH, config.REPO_DATA_SUBPATH);
    logger.info('Game data reloaded after sync');
  } catch (err) {
    logger.warn(`Data reload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function gitRoutes(app: FastifyInstance) {
  app.post('/sync', async () => {
    const repoIds = gitService.getRegisteredRepoIds();
    const results = await Promise.all(repoIds.map((id) => gitService.sync(id)));

    const hasDataSync = results.some((r) => r.repoId === 'data' && r.success);
    if (hasDataSync) {
      await reloadDataAfterSync(app.log);
    }

    return { results };
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
