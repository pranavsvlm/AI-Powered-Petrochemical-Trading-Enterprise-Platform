/**
 * Event envelope per doc 28's schema exactly.
 */
export interface EventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  companyId: string;
  aggregateId?: string;
  timestamp: string;
  source: string;
  correlationId?: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
}

export interface PublishOptions {
  aggregateId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  eventVersion?: number;
}
