/**
 * Promoted from packages/auth (Phase 1) to live here — see docs/DOMAIN_MODEL_PHASE2.md §2.
 * packages/auth now depends on this package instead of defining its own port.
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
