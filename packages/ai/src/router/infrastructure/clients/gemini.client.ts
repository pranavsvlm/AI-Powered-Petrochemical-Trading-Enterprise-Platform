import { AiProviderError, classifyHttpStatus } from '../../domain/errors';
import type {
  ChatCompleteRequest,
  ChatCompleteResult,
  EmbedRequest,
  EmbedResult,
  LlmProviderClient,
  ToolCallRequest,
} from '../../domain/provider-client.port';

export interface GeminiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiGenerateContentResponse {
  candidates: Array<{ content: { parts: GeminiPart[]; role: string } }>;
  usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
}

interface GeminiEmbedContentResponse {
  embedding: { values: number[] };
}

/**
 * Fetch-based Gemini client — see docs/DOMAIN_MODEL_PHASE6.md §2. Gemini uses `'model'` (not
 * `'assistant'`) as the assistant role, a `functionCall`/`functionResponse` part shape for
 * tool calls instead of a separate message role, and takes the API key as a query parameter
 * rather than a header.
 */
export class GeminiClient implements LlmProviderClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiClientOptions) {
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chatComplete(request: ChatCompleteRequest): Promise<ChatCompleteResult> {
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const systemInstruction =
      systemMessages.length > 0
        ? { parts: [{ text: systemMessages.map((m) => m.content).join('\n\n') }] }
        : undefined;

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'function',
            parts: [
              { functionResponse: { name: m.toolName ?? '', response: { content: m.content } } },
            ],
          };
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'model',
            parts: m.toolCalls.map((tc) => ({
              functionCall: { name: tc.toolName, args: tc.arguments },
            })),
          };
        }
        if (m.images && m.images.length > 0) {
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [
              { text: m.content },
              ...m.images.map((img) => ({
                inlineData: { mimeType: img.mimeType, data: img.dataBase64 },
              })),
            ],
          };
        }
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      });

    const res = await this.fetchImpl(
      `${this.baseUrl}/models/${request.model}:generateContent?key=${this.options.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction,
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
          },
          ...(request.tools && request.tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: request.tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      parameters: t.parameters,
                    })),
                  },
                ],
              }
            : {}),
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        `Gemini chat completion failed (${res.status}): ${body}`,
        classifyHttpStatus(res.status),
        'GEMINI',
        res.status,
      );
    }

    const parsed = (await res.json()) as GeminiGenerateContentResponse;
    const parts = parsed.candidates[0]?.content.parts ?? [];
    const textPart = parts.find((p): p is { text: string } => 'text' in p);
    const toolCalls: ToolCallRequest[] = parts
      .filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          'functionCall' in p,
      )
      .map((p, i) => ({
        id: `${p.functionCall.name}-${i}`,
        toolName: p.functionCall.name,
        arguments: p.functionCall.args,
      }));

    return {
      content: toolCalls.length > 0 ? null : (textPart?.text ?? null),
      toolCalls,
      promptTokens: parsed.usageMetadata.promptTokenCount,
      completionTokens: parsed.usageMetadata.candidatesTokenCount,
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResult> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/models/${request.model}:embedContent?key=${this.options.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: request.input }] } }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        `Gemini embedding failed (${res.status}): ${body}`,
        classifyHttpStatus(res.status),
        'GEMINI',
        res.status,
      );
    }

    const parsed = (await res.json()) as GeminiEmbedContentResponse;
    // Gemini's embedContent response has no token-usage field — estimate via a rough
    // characters/4 heuristic purely for AiUsageRecord observability, never for cost-ceiling
    // math (Gemini embedding cost is negligible and this phase's ceiling enforcement is
    // exercised end-to-end against Ollama, not Gemini — see docs/DOMAIN_MODEL_PHASE6.md §3).
    return {
      embedding: parsed.embedding.values,
      promptTokens: Math.ceil(request.input.length / 4),
    };
  }
}
