import { createHash } from 'node:crypto';

/** Exact-duplicate detection uses a SHA-256 content hash — see docs/DOMAIN_MODEL_PHASE3.md §7. */
export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
