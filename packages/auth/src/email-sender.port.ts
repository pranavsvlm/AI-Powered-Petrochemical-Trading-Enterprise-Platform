/**
 * Phase 2: this port is promoted to live in @platform/notifications (the long-term owner —
 * see docs/DOMAIN_MODEL_PHASE2.md §2). Re-exported here so existing Phase 1 auth
 * call sites (`import { EmailSenderPort } from '@platform/auth'`) keep working unmodified.
 */
export { EMAIL_SENDER_PORT } from '@platform/notifications';
export type { EmailSenderPort, EmailMessage } from '@platform/notifications';
