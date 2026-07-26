import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

export class CreateChartOfAccountDto {
  @IsString()
  @IsNotEmpty()
  accountCode!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(ACCOUNT_TYPES)
  accountType!: (typeof ACCOUNT_TYPES)[number];
}

export class JournalLineDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsNumber()
  debit!: number;

  @IsNumber()
  credit!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class PostJournalDto {
  @IsString()
  @IsNotEmpty()
  journalNumber!: string;

  @IsDateString()
  journalDate!: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsString()
  @IsNotEmpty()
  sourceType!: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class RecordPaymentDto {
  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class GenerateSupplierBillDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @IsOptional()
  @IsString()
  goodsReceiptId?: string;
}
