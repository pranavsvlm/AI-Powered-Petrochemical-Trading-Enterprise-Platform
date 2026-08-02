import { EVENT_TYPES, type RedisStreamsEventBus } from '@platform/event-bus';
import { TenantContextStore } from '@platform/core';
import type { TenantScopedPrismaClient } from '@platform/database';
import { PluginService } from '../application/plugin.service';
import { WebhookDeliveryRepository, WebhookRepository } from './webhook.repository';
import { WebhookDispatcher } from './webhook-dispatcher';

/**
 * The real consumer that turns `ORDER_CREATED` into outbound webhook HTTP calls — registered
 * once at worker bootstrap, same pattern as `registerTaskGenerationRequestedSubscriber`. Reuses
 * the event bus's own retry/backoff/dead-letter entirely for EVENT-PROCESSING failures (e.g. a
 * DB error) by letting those throw — but a single subscribed webhook's HTTP delivery failing is
 * a different, correctly-separated failure mode (some external receiver is down), so it's
 * recorded as a FAILED `WebhookDelivery` row and the loop continues, never thrown: throwing here
 * would make the event bus redeliver the *whole* event to every subscribed webhook again,
 * including ones that already succeeded. A dedicated retry scheduler for FAILED deliveries
 * specifically (the same `node-cron` shape `WorkflowTriggerScheduler` already uses) is a real,
 * deferred follow-up — `WebhookDelivery.attempt` exists for exactly that extension.
 */
export async function registerWebhookDispatchSubscriber(
  eventBus: RedisStreamsEventBus,
  db: TenantScopedPrismaClient,
): Promise<() => Promise<void>> {
  // Only ever used for a read (`isEnabled`) in this context — install/activate/deactivate/
  // uninstall never run through the dispatch path, so a real audit writer is never exercised.
  const plugins = new PluginService(db, { record: async () => {} });
  const webhooks = new WebhookRepository(db);
  const deliveries = new WebhookDeliveryRepository(db);
  const dispatcher = new WebhookDispatcher();

  return eventBus.subscribe(
    EVENT_TYPES.ORDER_CREATED,
    'extensibility:webhook-dispatch',
    async (envelope) => {
      const companyId = envelope.companyId;
      await TenantContextStore.run(
        { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
        async () => {
          const pluginActive = await plugins.isEnabled(companyId, 'webhooks');
          if (!pluginActive) return;

          const subscribed = await webhooks.listSubscribedTo(companyId, EVENT_TYPES.ORDER_CREATED);
          for (const webhook of subscribed) {
            const result = await dispatcher.deliver(
              webhook.url,
              webhook.secret,
              EVENT_TYPES.ORDER_CREATED,
              envelope.payload,
            );
            await deliveries.record({
              companyId,
              webhookId: webhook.id,
              eventType: EVENT_TYPES.ORDER_CREATED,
              status: result.success ? 'SUCCEEDED' : 'FAILED',
              responseStatusCode: result.statusCode,
            });
          }
        },
      );
    },
  );
}
