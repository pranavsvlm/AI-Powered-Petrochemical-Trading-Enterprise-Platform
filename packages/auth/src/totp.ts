import { authenticator } from 'otplib';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

/**
 * TOTP (RFC 6238) MFA support (doc 09). Secrets are encrypted at rest with AES-256-GCM using
 * a key derived from MFA_ENCRYPTION_KEY (env var) — never stored in plaintext.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function generateTotpUri(secret: string, accountEmail: string, issuer = 'NavOasis'): string {
  return authenticator.keyuri(accountEmail, issuer, secret);
}

export function verifyTotpToken(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}

function deriveKey(encryptionKeyEnv: string): Buffer {
  return createHash('sha256').update(encryptionKeyEnv).digest();
}

export function encryptSecret(plainSecret: string, encryptionKeyEnv: string): string {
  const key = deriveKey(encryptionKeyEnv);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(encryptedPayload: string, encryptionKeyEnv: string): string {
  const key = deriveKey(encryptionKeyEnv);
  const raw = Buffer.from(encryptedPayload, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Backup recovery codes (doc 09) — generated in plaintext once, only hashes are ever stored. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(5).toString('hex'));
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
