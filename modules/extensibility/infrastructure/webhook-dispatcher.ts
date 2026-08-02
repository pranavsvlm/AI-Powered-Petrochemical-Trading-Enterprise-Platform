import { signWebhookPayload } from '../domain/webhook-signing';

export interface DispatchResult {
  success: boolean;
  statusCode?: number;
}

const TIMEOUT_MS = 10_000;

/**
 * The actual outbound HTTP call — deliberately has zero DB access, so it's reused identically by
 * both `WebhookService.test()` (an on-demand ping) and the real event-bus dispatch subscriber.
 * Node's built-in `fetch` (same "fetch-based clients, no new HTTP dependency" precedent the AI
 * provider clients already established). Signing/persistence stay separate concerns from the
 * network call itself.
 */
export class WebhookDispatcher {
  async deliver(
    url: string,
    secret: string,
    eventType: string,
    payload: unknown,
  ): Promise<DispatchResult> {
    const body = JSON.stringify({ eventType, payload, deliveredAt: new Date().toISOString() });
    const signature = signWebhookPayload(secret, body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-navoasis-signature': `sha256=${signature}`,
          'x-navoasis-event': eventType,
        },
        body,
        signal: controller.signal,
      });
      return { success: res.ok, statusCode: res.status };
    } catch {
      return { success: false };
    } finally {
      clearTimeout(timeout);
    }
  }
}
