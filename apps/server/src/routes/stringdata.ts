import type { FastifyInstance } from 'fastify';
import * as stringDataService from '../services/google/stringDataService.js';
import * as googleSheets from '../services/google/googleSheetsService.js';
import { registerStringDataTables } from '../services/data/serverQueryEngine.js';

export async function stringDataRoutes(app: FastifyInstance) {
  app.get('/stats', async (_request, reply) => {
    if (!googleSheets.isConfigured()) {
      reply.status(503).send({ error: 'Google Sheets not configured' });
      return;
    }
    return stringDataService.getStringStats();
  });

  app.get<{ Querystring: { query: string; lang?: string; limit?: string } }>(
    '/search',
    async (request, reply) => {
      if (!googleSheets.isConfigured()) {
        reply.status(503).send({ error: 'Google Sheets not configured' });
        return;
      }
      const { query, lang, limit } = request.query;
      if (!query) {
        reply.status(400).send({ error: 'query parameter required' });
        return;
      }
      const results = stringDataService.searchStrings(query, lang, limit ? parseInt(limit, 10) : 50);
      return { query, matchCount: results.length, results };
    },
  );

  app.get<{ Params: { key: string } }>('/key/:key', async (request, reply) => {
    const entry = stringDataService.getStringByKey(request.params.key);
    if (!entry) {
      reply.status(404).send({ error: `Key '${request.params.key}' not found` });
      return;
    }
    return entry;
  });

  app.post('/reload', async (_request, reply) => {
    if (!googleSheets.isConfigured()) {
      reply.status(503).send({ error: 'Google Sheets not configured' });
      return;
    }
    try {
      const data = await stringDataService.loadStringData();
      registerStringDataTables();
      return {
        success: true,
        totalEntries: data.allEntries.length,
        sheets: data.sheets.length,
        languages: data.languages,
      };
    } catch (err) {
      reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
