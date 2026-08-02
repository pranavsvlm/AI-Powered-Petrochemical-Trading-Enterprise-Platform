import { createHmac } from 'node:crypto';

/** HMAC-SHA256 over the raw JSON body — same scheme Stripe/GitHub webhooks use. */
export function signWebhookPayload(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
