import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailSenderPort } from './email-sender.port';

/**
 * Console-logging EmailSenderPort implementation. Real transactional email (SMTP/SES/etc.)
 * lands with the notifications package in a later phase; this lets Phase 1 flows
 * (email verification, password reset, email-OTP) function and be tested end to end today.
 */
@Injectable()
export class ConsoleEmailSenderAdapter implements EmailSenderPort {
  private readonly logger = new Logger(ConsoleEmailSenderAdapter.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`[email] to=${message.to} subject="${message.subject}" body="${message.body}"`);
  }
}
