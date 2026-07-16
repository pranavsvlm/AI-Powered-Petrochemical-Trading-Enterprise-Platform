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

export class CreateUserDto {
  @IsEmail()
  email!: string;

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

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must be at least 10 characters and include upper, lower, digit, and symbol.',
  })
  temporaryPassword!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class CreateTeamDto {
  @IsUUID()
  departmentId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}
