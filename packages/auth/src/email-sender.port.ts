/**
 * Minimal notification port so Phase 1 auth flows (email-OTP, password reset, email
 * verification) can send email without depending on the (later-phase) notifications package.
 * A real adapter (SMTP/SES/etc.) can implement this interface without touching auth code.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export const EMAIL_SENDER_PORT = Symbol('EMAIL_SENDER_PORT');

export interface EmailSenderPort {
  send(message: EmailMessage): Promise<void>;
}
