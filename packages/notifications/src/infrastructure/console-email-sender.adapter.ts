import type { EmailMessage, EmailSenderPort } from '../domain/ports/email-sender.port';

/** Dev/test adapter — used when NOTIFICATIONS_EMAIL_ADAPTER=console. */
export class ConsoleEmailSenderAdapter implements EmailSenderPort {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[email] to=${message.to} subject="${message.subject}" body="${message.body}"`);
  }
}
