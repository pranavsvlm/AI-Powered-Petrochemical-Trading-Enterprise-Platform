export const PACKAGE_NAME = '@platform/auth';

export {
  hashPassword,
  verifyPassword,
  isPasswordComplex,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
} from './password';
export { generateOpaqueToken, hashToken } from './tokens';
export {
  generateTotpSecret,
  generateTotpUri,
  verifyTotpToken,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
} from './totp';
export { EMAIL_SENDER_PORT } from './email-sender.port';
export type { EmailSenderPort, EmailMessage } from './email-sender.port';
export { ConsoleEmailSenderAdapter } from './console-email-sender.adapter';
