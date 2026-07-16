import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  verifyTotpToken,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
} from './totp';

describe('totp', () => {
  it('verifies a token generated from the same secret', () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotpToken(secret, token)).toBe(true);
  });

  it('rejects a token generated from a different secret', () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const token = authenticator.generate(secretB);
    expect(verifyTotpToken(secretA, token)).toBe(false);
  });

  it('encrypts and decrypts a secret round-trip', () => {
    const secret = generateTotpSecret();
    const key = 'test-encryption-key';
    const encrypted = encryptSecret(secret, key);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted, key)).toBe(secret);
  });

  it('fails to decrypt with the wrong key', () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, 'right-key');
    expect(() => decryptSecret(encrypted, 'wrong-key')).toThrow();
  });

  it('generates unique, hashable backup codes', () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const hashes = codes.map(hashBackupCode);
    expect(new Set(hashes).size).toBe(10);
    expect(hashBackupCode(codes[0] as string)).toBe(hashes[0]);
  });
});
