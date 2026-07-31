import {
  interpretModelResponse,
  appendAssistantToolCallMessage,
  appendToolResultMessage,
  hasReachedIterationLimit,
} from './agent-loop';
import type { ChatCompleteResult, ChatMessage } from '../../router/domain/provider-client.port';

describe('interpretModelResponse', () => {
  it('classifies a response with no tool calls as a final answer', () => {
    const result: ChatCompleteResult = {
      content: 'The answer is 42.',
      toolCalls: [],
      promptTokens: 1,
      completionTokens: 1,
    };
    expect(interpretModelResponse(result)).toEqual({
      kind: 'FINAL_ANSWER',
      text: 'The answer is 42.',
    });
  });

  it('treats a null content with no tool calls as an empty-string final answer, not a crash', () => {
    const result: ChatCompleteResult = {
      content: null,
      toolCalls: [],
      promptTokens: 1,
      completionTokens: 1,
    };
    expect(interpretModelResponse(result)).toEqual({ kind: 'FINAL_ANSWER', text: '' });
  });

  it('classifies a response with one tool call as a TOOL_CALL with no additional calls', () => {
    const result: ChatCompleteResult = {
      content: null,
      toolCalls: [{ id: 'call_1', toolName: 'customers.getById', arguments: { id: 'c1' } }],
      promptTokens: 1,
      completionTokens: 1,
    };
    expect(interpretModelResponse(result)).toEqual({
      kind: 'TOOL_CALL',
      toolCall: { id: 'call_1', toolName: 'customers.getById', arguments: { id: 'c1' } },
      additionalToolCalls: [],
    });
  });

  it('carries extra tool calls beyond the first as additionalToolCalls, not silently dropping them', () => {
    const result: ChatCompleteResult = {
      content: null,
      toolCalls: [
        { id: 'call_1', toolName: 'a', arguments: {} },
        { id: 'call_2', toolName: 'b', arguments: {} },
      ],
      promptTokens: 1,
      completionTokens: 1,
    };
    const interpreted = interpretModelResponse(result);
    expect(interpreted.kind).toBe('TOOL_CALL');
    if (interpreted.kind === 'TOOL_CALL') {
      expect(interpreted.toolCall.id).toBe('call_1');
      expect(interpreted.additionalToolCalls).toEqual([
        { id: 'call_2', toolName: 'b', arguments: {} },
      ]);
    }
  });
});

describe('appendAssistantToolCallMessage / appendToolResultMessage', () => {
  it('builds a valid assistant-then-tool round trip appended to existing history', () => {
    const history: ChatMessage[] = [{ role: 'user', content: 'check the weather' }];
    const toolCall = { id: 'call_1', toolName: 'weather.get', arguments: { city: 'Paris' } };

    const withAssistant = appendAssistantToolCallMessage(history, toolCall, null);
    expect(withAssistant).toEqual([
      { role: 'user', content: 'check the weather' },
      { role: 'assistant', content: '', toolCalls: [toolCall] },
    ]);

    const withResult = appendToolResultMessage(withAssistant, toolCall, '{"temp":20}');
    expect(withResult[2]).toEqual({
      role: 'tool',
      content: '{"temp":20}',
      toolCallId: 'call_1',
      toolName: 'weather.get',
    });
  });

  it('does not mutate the original messages array (pure)', () => {
    const history: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    const toolCall = { id: 'call_1', toolName: 'x', arguments: {} };
    appendAssistantToolCallMessage(history, toolCall, null);
    expect(history).toHaveLength(1);
  });
});

describe('hasReachedIterationLimit', () => {
  it('is false below the limit and true at/after it', () => {
    expect(hasReachedIterationLimit(0, 8)).toBe(false);
    expect(hasReachedIterationLimit(7, 8)).toBe(false);
    expect(hasReachedIterationLimit(8, 8)).toBe(true);
    expect(hasReachedIterationLimit(9, 8)).toBe(true);
  });
});
