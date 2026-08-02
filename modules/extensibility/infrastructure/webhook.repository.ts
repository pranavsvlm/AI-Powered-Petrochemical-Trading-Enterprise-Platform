import type {
  TenantScopedPrismaClient,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryStatus,
} from '@platform/database';

export interface CreateWebhookInput {
  companyId: string;
  url: string;
  eventTypes: string[];
  secret: string;
}

export interface RecordDeliveryInput {
  companyId: string;
  webhookId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  responseStatusCode?: number;
}

export class WebhookRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateWebhookInput): Promise<Webhook> {
    return this.db.webhook.create({ data: input });
  }

  list(companyId: string): Promise<Webhook[]> {
    return this.db.webhook.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  findById(id: string): Promise<Webhook | null> {
    return this.db.webhook.findUnique({ where: { id } });
  }

  /** Every real webhook, across every company, currently subscribed to this event type —
   * scoped per-event by the caller passing that event's own `companyId`, never a cross-tenant
   * scan (see webhook-dispatch.subscriber.ts). */
  listSubscribedTo(companyId: string, eventType: string): Promise<Webhook[]> {
    return this.db.webhook.findMany({
      where: { companyId, enabled: true, eventTypes: { has: eventType } },
    });
  }
}

export class WebhookDeliveryRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  record(input: RecordDeliveryInput): Promise<WebhookDelivery> {
    return this.db.webhookDelivery.create({
      data: { ...input, lastAttemptAt: new Date() },
    });
  }

  listForWebhook(companyId: string, webhookId: string): Promise<WebhookDelivery[]> {
    return this.db.webhookDelivery.findMany({
      where: { companyId, webhookId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
