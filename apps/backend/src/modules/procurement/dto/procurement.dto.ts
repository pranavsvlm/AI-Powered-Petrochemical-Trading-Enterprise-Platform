import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const UNIT_OF_MEASURES = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'] as const;
const INSPECTION_RESULTS = ['PENDING', 'PASSED', 'FAILED'] as const;

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  supplierCode!: string;

  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;
}

export class AddSupplierContactDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}

export class RequisitionLineItemDto {
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
  estimatedUnitPrice?: number;
}

export class CreateRequisitionDto {
  @IsString()
  @IsNotEmpty()
  requisitionNumber!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineItemDto)
  lineItems!: RequisitionLineItemDto[];
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

export class PurchaseOrderLineItemDto {
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

export class CreatePurchaseOrderDirectDto {
  @IsString()
  @IsNotEmpty()
  poNumber!: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineItemDto)
  lineItems!: PurchaseOrderLineItemDto[];
}

export class CreatePurchaseOrderFromRequisitionDto {
  @IsString()
  @IsNotEmpty()
  poNumber!: string;

  @IsString()
  @IsNotEmpty()
  requisitionId!: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}

export class GoodsReceiptLineItemDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantityReceived!: number;

  @IsOptional()
  @IsIn(INSPECTION_RESULTS)
  inspectionResult?: (typeof INSPECTION_RESULTS)[number];

  @IsOptional()
  @IsString()
  batchNumber?: string;
}

export class CreateGoodsReceiptDto {
  @IsString()
  @IsNotEmpty()
  receiptNumber!: string;

  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineItemDto)
  lineItems!: GoodsReceiptLineItemDto[];
}
