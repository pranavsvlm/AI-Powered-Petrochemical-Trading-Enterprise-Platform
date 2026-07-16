import { createHash, randomBytes } from 'node:crypto';

/** Generates a cryptographically random opaque token (used for refresh tokens, reset/verify links). */
export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored hashed at rest (doc 09: "Refresh Token: Stored securely"). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
