import { IsEmail, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';
import { PASSWORD_REGEX } from '@platform/auth';

export class LoginDto {
  @IsUUID()
  companyId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  mfaToken?: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  browser?: string;

  @IsOptional()
  @IsString()
  os?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  refreshToken!: string;
}

export class RequestPasswordResetDto {
  @IsUUID()
  companyId!: string;

  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must be at least 10 characters and include upper, lower, digit, and symbol.',
  })
  newPassword!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class EnrollTotpDto {
  @IsString()
  accountLabel!: string;
}

export class ConfirmTotpDto {
  @IsString()
  token!: string;
}
