import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSenderPort } from '../domain/ports/email-sender.port';

/** Real SMTP adapter (nodemailer), configured from SMTP_* env vars. */
export class SmtpEmailSenderAdapter implements EmailSenderPort {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    this.from = process.env.SMTP_FROM || 'no-reply@platform.local';
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
  }
}
