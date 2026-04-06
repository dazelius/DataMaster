import type { FastifyInstance } from 'fastify';
import { getToolDefinitions } from '../services/chat/toolExecutor.js';
import { buildSystemPrompt } from '../services/chat/systemPromptBuilder.js';

const startTime = Date.now();

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    version: '2.0.0',
    uptime: Date.now() - startTime,
  }));

  app.get('/debug/tools', async () => {
    const tools = getToolDefinitions();
    return {
      count: tools.length,
      tools: tools.map((t) => ({ name: t.name, description: t.description.substring(0, 80) })),
    };
  });

  app.get('/debug/prompt', async () => {
    const prompt = await buildSystemPrompt();
    return {
      length: prompt.length,
      hasWikiSchema: prompt.includes('Wiki Schema'),
      hasWikiTools: prompt.includes('wiki_write'),
      preview: prompt.substring(0, 500),
    };
  });
}
