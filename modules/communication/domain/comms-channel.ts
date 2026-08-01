import type { NotificationChannel } from '@platform/database';

/**
 * Which channels can actually dispatch a real outbound message today — mirrors
 * `packages/notifications`' own `ChannelAdapterRegistry` split exactly (EMAIL/IN_APP real,
 * WHATSAPP/SMS/PUSH seams). Only checked for OUTBOUND sends — recording an INBOUND message
 * (one that arrived via some channel, however it got here) is always allowed regardless of
 * whether we could dispatch on that channel ourselves; see
 * docs/DOMAIN_MODEL_PHASE7.md, Communication section.
 */
const REAL_CHANNELS: ReadonlySet<NotificationChannel> = new Set(['EMAIL', 'IN_APP']);

export function isRealChannel(channel: NotificationChannel): boolean {
  return REAL_CHANNELS.has(channel);
}
