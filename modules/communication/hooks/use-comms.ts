import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export type CommsThreadType = 'CUSTOMER' | 'SUPPLIER' | 'INTERNAL' | 'ANNOUNCEMENT';
export type CommsThreadStatus = 'ACTIVE' | 'CLOSED';
export type CommsMessageDirection = 'INBOUND' | 'OUTBOUND';
export type NotificationChannel = 'EMAIL' | 'IN_APP' | 'WHATSAPP' | 'SMS' | 'PUSH';

export interface CommsThread {
  id: string;
  companyId: string;
  type: CommsThreadType;
  status: CommsThreadStatus;
  subjectType?: string | null;
  subjectId?: string | null;
  title?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommsParticipant {
  id: string;
  threadId: string;
  userId?: string | null;
  externalName?: string | null;
  externalIdentifier?: string | null;
  addedAt: string;
}

export interface CommsMessage {
  id: string;
  threadId: string;
  senderUserId?: string | null;
  senderExternalName?: string | null;
  direction: CommsMessageDirection;
  channel: NotificationChannel;
  content: string;
  createdAt: string;
}

export interface ThreadWithChildren extends CommsThread {
  participants: CommsParticipant[];
  messages: CommsMessage[];
}

export interface CreateThreadInput {
  type: CommsThreadType;
  subjectType?: string;
  subjectId?: string;
  title?: string;
}

export interface AddParticipantInput {
  userId?: string;
  externalName?: string;
  externalIdentifier?: string;
}

export interface SendMessageInput {
  direction: CommsMessageDirection;
  channel: NotificationChannel;
  content: string;
  senderExternalName?: string;
}

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    load()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => refetch(), [refetch]);

  return { data, loading, error, refetch };
}

export function useThreads(type?: CommsThreadType, status?: CommsThreadStatus) {
  const api = useApiClient();
  return useAsync<CommsThread[]>(() => api.get('/comms/threads', { type, status }), [type, status]);
}

export function useThread(id: string) {
  const api = useApiClient();
  return useAsync<ThreadWithChildren>(() => api.get(`/comms/threads/${id}`), [id]);
}

export function useCreateThread() {
  const api = useApiClient();
  return useCallback(
    (input: CreateThreadInput) => api.post<CommsThread>('/comms/threads', input),
    [api],
  );
}

export function useCloseThread() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post<CommsThread>(`/comms/threads/${id}/close`, {}),
    [api],
  );
}

export function useAddParticipant() {
  const api = useApiClient();
  return useCallback(
    (threadId: string, input: AddParticipantInput) =>
      api.post<CommsParticipant>(`/comms/threads/${threadId}/participants`, input),
    [api],
  );
}

export function useSendMessage() {
  const api = useApiClient();
  return useCallback(
    (threadId: string, input: SendMessageInput) =>
      api.post<CommsMessage>(`/comms/threads/${threadId}/messages`, input),
    [api],
  );
}

export function useCreateTaskFromThread() {
  const api = useApiClient();
  return useCallback(
    (threadId: string, input: { title: string; description?: string; assigneeUserId?: string }) =>
      api.post<{ eventId: string }>(`/comms/threads/${threadId}/create-task`, input),
    [api],
  );
}
