import { AiProviderError, classifyHttpStatus } from '../../domain/errors';
import type {
  ChatCompleteRequest,
  ChatCompleteResult,
  EmbedRequest,
  EmbedResult,
  LlmProviderClient,
  ToolCallRequest,
} from '../../domain/provider-client.port';

export interface OllamaClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  embeddings: number[][];
  prompt_eval_count?: number;
}

/**
 * Fetch-based Ollama client — targets a local Ollama daemon (default
 * http://localhost:11434), no API key needed. This is the one provider actually exercised
 * live in e2e tests (see docs/DOMAIN_MODEL_PHASE6.md §2/§3) — OpenAI/Anthropic/Gemini get
 * contract tests only. Ollama's own chat wire format is close to OpenAI's (tool_calls with
 * object — not JSON-string — arguments; no tool_call_id needed on tool-result messages).
 */
export class OllamaClient implements LlmProviderClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chatComplete(request: ChatCompleteRequest): Promise<ChatCompleteResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        stream: false,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.images && m.images.length > 0
            ? { images: m.images.map((img) => img.dataBase64) }
            : {}),
          ...(m.toolCalls && m.toolCalls.length > 0
            ? {
                tool_calls: m.toolCalls.map((tc) => ({
                  function: { name: tc.toolName, arguments: tc.arguments },
                })),
              }
            : {}),
        })),
        ...(request.tools && request.tools.length > 0
          ? {
              tools: request.tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
            }
          : {}),
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        `Ollama chat completion failed (${res.status}): ${body}`,
        classifyHttpStatus(res.status),
        'OLLAMA',
        res.status,
      );
    }

    const parsed = (await res.json()) as OllamaChatResponse;
    const toolCalls: ToolCallRequest[] = (parsed.message.tool_calls ?? []).map((tc, i) => ({
      id: `${tc.function.name}-${i}`,
      toolName: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content: toolCalls.length > 0 ? null : parsed.message.content || null,
      toolCalls,
      promptTokens: parsed.prompt_eval_count ?? 0,
      completionTokens: parsed.eval_count ?? 0,
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: request.model, input: request.input }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        `Ollama embedding failed (${res.status}): ${body}`,
        classifyHttpStatus(res.status),
        'OLLAMA',
        res.status,
      );
    }

    const parsed = (await res.json()) as OllamaEmbedResponse;
    return {
      embedding: parsed.embeddings[0]!,
      promptTokens: parsed.prompt_eval_count ?? 0,
    };
  }
}
