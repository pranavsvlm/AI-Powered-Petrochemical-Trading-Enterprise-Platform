import { IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

const UNIT_OF_MEASURES = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'] as const;
const PACKAGING_TYPES = [
  'DRUM',
  'IBC',
  'FLEXIBAG',
  'ISO_TANK',
  'TANK_TRUCK',
  'BULK_VESSEL',
  'BAG',
  'PAIL',
  'CUSTOM',
] as const;
const ATTRIBUTE_DATA_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'DATE'] as const;
const PRICE_TYPES = [
  'BASE',
  'CUSTOMER_SPECIFIC',
  'CONTRACT',
  'PROMOTIONAL',
  'QUANTITY_BREAK',
  'REGION',
] as const;

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsOptional()
  @IsString()
  productCode?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  parentProductId?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  hsCode?: string;

  @IsOptional()
  @IsString()
  casNumber?: string;

  @IsOptional()
  @IsString()
  unNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(UNIT_OF_MEASURES)
  baseUom!: (typeof UNIT_OF_MEASURES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  standardCost?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  standardCost?: number;
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateAttributeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(ATTRIBUTE_DATA_TYPES)
  dataType!: (typeof ATTRIBUTE_DATA_TYPES)[number];

  @IsOptional()
  @IsString()
  unit?: string;
}

export class SetAttributeValueDto {
  @IsString()
  @IsNotEmpty()
  attributeId!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;
}

export class AddPackagingDto {
  @IsIn(PACKAGING_TYPES)
  packagingType!: (typeof PACKAGING_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitsPerPackage?: number;

  @IsOptional()
  @IsIn(UNIT_OF_MEASURES)
  uom?: (typeof UNIT_OF_MEASURES)[number];
}

export class UpsertPriceListDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsIn(PRICE_TYPES)
  priceType?: (typeof PRICE_TYPES)[number];

  @IsOptional()
  @IsString()
  region?: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsIn(UNIT_OF_MEASURES)
  uom!: (typeof UNIT_OF_MEASURES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  validFrom?: string;

  @IsOptional()
  validTo?: string;
}

export class RequestApprovalDto {
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class AiPricingRequestDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsNumber()
  @Min(0)
  quantity!: number;
}

export class AiProductExpertQuestionDto {
  @IsString()
  @IsNotEmpty()
  question!: string;
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
