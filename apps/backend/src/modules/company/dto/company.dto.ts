import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CompanyStatus } from '@platform/types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'];

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  companyCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tradeName?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tradeName?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}

export class SetFeatureDto {
  @IsString()
  @IsNotEmpty()
  moduleName!: string;

  enabled!: boolean;
}
