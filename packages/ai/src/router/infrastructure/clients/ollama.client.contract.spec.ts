import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AiProviderError } from '../../domain/errors';
import { OllamaClient } from './ollama.client';

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

describe('OllamaClient contract', () => {
  it('sends a non-streamed /api/chat request and parses a text response', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      expect(req.url).toBe('/api/chat');
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: { role: 'assistant', content: 'hi there' },
          prompt_eval_count: 7,
          eval_count: 3,
        }),
      );
    });

    try {
      const client = new OllamaClient({ baseUrl: url });
      const result = await client.chatComplete({
        model: 'llama3.2:1b',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(capturedBody.stream).toBe(false);
      expect(capturedBody.messages).toEqual([{ role: 'user', content: 'hi' }]);
      expect(result).toEqual({
        content: 'hi there',
        toolCalls: [],
        promptTokens: 7,
        completionTokens: 3,
      });
    } finally {
      await close();
    }
  });

  it('sends tool schemas and parses a tool-call response (object arguments, not JSON-string)', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'Paris' } } }],
          },
          prompt_eval_count: 12,
          eval_count: 5,
        }),
      );
    });

    try {
      const client = new OllamaClient({ baseUrl: url });
      const result = await client.chatComplete({
        model: 'llama3.2:1b',
        messages: [{ role: 'user', content: 'weather?' }],
        tools: [
          { name: 'get_weather', description: 'get weather', parameters: { type: 'object' } },
        ],
      });

      expect(capturedBody.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'get weather',
            parameters: { type: 'object' },
          },
        },
      ]);
      expect(result.content).toBeNull();
      expect(result.toolCalls).toEqual([
        { id: 'get_weather-0', toolName: 'get_weather', arguments: { city: 'Paris' } },
      ]);
    } finally {
      await close();
    }
  });

  it("sends an image attachment as a raw base64 string in the message's images array", async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: { role: 'assistant', content: 'a receipt' },
          prompt_eval_count: 1,
          eval_count: 1,
        }),
      );
    });

    try {
      const client = new OllamaClient({ baseUrl: url });
      await client.chatComplete({
        model: 'llama3.2-vision',
        messages: [
          {
            role: 'user',
            content: 'What is this?',
            images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }],
          },
        ],
      });

      expect(capturedBody.messages).toEqual([
        { role: 'user', content: 'What is this?', images: ['AAAA'] },
      ]);
    } finally {
      await close();
    }
  });

  it('classifies 429/500/400 as RATE_LIMITED/TRANSIENT/FATAL', async () => {
    let status = 429;
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end('server error');
    });

    try {
      const client = new OllamaClient({ baseUrl: url });

      try {
        await client.chatComplete({
          model: 'llama3.2:1b',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('RATE_LIMITED');
      }

      status = 500;
      try {
        await client.chatComplete({
          model: 'llama3.2:1b',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('TRANSIENT');
      }

      status = 400;
      try {
        await client.chatComplete({
          model: 'llama3.2:1b',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('FATAL');
      }
    } finally {
      await close();
    }
  });

  it('sends the /api/embed request shape and parses the embeddings[0] response', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      expect(req.url).toBe('/api/embed');
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]], prompt_eval_count: 6 }));
    });

    try {
      const client = new OllamaClient({ baseUrl: url });
      const result = await client.embed({ model: 'nomic-embed-text', input: 'hello' });
      expect(capturedBody).toEqual({ model: 'nomic-embed-text', input: 'hello' });
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], promptTokens: 6 });
    } finally {
      await close();
    }
  });
});
