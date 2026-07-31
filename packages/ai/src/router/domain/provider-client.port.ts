/**
 * One turn in a chat-completion request — the wire-agnostic shape every provider client
 * normalizes to/from. `toolCallId`/`toolName` on a `'tool'`-role message identify which call
 * this is the *result* of; `toolCalls` on an `'assistant'`-role message records that the
 * assistant's turn *was* a tool call (needed so providers with a stricter tool-use wire format,
 * e.g. Anthropic, can reconstruct the full round-trip when replaying history).
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /**
   * Inline image attachments (vision input) — the OCR seam's use case. Deliberately a flat
   * sibling field on the wire-agnostic message rather than a full text/image content-parts
   * union: every provider this codebase talks to accepts "text + N images" per turn, and no
   * caller here needs interleaved ordering, so the simpler shape avoids a content-model
   * rewrite while each client still maps it to its own real multipart wire format.
   */
  images?: Array<{ mimeType: string; dataBase64: string }>;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCallRequest[];
}

/** A tool the model may call, described as a JSON-schema-shaped function — same shape every provider's function/tool-calling API expects, just serialized differently per provider. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ChatCompleteRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompleteResult {
  /** Null when the model chose to call a tool instead of answering directly. */
  content: string | null;
  toolCalls: ToolCallRequest[];
  promptTokens: number;
  completionTokens: number;
}

export interface EmbedRequest {
  model: string;
  input: string;
}

export interface EmbedResult {
  embedding: number[];
  promptTokens: number;
}

/**
 * The one shape every LLM provider client implements — see docs/DOMAIN_MODEL_PHASE6.md §2 for
 * why these are hand-written fetch-based clients rather than the official OpenAI/Anthropic/
 * Gemini SDKs (matches the `fetchImpl` injection precedent RuleActionExecutor's CALL_AI action
 * already established in packages/rules-engine).
 */
export interface LlmProviderClient {
  chatComplete(request: ChatCompleteRequest): Promise<ChatCompleteResult>;
  embed(request: EmbedRequest): Promise<EmbedResult>;
}
