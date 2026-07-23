import type {
  TenantScopedPrismaClient,
  Product,
  Category,
  ProductAttribute,
  ProductAttributeValue,
  ProductPackaging,
  PriceList,
  ProductStatus,
  PackagingType,
  UnitOfMeasure,
  AttributeDataType,
  ApprovalRequest,
  ApprovalStatus,
} from '@platform/database';

export interface CreateProductInput {
  companyId: string;
  sku: string;
  productCode?: string;
  name: string;
  categoryId?: string;
  parentProductId?: string;
  brand?: string;
  manufacturer?: string;
  countryOfOrigin?: string;
  hsCode?: string;
  casNumber?: string;
  unNumber?: string;
  description?: string;
  baseUom: UnitOfMeasure;
  standardCost?: number;
}

export interface UpsertPriceListInput {
  companyId: string;
  productId: string;
  customerId?: string;
  priceType?: string;
  region?: string;
  currency: string;
  uom: UnitOfMeasure;
  minQuantity?: number;
  unitPrice: number;
  validFrom?: Date;
  validTo?: Date;
}

const PRODUCT_INCLUDE = {
  category: true,
  attributeValues: { include: { attribute: true } },
  packaging: true,
  priceLists: true,
} as const;

export type ProductWithRelations = Product & {
  category: Category | null;
  attributeValues: Array<ProductAttributeValue & { attribute: ProductAttribute }>;
  packaging: ProductPackaging[];
  priceLists: PriceList[];
};

export interface UpdateProductInput {
  name?: string;
  description?: string;
  brand?: string;
  manufacturer?: string;
  standardCost?: number;
}

export class ProductRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateProductInput): Promise<ProductWithRelations> {
    return this.prisma.product.create({
      data: { ...input, status: 'DRAFT' },
      include: PRODUCT_INCLUDE,
    });
  }

  findById(id: string): Promise<ProductWithRelations | null> {
    return this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
  }

  list(filters: {
    companyId: string;
    status?: ProductStatus;
    categoryId?: string;
  }): Promise<ProductWithRelations[]> {
    return this.prisma.product.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        categoryId: filters.categoryId,
      },
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: UpdateProductInput): Promise<ProductWithRelations> {
    return this.prisma.product.update({ where: { id }, data, include: PRODUCT_INCLUDE });
  }

  updateStatus(id: string, status: ProductStatus): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data: { status } });
  }

  createCategory(companyId: string, name: string, parentId?: string): Promise<Category> {
    return this.prisma.category.create({ data: { companyId, name, parentId } });
  }

  listCategories(companyId: string): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  createAttribute(
    companyId: string,
    name: string,
    dataType: AttributeDataType,
    unit?: string,
  ): Promise<ProductAttribute> {
    return this.prisma.productAttribute.create({ data: { companyId, name, dataType, unit } });
  }

  listAttributes(companyId: string): Promise<ProductAttribute[]> {
    return this.prisma.productAttribute.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  findAttributeById(id: string): Promise<ProductAttribute | null> {
    return this.prisma.productAttribute.findUnique({ where: { id } });
  }

  setAttributeValue(
    productId: string,
    attributeId: string,
    value: string,
    valueNumber: number | null,
  ): Promise<ProductAttributeValue> {
    return this.prisma.productAttributeValue.upsert({
      where: { productId_attributeId: { productId, attributeId } },
      create: { productId, attributeId, value, valueNumber },
      update: { value, valueNumber },
    });
  }

  listAttributeValues(productId: string): Promise<ProductAttributeValue[]> {
    return this.prisma.productAttributeValue.findMany({
      where: { productId },
      include: { attribute: true },
    });
  }

  addPackaging(
    productId: string,
    packagingType: PackagingType,
    unitsPerPackage?: number,
    uom?: UnitOfMeasure,
  ): Promise<ProductPackaging> {
    return this.prisma.productPackaging.upsert({
      where: { productId_packagingType: { productId, packagingType } },
      create: { productId, packagingType, unitsPerPackage, uom },
      update: { unitsPerPackage, uom },
    });
  }

  listPackaging(productId: string): Promise<ProductPackaging[]> {
    return this.prisma.productPackaging.findMany({ where: { productId } });
  }

  upsertPriceListEntry(input: UpsertPriceListInput): Promise<PriceList> {
    return this.prisma.priceList.create({
      data: {
        companyId: input.companyId,
        productId: input.productId,
        customerId: input.customerId,
        priceType: (input.priceType as PriceList['priceType']) ?? 'BASE',
        region: input.region,
        currency: input.currency,
        uom: input.uom,
        minQuantity: input.minQuantity ?? 0,
        unitPrice: input.unitPrice,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
    });
  }

  listPriceLists(companyId: string, productId?: string): Promise<PriceList[]> {
    return this.prisma.priceList.findMany({ where: { companyId, productId } });
  }

  createApproval(input: {
    companyId: string;
    productId: string;
    ruleExecutionId?: string;
    approverUserId?: string;
    approverRoleId?: string;
  }): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'product',
        entityId: input.productId,
        ruleExecutionId: input.ruleExecutionId,
        approverUserId: input.approverUserId,
        approverRoleId: input.approverRoleId,
      },
    });
  }

  findApproval(id: string): Promise<ApprovalRequest | null> {
    return this.prisma.approvalRequest.findUnique({ where: { id } });
  }

  decideApproval(id: string, decision: ApprovalStatus, comment?: string): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.update({
      where: { id },
      data: { status: decision, decidedAt: new Date(), comment },
    });
  }
}
