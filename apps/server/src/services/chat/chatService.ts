import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';
import type { SSEWriter } from '../../utils/sse.js';
import { buildSystemPrompt } from './systemPromptBuilder.js';
import { executeTool, getToolDefinitions } from './toolExecutor.js';
import { getDb } from '../../db/client.js';
import { randomUUID } from 'crypto';

const MAX_ITERATIONS = 25;

function rebuildHistory(history: any[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const h of history) {
    if (h.role === 'user') {
      messages.push({ role: 'user', content: h.content });
    } else if (h.role === 'assistant') {
      let toolCalls: { name: string; input: Record<string, unknown>; result: string }[] = [];
      try {
        if (h.toolCalls) toolCalls = JSON.parse(h.toolCalls);
      } catch { /* ignore parse errors */ }

      if (toolCalls.length > 0) {
        const contentBlocks: Anthropic.ContentBlockParam[] = [];
        if (h.content) {
          contentBlocks.push({ type: 'text', text: h.content });
        }
        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
        for (const tc of toolCalls) {
          const toolUseId = `toolu_hist_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
          contentBlocks.push({
            type: 'tool_use',
            id: toolUseId,
            name: tc.name,
            input: tc.input ?? {},
          });
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result),
          });
        }
        messages.push({ role: 'assistant', content: contentBlocks });
        messages.push({ role: 'user', content: toolResultBlocks });
      } else {
        messages.push({ role: 'assistant', content: h.content || '(no response)' });
      }
    }
  }

  return messages;
}

export class ChatService {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      if (!config.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not configured');
      this.client = new Anthropic({ apiKey: config.CLAUDE_API_KEY });
    }
    return this.client;
  }

  async processMessage(
    userMessage: string,
    history: any[],
    writer: SSEWriter,
    sessionId: string,
  ): Promise<void> {
    const client = this.getClient();
    const systemPrompt = await buildSystemPrompt();
    const tools = getToolDefinitions();

    const messages = rebuildHistory(history);

    let fullContent = '';
    const allToolCalls: { name: string; input: Record<string, unknown>; result: string }[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (writer.isClosed) break;

      if (iteration > 0) {
        writer.send({ event: 'thinking', data: { iteration } });
      }

      const stream = await client.messages.stream({
        model: config.CLAUDE_MODEL,
        max_tokens: 16384,
        system: systemPrompt,
        messages,
        tools: tools as Anthropic.Tool[],
      });

      for await (const event of stream) {
        if (writer.isClosed) break;
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullContent += event.delta.text;
          writer.send({
            event: 'text_delta',
            data: { delta: event.delta.text, snapshot: fullContent },
          });
        }
      }

      const finalMessage = await stream.finalMessage();
      const toolUseBlocks = finalMessage.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        writer.send({
          event: 'tool_start',
          data: { toolName: toolUse.name, toolInput: toolUse.input as Record<string, unknown> },
        });

        try {
          const result = await executeTool(toolUse.name, toolUse.input);
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
          allToolCalls.push({ name: toolUse.name, input: toolUse.input as Record<string, unknown>, result });
          writer.send({ event: 'tool_done', data: { toolName: toolUse.name, result } });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Tool execution failed';
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: errMsg, is_error: true });
          writer.send({ event: 'tool_done', data: { toolName: toolUse.name, result: `Error: ${errMsg}` } });
        }
      }

      messages.push({ role: 'assistant', content: finalMessage.content });
      messages.push({ role: 'user', content: toolResults });

      if (finalMessage.stop_reason !== 'tool_use') break;
    }

    const db = getDb();
    db.insert('chatMessages').values({
      id: randomUUID(),
      sessionId,
      role: 'assistant',
      content: fullContent,
      toolCalls: allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : null,
      createdAt: Math.floor(Date.now() / 1000),
    }).run();

    writer.send({
      event: 'done',
      data: {
        content: fullContent,
        toolCalls: allToolCalls.map((t) => ({
          id: randomUUID(),
          name: t.name,
          input: t.input,
          result: t.result,
          status: 'done' as const,
        })),
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    });
  }
}

export const chatService = new ChatService();
