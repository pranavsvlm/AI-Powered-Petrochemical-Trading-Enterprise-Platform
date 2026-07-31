import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AiProviderError } from '../../domain/errors';
import { GeminiClient } from './gemini.client';

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

describe('GeminiClient contract', () => {
  it('sends the API key as a query param, maps system to systemInstruction, assistant to role "model"', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedUrl = req.url;
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: 'hi there' }] } }],
          usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 },
        }),
      );
    });

    try {
      const client = new GeminiClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.chatComplete({
        model: 'gemini-1.5-flash',
        messages: [
          { role: 'system', content: 'be nice' },
          { role: 'user', content: 'hi' },
        ],
      });

      expect(capturedUrl).toContain('key=test-key');
      expect(capturedBody.systemInstruction).toEqual({ parts: [{ text: 'be nice' }] });
      expect(capturedBody.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
      expect(result).toEqual({
        content: 'hi there',
        toolCalls: [],
        promptTokens: 9,
        completionTokens: 4,
      });
    } finally {
      await close();
    }
  });

  it('maps assistant tool calls to functionCall parts and tool-role messages to functionResponse parts', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'get_weather', args: { city: 'Paris' } } }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 3 },
        }),
      );
    });

    try {
      const client = new GeminiClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.chatComplete({
        model: 'gemini-1.5-flash',
        messages: [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', toolName: 'get_weather', arguments: { city: 'Paris' } }],
          },
          { role: 'tool', content: '{"temp":20}', toolName: 'get_weather', toolCallId: 'call_1' },
        ],
        tools: [
          { name: 'get_weather', description: 'get weather', parameters: { type: 'object' } },
        ],
      });

      expect(capturedBody.contents).toEqual([
        { role: 'user', parts: [{ text: 'weather?' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'get_weather', args: { city: 'Paris' } } }],
        },
        {
          role: 'function',
          parts: [
            { functionResponse: { name: 'get_weather', response: { content: '{"temp":20}' } } },
          ],
        },
      ]);
      expect(capturedBody.tools).toEqual([
        {
          functionDeclarations: [
            { name: 'get_weather', description: 'get weather', parameters: { type: 'object' } },
          ],
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

  it('classifies 429/500/400 as RATE_LIMITED/TRANSIENT/FATAL', async () => {
    let status = 429;
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad' }));
    });

    try {
      const client = new GeminiClient({ apiKey: 'test-key', baseUrl: url });

      try {
        await client.chatComplete({
          model: 'gemini-1.5-flash',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('RATE_LIMITED');
      }

      status = 500;
      try {
        await client.chatComplete({
          model: 'gemini-1.5-flash',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('TRANSIENT');
      }

      status = 400;
      try {
        await client.chatComplete({
          model: 'gemini-1.5-flash',
          messages: [{ role: 'user', content: 'hi' }],
        });
      } catch (err) {
        expect((err as AiProviderError).kind).toBe('FATAL');
      }
    } finally {
      await close();
    }
  });

  it('sends an image attachment as an inlineData part alongside the text part', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: 'a receipt' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        }),
      );
    });

    try {
      const client = new GeminiClient({ apiKey: 'test-key', baseUrl: url });
      await client.chatComplete({
        model: 'gemini-1.5-flash',
        messages: [
          {
            role: 'user',
            content: 'What is this?',
            images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }],
          },
        ],
      });

      expect(capturedBody.contents).toEqual([
        {
          role: 'user',
          parts: [
            { text: 'What is this?' },
            { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
          ],
        },
      ]);
    } finally {
      await close();
    }
  });

  it('sends the embedContent request shape and parses the response', async () => {
    let capturedBody: any;
    const { url, close } = await startServer(async (req, res) => {
      capturedBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ embedding: { values: [0.1, 0.2, 0.3] } }));
    });

    try {
      const client = new GeminiClient({ apiKey: 'test-key', baseUrl: url });
      const result = await client.embed({ model: 'text-embedding-004', input: 'hello' });
      expect(capturedBody).toEqual({ content: { parts: [{ text: 'hello' }] } });
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    } finally {
      await close();
    }
  });
});
