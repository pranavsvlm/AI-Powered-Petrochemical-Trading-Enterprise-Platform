import { AiProviderError, classifyHttpStatus } from '../../domain/errors';
import type {
  ChatCompleteRequest,
  ChatCompleteResult,
  EmbedRequest,
  EmbedResult,
  LlmProviderClient,
  ToolCallRequest,
} from '../../domain/provider-client.port';

export interface OpenAiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAiChatResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

interface OpenAiEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { prompt_tokens: number };
}

/** Fetch-based OpenAI client — see docs/DOMAIN_MODEL_PHASE6.md §2 for why this isn't the official SDK. */
export class OpenAiClient implements LlmProviderClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiClientOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chatComplete(request: ChatCompleteRequest): Promise<ChatCompleteResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map((m) => ({
          role: m.role === 'tool' ? 'tool' : m.role,
          content:
            m.images && m.images.length > 0
              ? [
                  { type: 'text', text: m.content },
                  ...m.images.map((img) => ({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
                  })),
                ]
              : m.content,
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        })),
        ...(request.tools && request.tools.length > 0
          ? {
              tools: request.tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
            }
          : {}),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        `OpenAI chat completion failed (${res.status}): ${body}`,
        classifyHttpStatus(res.status),
        'OPENAI',
        res.status,
      );
    }

    const parsed = (await res.json()) as OpenAiChatResponse;
    const choice = parsed.choices[0];
    const toolCalls: ToolCallRequest[] = (choice?.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      toolName: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: choice?.message.content ?? null,
      toolCalls,
      promptTokens: parsed.usage.prompt_tokens,
      completionTokens: parsed.usage.completion_tokens,
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: request.model, input: request.input }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        `OpenAI embedding failed (${res.status}): ${body}`,
        classifyHttpStatus(res.status),
        'OPENAI',
        res.status,
      );
    }

    const parsed = (await res.json()) as OpenAiEmbeddingResponse;
    return {
      embedding: parsed.data[0]!.embedding,
      promptTokens: parsed.usage.prompt_tokens,
    };
  }
}
