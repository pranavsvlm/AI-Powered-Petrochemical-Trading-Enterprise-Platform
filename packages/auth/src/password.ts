import * as argon2 from 'argon2';

/**
 * Password complexity per doc 09 "Password Policy": minimum length + complexity rules.
 * Min 10 chars, at least one uppercase, one lowercase, one digit, one symbol.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export function isPasswordComplex(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
