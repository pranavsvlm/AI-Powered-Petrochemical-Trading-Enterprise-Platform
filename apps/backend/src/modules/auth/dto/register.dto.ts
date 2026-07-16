import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_REGEX } from '@platform/auth';

export class RegisterDto {
  @IsUUID()
  companyId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must be at least 10 characters and include upper, lower, digit, and symbol.',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9()\-\s]{7,20}$/, { message: 'Invalid phone format.' })
  phone?: string;
}
