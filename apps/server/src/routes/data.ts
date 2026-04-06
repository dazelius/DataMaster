import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getCachedData, loadGameData, invalidateCache } from '../services/data/dataService.js';

export async function dataRoutes(app: FastifyInstance) {
  app.post('/reload', async () => {
    const dataRepoDir = resolve(config.GIT_CLONE_BASE_DIR, 'data');
    invalidateCache();
    await loadGameData(dataRepoDir, config.REPO_SCHEMA_SUBPATH, config.REPO_DATA_SUBPATH);
    const data = getCachedData();
    return {
      success: true,
      dataFiles: data?.dataFiles.length ?? 0,
      schemaFiles: data?.schemaFiles.length ?? 0,
      timestamp: data?.timestamp,
    };
  });

  app.get('/schema', async (_request, reply) => {
    const data = getCachedData();
    if (!data) {
      reply.status(503).send({ error: 'Data not loaded yet. Trigger /api/git/sync first.' });
      return;
    }

    return {
      dbml: data.dbml,
      dataFiles: data.dataFiles.map((f) => f.fileName),
      schemaFiles: data.schemaFiles.map((f) => f.fileName),
      timestamp: data.timestamp,
    };
  });

  app.get('/tables', async (_request, reply) => {
    const data = getCachedData();
    if (!data) {
      reply.status(503).send({ error: 'Data not loaded yet.' });
      return;
    }

    const tables = data.dataFiles.flatMap((file) =>
      file.sheets.map((sheet) => ({
        name: sheet.name,
        fileName: file.fileName,
        headers: sheet.headers,
        rowCount: sheet.rows.length,
      })),
    );

    return { tables };
  });

  app.get<{ Querystring: { table: string } }>('/rows', async (request, reply) => {
    const data = getCachedData();
    if (!data) {
      reply.status(503).send({ error: 'Data not loaded yet.' });
      return;
    }

    const { table } = request.query;
    for (const file of data.dataFiles) {
      const sheet = file.sheets.find((s) => s.name === table);
      if (sheet) {
        return { name: sheet.name, headers: sheet.headers, rows: sheet.rows };
      }
    }

    reply.status(404).send({ error: `Table '${table}' not found` });
  });
}
