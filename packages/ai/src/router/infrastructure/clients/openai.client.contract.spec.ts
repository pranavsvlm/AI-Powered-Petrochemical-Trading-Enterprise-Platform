import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AiProviderError } from '../../domain/errors';
import { OpenAiClient } from './openai.client';

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

describe('OpenAiClient contract', () => {
  it('sends bearer auth + correct chat-completion body shape, parses a text response', async () => {
    let capturedAuth: string | undefined;
    let capturedBody: unknown;
    const { url, close } = await startServer(async (req, res) => {
      capturedAuth = req.headers.authorization;
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'hello there', tool_calls: undefined } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      );
    });

    try {
      const client = new OpenAiClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.chatComplete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(capturedAuth).toBe('Bearer test-key');
      expect(capturedBody).toMatchObject({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(result).toEqual({
        content: 'hello there',
        toolCalls: [],
        promptTokens: 10,
        completionTokens: 5,
      });
    } finally {
      await close();
    }
  });

  it('parses a tool-call response, decoding the JSON-string arguments', async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        }),
      );
    });

    try {
      const client = new OpenAiClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.chatComplete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'weather?' }],
        tools: [{ name: 'get_weather', description: 'get weather', parameters: {} }],
      });

      expect(result.content).toBeNull();
      expect(result.toolCalls).toEqual([
        { id: 'call_1', toolName: 'get_weather', arguments: { city: 'Paris' } },
      ]);
    } finally {
      await close();
    }
  });

  it('classifies a 429 as RATE_LIMITED', async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'rate limited' }));
    });

    try {
      const client = new OpenAiClient({ apiKey: 'test-key', baseUrl: url });
      await expect(
        client.chatComplete({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toThrow(AiProviderError);
      try {
        await client.chatComplete({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('RATE_LIMITED');
      }
    } finally {
      await close();
    }
  });

  it('classifies a 500 as TRANSIENT and a 400 as FATAL', async () => {
    let status = 500;
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad' }));
    });

    try {
      const client = new OpenAiClient({ apiKey: 'test-key', baseUrl: url });
      try {
        await client.chatComplete({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('TRANSIENT');
      }

      status = 400;
      try {
        await client.chatComplete({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('FATAL');
      }
    } finally {
      await close();
    }
  });

  it('sends the correct embedding request shape and parses the response', async () => {
    let capturedBody: unknown;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { prompt_tokens: 4 } }),
      );
    });

    try {
      const client = new OpenAiClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.embed({ model: 'text-embedding-3-small', input: 'hello' });
      expect(capturedBody).toEqual({ model: 'text-embedding-3-small', input: 'hello' });
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], promptTokens: 4 });
    } finally {
      await close();
    }
  });

  it('sends an image attachment as an image_url content part alongside the text', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'a receipt' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    });

    try {
      const client = new OpenAiClient({ apiKey: 'test-key', baseUrl: url });
      await client.chatComplete({
        model: 'gpt-4o-mini',
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
            { type: 'text', text: 'What is this?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ]);
    } finally {
      await close();
    }
  });
});
