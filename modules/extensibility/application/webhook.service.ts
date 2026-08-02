import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { generateOpaqueToken } from '@platform/auth';
import type { TenantScopedPrismaClient, Webhook, WebhookDelivery } from '@platform/database';
import { WebhookDeliveryRepository, WebhookRepository } from '../infrastructure/webhook.repository';
import { WebhookDispatcher } from '../infrastructure/webhook-dispatcher';
import { PluginService } from './plugin.service';
import type { ExtensibilityAuditWriter } from './ports';

/** Events any webhook is allowed to subscribe to this pass — matches what the dispatch
 * subscriber (Batch B) actually wires up. Doc 27 names a larger event catalog; only the ones a
 * real subscriber exists for are accepted, so a subscription is never silently dead. */
export const WEBHOOK_SUPPORTED_EVENT_TYPES = ['OrderCreated'];

/**
 * Gated behind the Plugin lifecycle (`PluginService`) — a company must have the `'webhooks'`
 * plugin installed AND active before a subscription can be created. Real HMAC secret
 * (`generateOpaqueToken`, same primitive API keys use), real `/webhooks/test` on-demand ping via
 * the same `WebhookDispatcher` the real event-bus dispatch subscriber uses.
 */
@Injectable()
export class WebhookService {
  private readonly webhooks: WebhookRepository;
  private readonly deliveries: WebhookDeliveryRepository;
  private readonly dispatcher = new WebhookDispatcher();

  constructor(
    db: TenantScopedPrismaClient,
    private readonly plugins: PluginService,
    private readonly audit: ExtensibilityAuditWriter,
  ) {
    this.webhooks = new WebhookRepository(db);
    this.deliveries = new WebhookDeliveryRepository(db);
  }

  async create(
    companyId: string,
    url: string,
    eventTypes: string[],
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Webhook> {
    const pluginActive = await this.plugins.isEnabled(companyId, 'webhooks');
    if (!pluginActive) {
      throw new ForbiddenException(
        'The Webhooks plugin must be installed and activated before creating a webhook.',
      );
    }
    const unsupported = eventTypes.filter((t) => !WEBHOOK_SUPPORTED_EVENT_TYPES.includes(t));
    if (unsupported.length > 0) {
      throw new BadRequestException(`Unsupported event type(s): ${unsupported.join(', ')}.`);
    }

    const secret = generateOpaqueToken(32);
    const webhook = await this.webhooks.create({ companyId, url, eventTypes, secret });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.WEBHOOK_CREATED,
      entityType: 'Webhook',
      entityId: webhook.id,
      after: { url, eventTypes },
      ipAddress: ipAddress ?? null,
    });
    return webhook;
  }

  list(companyId: string): Promise<Webhook[]> {
    return this.webhooks.list(companyId);
  }

  listDeliveries(companyId: string, webhookId: string): Promise<WebhookDelivery[]> {
    return this.deliveries.listForWebhook(companyId, webhookId);
  }

  /** An immediate on-demand ping — not routed through the event bus, unlike real dispatch. */
  async test(companyId: string, webhookId: string, actorUserId: string): Promise<WebhookDelivery> {
    const webhook = await this.webhooks.findById(webhookId);
    if (!webhook || webhook.companyId !== companyId) {
      throw new NotFoundException('Webhook not found.');
    }

    const result = await this.dispatcher.deliver(webhook.url, webhook.secret, 'webhook.test', {
      message: 'This is a test delivery from NavOasis.',
    });

    const delivery = await this.deliveries.record({
      companyId,
      webhookId,
      eventType: 'webhook.test',
      status: result.success ? 'SUCCEEDED' : 'FAILED',
      responseStatusCode: result.statusCode,
    });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: result.success
        ? AuditEventType.WEBHOOK_DELIVERED
        : AuditEventType.WEBHOOK_DELIVERY_FAILED,
      entityType: 'WebhookDelivery',
      entityId: delivery.id,
      ipAddress: null,
    });
    return delivery;
  }
}
