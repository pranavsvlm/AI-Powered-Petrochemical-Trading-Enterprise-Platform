import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const UNIT_OF_MEASURES = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'] as const;

export class RfqLineItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsIn(UNIT_OF_MEASURES)
  uom!: (typeof UNIT_OF_MEASURES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetPrice?: number;
}

export class CreateRfqDto {
  @IsString()
  @IsNotEmpty()
  rfqNumber!: string;

  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RfqLineItemDto)
  lineItems!: RfqLineItemDto[];
}

export class AddRfqLineItemDto extends RfqLineItemDto {}

export class QuotationLineInputDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class CreateQuotationFromRfqDto {
  @IsString()
  @IsNotEmpty()
  quotationNumber!: string;

  @IsString()
  @IsNotEmpty()
  rfqId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineInputDto)
  lineItems!: QuotationLineInputDto[];

  @IsOptional()
  validUntil?: string;
}

export class CreateQuotationDirectDto {
  @IsString()
  @IsNotEmpty()
  quotationNumber!: string;

  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineInputDto)
  lineItems!: QuotationLineInputDto[];

  @IsOptional()
  validUntil?: string;
}

export class ReviseQuotationLineDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsIn(UNIT_OF_MEASURES)
  uom!: (typeof UNIT_OF_MEASURES)[number];

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class ReviseQuotationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReviseQuotationLineDto)
  lineItems!: ReviseQuotationLineDto[];
}

export class RequestApprovalDto {
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class DecideApprovalDto {
  @IsString()
  @IsNotEmpty()
  approvalId!: string;

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  comment?: string;
}
