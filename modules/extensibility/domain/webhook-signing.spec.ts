import { createHmac } from 'node:crypto';
import { signWebhookPayload } from './webhook-signing';

describe('signWebhookPayload', () => {
  it('produces the same signature a receiver would independently compute', () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({ orderId: 'abc-123', totalAmount: '1000.00' });

    const expected = createHmac('sha256', secret).update(body).digest('hex');
    expect(signWebhookPayload(secret, body)).toBe(expected);
  });

  it('produces different signatures for different secrets', () => {
    const body = JSON.stringify({ foo: 'bar' });
    expect(signWebhookPayload('secret-a', body)).not.toBe(signWebhookPayload('secret-b', body));
  });

  it('produces different signatures for different bodies', () => {
    const secret = 'whsec_test';
    expect(signWebhookPayload(secret, '{"a":1}')).not.toBe(signWebhookPayload(secret, '{"a":2}'));
  });
});
