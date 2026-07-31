import { AiProviderError, classifyHttpStatus } from '../../domain/errors';
import type {
  ChatCompleteRequest,
  ChatCompleteResult,
  EmbedRequest,
  EmbedResult,
  LlmProviderClient,
  ToolCallRequest,
} from '../../domain/provider-client.port';

export interface AnthropicClientOptions {
  apiKey: string;
  baseUrl?: string;
  anthropicVersion?: string;
  fetchImpl?: typeof fetch;
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Fetch-based Anthropic client — see docs/DOMAIN_MODEL_PHASE6.md §2. Anthropic's Messages API
 * differs from OpenAI's shape in three ways this client bridges: `system` is a top-level field
 * (not a message with role 'system'), `max_tokens` is required on every request, and both tool
 * calls and tool results are content *blocks* within a message rather than separate message
 * roles — `chatComplete` reconstructs that shape from the flatter `ChatMessage` abstraction.
 * Anthropic has no embeddings endpoint at all; `embed()` always throws FATAL.
 */
export class AnthropicClient implements LlmProviderClient {
  private readonly baseUrl: string;
  private readonly anthropicVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AnthropicClientOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com/v1';
    this.anthropicVersion = options.anthropicVersion ?? '2023-06-01';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chatComplete(request: ChatCompleteRequest): Promise<ChatCompleteResult> {
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const system = systemMessages.map((m) => m.content).join('\n\n') || undefined;

    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: m.toolCallId ?? '',
                content: m.content,
              },
            ],
          };
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant' as const,
            content: m.toolCalls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.toolName,
              input: tc.arguments,
            })),
          };
        }
        if (m.images && m.images.length > 0) {
          return {
            role: m.role as 'user' | 'assistant',
            content: [
              ...m.images.map((img) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: img.mimeType, data: img.dataBase64 },
              })),
              { type: 'text' as const, text: m.content },
            ],
          };
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      });

    const res = await this.fetchImpl(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.options.apiKey,
        'anthropic-version': this.anthropicVersion,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 1024,
        system,
        messages,
        temperature: request.temperature,
        ...(request.tools && request.tools.length > 0
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
            }
          : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        `Anthropic chat completion failed (${res.status}): ${body}`,
        classifyHttpStatus(res.status),
        'ANTHROPIC',
        res.status,
      );
    }

    const parsed = (await res.json()) as AnthropicMessagesResponse;
    const textBlock = parsed.content.find(
      (b): b is { type: 'text'; text: string } => b.type === 'text',
    );
    const toolCalls: ToolCallRequest[] = parsed.content
      .filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          b.type === 'tool_use',
      )
      .map((b) => ({ id: b.id, toolName: b.name, arguments: b.input }));

    return {
      content: toolCalls.length > 0 ? null : (textBlock?.text ?? null),
      toolCalls,
      promptTokens: parsed.usage.input_tokens,
      completionTokens: parsed.usage.output_tokens,
    };
  }

  async embed(_request: EmbedRequest): Promise<EmbedResult> {
    throw new AiProviderError(
      'Anthropic has no embeddings API — route embedding calls to a different configured provider.',
      'FATAL',
      'ANTHROPIC',
    );
  }
}
