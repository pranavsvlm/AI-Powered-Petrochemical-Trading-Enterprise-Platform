import type {
  ChatCompleteResult,
  ChatMessage,
  ToolCallRequest,
} from '../../router/domain/provider-client.port';

export interface ModelFinalAnswer {
  kind: 'FINAL_ANSWER';
  text: string;
}

export interface ModelToolCall {
  kind: 'TOOL_CALL';
  toolCall: ToolCallRequest;
  /**
   * Any further tool calls the model requested in the same turn beyond the first. This phase's
   * loop processes exactly one tool call per iteration (doc 26's parallel/multi-tool-call
   * agents are explicitly deferred — see docs/DOMAIN_MODEL_PHASE6.md §14) — these are carried
   * through only so the orchestrator can log/observe them, never executed.
   */
  additionalToolCalls: ToolCallRequest[];
}

/** Pure classification of a model turn — the first branch point of the agent loop. */
export function interpretModelResponse(
  result: ChatCompleteResult,
): ModelFinalAnswer | ModelToolCall {
  if (result.toolCalls.length === 0) {
    return { kind: 'FINAL_ANSWER', text: result.content ?? '' };
  }
  const [toolCall, ...additionalToolCalls] = result.toolCalls;
  return { kind: 'TOOL_CALL', toolCall: toolCall!, additionalToolCalls };
}

/** Appends the assistant's tool-call turn to history, so a provider needing the full round-trip (e.g. Anthropic) can reconstruct it. */
export function appendAssistantToolCallMessage(
  messages: ChatMessage[],
  toolCall: ToolCallRequest,
  rawContent: string | null,
): ChatMessage[] {
  return [...messages, { role: 'assistant', content: rawContent ?? '', toolCalls: [toolCall] }];
}

/** Appends a tool-role message carrying the (successful or error) result back into history for the next model call. */
export function appendToolResultMessage(
  messages: ChatMessage[],
  toolCall: ToolCallRequest,
  resultText: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: 'tool', content: resultText, toolCallId: toolCall.id, toolName: toolCall.toolName },
  ];
}

/** Bounded loop — doc 26's "long-running autonomous tasks" is explicitly deferred; this loop always terminates within maxIterations. */
export function hasReachedIterationLimit(iteration: number, maxIterations: number): boolean {
  return iteration >= maxIterations;
}

/**
 * Everything needed to resume an agent loop mid-flight after a human approval decision —
 * the exact shape persisted into `AgentExecution.pausedState` while status is
 * AWAITING_APPROVAL. See docs/DOMAIN_MODEL_PHASE6.md §10.
 */
export interface PausedAgentLoopState {
  messages: ChatMessage[];
  iteration: number;
  pendingToolCall: ToolCallRequest;
  /** The model's raw (possibly empty) text alongside the tool call, needed to reconstruct the assistant turn on resume. */
  pendingToolCallRawContent: string | null;
}
