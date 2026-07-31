import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AiProviderError } from '../../domain/errors';
import { AnthropicClient } from './anthropic.client';

function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

describe('AnthropicClient contract', () => {
  it('sends x-api-key/anthropic-version headers, hoists system messages, requires max_tokens', async () => {
    let capturedHeaders: http.IncomingHttpHeaders = {};
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedHeaders = req.headers;
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          content: [{ type: 'text', text: 'hi there' }],
          usage: { input_tokens: 12, output_tokens: 6 },
        }),
      );
    });

    try {
      const client = new AnthropicClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.chatComplete({
        model: 'claude-3-5-sonnet',
        messages: [
          { role: 'system', content: 'be nice' },
          { role: 'user', content: 'hi' },
        ],
      });

      expect(capturedHeaders['x-api-key']).toBe('test-key');
      expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
      expect(capturedBody.system).toBe('be nice');
      expect(capturedBody.max_tokens).toBe(1024);
      expect(capturedBody.messages).toEqual([{ role: 'user', content: 'hi' }]);
      expect(result).toEqual({
        content: 'hi there',
        toolCalls: [],
        promptTokens: 12,
        completionTokens: 6,
      });
    } finally {
      await close();
    }
  });

  it('reconstructs tool_use / tool_result content blocks from assistant toolCalls and tool-role messages', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          content: [
            { type: 'tool_use', id: 'call_1', name: 'get_weather', input: { city: 'Paris' } },
          ],
          usage: { input_tokens: 20, output_tokens: 8 },
        }),
      );
    });

    try {
      const client = new AnthropicClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.chatComplete({
        model: 'claude-3-5-sonnet',
        messages: [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', toolName: 'get_weather', arguments: { city: 'Paris' } }],
          },
          { role: 'tool', content: '{"temp":20}', toolCallId: 'call_1', toolName: 'get_weather' },
        ],
        tools: [
          { name: 'get_weather', description: 'get weather', parameters: { type: 'object' } },
        ],
      });

      expect(capturedBody.messages).toEqual([
        { role: 'user', content: 'weather?' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'get_weather', input: { city: 'Paris' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"temp":20}' }],
        },
      ]);
      expect(capturedBody.tools).toEqual([
        { name: 'get_weather', description: 'get weather', input_schema: { type: 'object' } },
      ]);
      expect(result.content).toBeNull();
      expect(result.toolCalls).toEqual([
        { id: 'call_1', toolName: 'get_weather', arguments: { city: 'Paris' } },
      ]);
    } finally {
      await close();
    }
  });

  it('classifies 429/500/400 as RATE_LIMITED/TRANSIENT/FATAL', async () => {
    let status = 429;
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad' }));
    });

    try {
      const client = new AnthropicClient({ apiKey: 'test-key', baseUrl: url });

      try {
        await client.chatComplete({
          model: 'claude-3-5-sonnet',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('RATE_LIMITED');
      }

      status = 500;
      try {
        await client.chatComplete({
          model: 'claude-3-5-sonnet',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('TRANSIENT');
      }

      status = 400;
      try {
        await client.chatComplete({
          model: 'claude-3-5-sonnet',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('FATAL');
      }
    } finally {
      await close();
    }
  });

  it('sends an image attachment as a base64 image content block ahead of the text block', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          content: [{ type: 'text', text: 'a receipt' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });

    try {
      const client = new AnthropicClient({ apiKey: 'test-key', baseUrl: url });
      await client.chatComplete({
        model: 'claude-3-5-sonnet',
        messages: [
          {
            role: 'user',
            content: 'What is this?',
            images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }],
          },
        ],
      });

      expect(capturedBody.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
            { type: 'text', text: 'What is this?' },
          ],
        },
      ]);
    } finally {
      await close();
    }
  });

  it('embed() always throws a FATAL AiProviderError — Anthropic has no embeddings API', async () => {
    const client = new AnthropicClient({ apiKey: 'test-key' });
    await expect(client.embed({ model: 'n/a', input: 'hello' })).rejects.toThrow(AiProviderError);
    try {
      await client.embed({ model: 'n/a', input: 'hello' });
    } catch (err) {
      expect((err as AiProviderError).kind).toBe('FATAL');
      expect((err as AiProviderError).provider).toBe('ANTHROPIC');
    }
  });
});
