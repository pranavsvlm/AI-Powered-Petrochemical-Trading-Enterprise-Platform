import { useCallback } from 'react';
import { useApiClient } from '@platform/ui';
import type { AgentExecutionResult } from './use-executions';

export function useSendChatMessage() {
  const api = useApiClient();
  return useCallback(
    (agentKey: string, message: string, conversationId?: string) =>
      api.post<AgentExecutionResult>('/ai/chat', { agentKey, message, conversationId }),
    [api],
  );
}
