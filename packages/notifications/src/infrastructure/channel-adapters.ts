import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { ChannelAdapter, ChannelSendInput } from '../domain/ports/channel-adapter.port';
import type { EmailSenderPort } from '../domain/ports/email-sender.port';
import { ChannelNotAvailableError } from '../domain/errors';

export class EmailChannelAdapter implements ChannelAdapter {
  constructor(private readonly emailSender: EmailSenderPort) {}

  async send(input: ChannelSendInput): Promise<void> {
    if (!input.recipientEmail) throw new Error('EmailChannelAdapter requires recipientEmail.');
    await this.emailSender.send({
      to: input.recipientEmail,
      subject: input.subject ?? 'Notification',
      body: input.body,
    });
  }
}

/** In-app notifications are just the persisted Notification row itself — nothing further to "send". */
export class InAppChannelAdapter implements ChannelAdapter {
  constructor(private readonly prisma: TenantScopedPrismaClient = getPrismaClient()) {}

  async send(): Promise<void> {
    // No-op: the Notification row is the delivery artifact for IN_APP; NotificationService
    // already persisted it before dispatching to channel adapters.
  }
}

/** docs/DOMAIN_MODEL_PHASE2.md §2 — fails fast for channels with no real adapter yet. */
export class UnavailableChannelAdapter implements ChannelAdapter {
  constructor(private readonly channel: string) {}
  send(): Promise<void> {
    throw new ChannelNotAvailableError(this.channel);
  }
}

export class ChannelAdapterRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();

  constructor(emailSender: EmailSenderPort) {
    this.adapters.set('EMAIL', new EmailChannelAdapter(emailSender));
    this.adapters.set('IN_APP', new InAppChannelAdapter());
    this.adapters.set('WHATSAPP', new UnavailableChannelAdapter('WHATSAPP'));
    this.adapters.set('SMS', new UnavailableChannelAdapter('SMS'));
    this.adapters.set('PUSH', new UnavailableChannelAdapter('PUSH'));
  }

  get(channel: string): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new ChannelNotAvailableError(channel);
    return adapter;
  }
}
