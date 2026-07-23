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
  Min,
  ValidateNested,
} from 'class-validator';

const UNIT_OF_MEASURES = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'] as const;
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'DDP', 'DAP'] as const;

export class CreateOrderFromQuotationDto {
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @IsString()
  @IsNotEmpty()
  quotationId!: string;
}

export class OrderLineItemDto {
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
}

export class CreateOrderDirectDto {
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsIn(INCOTERMS)
  incoterm?: (typeof INCOTERMS)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineItemDto)
  lineItems!: OrderLineItemDto[];
}

export class AmendOrderDto {
  @IsOptional()
  @IsIn(INCOTERMS)
  incoterm?: (typeof INCOTERMS)[number];

  @IsOptional()
  @IsString()
  currency?: string;
}

export class FulfillLineDto {
  @IsString()
  @IsNotEmpty()
  lineItemId!: string;

  @IsNumber()
  @Min(0)
  fulfilledQuantity!: number;
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
