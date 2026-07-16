import { hashPassword, verifyPassword, isPasswordComplex } from './password';

describe('password', () => {
  it('accepts a complex password', () => {
    expect(isPasswordComplex('Str0ng!Passw0rd')).toBe(true);
  });

  it('rejects passwords missing complexity requirements', () => {
    expect(isPasswordComplex('short1!')).toBe(false); // too short
    expect(isPasswordComplex('nouppercase1!')).toBe(false);
    expect(isPasswordComplex('NOLOWERCASE1!')).toBe(false);
    expect(isPasswordComplex('NoDigitsHere!')).toBe(false);
    expect(isPasswordComplex('NoSymbolsHere1')).toBe(false);
  });

  it('hashes and verifies a password round-trip', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd');
    expect(hash).not.toBe('Str0ng!Passw0rd');
    expect(await verifyPassword(hash, 'Str0ng!Passw0rd')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('verifyPassword returns false (not throw) for a malformed hash', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});
