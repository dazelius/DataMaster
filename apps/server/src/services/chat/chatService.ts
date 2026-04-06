import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';
import type { SSEWriter } from '../../utils/sse.js';
import { buildSystemPrompt } from './systemPromptBuilder.js';
import { executeTool, getToolDefinitions } from './toolExecutor.js';
import { getDb } from '../../db/client.js';
import { randomUUID } from 'crypto';

const MAX_ITERATIONS = 25;
const MARKER_START = '<<<';
const MARKER_END = '>>>';

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

    let capturedWikiContent = '';
    let syntheticWikiToolSent = false;

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

      let generatingToolBytes = 0;
      let currentToolName: string | null = null;

      // <<<>>> wiki content streaming state
      let textBuf = '';
      let capturing = false;
      let wikiCapture = '';
      let wikiSentLen = 0;

      const flushTextBuf = (upTo?: number) => {
        const end = upTo ?? textBuf.length;
        if (end <= 0) return;
        const chunk = textBuf.slice(0, end);
        fullContent += chunk;
        writer.send({ event: 'text_delta', data: { delta: chunk, snapshot: fullContent } });
        textBuf = textBuf.slice(end);
      };

      const sendWikiDelta = (safeEnd?: number) => {
        const end = safeEnd ?? wikiCapture.length;
        if (end <= wikiSentLen) return;
        const delta = wikiCapture.slice(wikiSentLen, end);
        writer.send({ event: 'tool_content_delta', data: { delta } });
        writer.send({ event: 'tool_generating_progress', data: { bytes: end, contentStarted: true } });
        wikiSentLen = end;
      };

      for await (const event of stream) {
        if (writer.isClosed) break;

        /* ── Text delta: <<<>>> marker detection ── */
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;

          if (!capturing) {
            textBuf += text;
            const mIdx = textBuf.indexOf(MARKER_START);
            if (mIdx >= 0) {
              flushTextBuf(mIdx);
              capturing = true;
              wikiCapture = textBuf.slice(MARKER_START.length);
              if (wikiCapture.startsWith('\n')) wikiCapture = wikiCapture.slice(1);
              textBuf = '';
              wikiSentLen = 0;

              if (!syntheticWikiToolSent) {
                syntheticWikiToolSent = true;
                writer.send({ event: 'tool_generating', data: { toolName: 'wiki_write' } });
              }
              console.log('[wiki-stream] <<< marker detected, capturing started');

              const eIdx = wikiCapture.indexOf(MARKER_END);
              if (eIdx >= 0) {
                wikiCapture = wikiCapture.slice(0, eIdx).trimEnd();
                sendWikiDelta();
                capturing = false;
                const after = wikiCapture.slice(eIdx + MARKER_END.length);
                textBuf = after.startsWith('\n') ? after.slice(1) : after;
                console.log(`[wiki-stream] >>> found immediately, captured ${wikiCapture.length} chars`);
              } else {
                sendWikiDelta(Math.max(0, wikiCapture.length - MARKER_END.length));
              }
            } else {
              flushTextBuf(Math.max(0, textBuf.length - MARKER_START.length));
            }
          } else {
            wikiCapture += text;
            const eIdx = wikiCapture.indexOf(MARKER_END);
            if (eIdx >= 0) {
              const finalContent = wikiCapture.slice(0, eIdx).trimEnd();
              const after = wikiCapture.slice(eIdx + MARKER_END.length);

              wikiCapture = finalContent;
              sendWikiDelta();
              capturing = false;
              capturedWikiContent = finalContent;

              textBuf = after.startsWith('\n') ? after.slice(1) : after;
              console.log(`[wiki-stream] >>> marker detected, captured ${capturedWikiContent.length} chars`);
            } else {
              sendWikiDelta(Math.max(0, wikiCapture.length - MARKER_END.length));
            }
          }
        }

        /* ── Tool use block start ── */
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          if (textBuf) flushTextBuf();
          currentToolName = event.content_block.name;
          generatingToolBytes = 0;
          if (!(currentToolName === 'wiki_write' && syntheticWikiToolSent)) {
            writer.send({ event: 'tool_generating', data: { toolName: currentToolName } });
          }
        }

        /* ── Tool input JSON delta ── */
        if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          generatingToolBytes += event.delta.partial_json.length;

          if (currentToolName === 'wiki_write' && syntheticWikiToolSent) {
            writer.send({ event: 'tool_generating_progress', data: { bytes: generatingToolBytes, contentStarted: true } });
          } else {
            writer.send({ event: 'tool_generating_progress', data: { bytes: generatingToolBytes } });
          }
        }
      }

      // Flush remaining text buffer after stream ends
      if (textBuf) flushTextBuf();
      if (capturing) {
        capturedWikiContent = wikiCapture.trimEnd();
        const delta = capturedWikiContent.slice(wikiSentLen);
        if (delta) writer.send({ event: 'tool_content_delta', data: { delta } });
        capturing = false;
        console.log(`[wiki-stream] stream ended while capturing, saved ${capturedWikiContent.length} chars`);
      }

      const finalMessage = await stream.finalMessage();
      const toolUseBlocks = finalMessage.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        // Inject captured wiki content
        if (toolUse.name === 'wiki_write' && capturedWikiContent) {
          const inp = toolUse.input as Record<string, unknown>;
          if (!inp.content || (typeof inp.content === 'string' && inp.content.length < 10)) {
            inp.content = capturedWikiContent;
            console.log(`[wiki-stream] injected ${capturedWikiContent.length} chars into wiki_write`);
          }
        }

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

      // Reset wiki capture state for next iteration
      capturedWikiContent = '';
      syntheticWikiToolSent = false;

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
