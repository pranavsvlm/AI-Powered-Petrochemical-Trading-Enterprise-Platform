import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
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
} from '@platform/database';
import { castAttributeValue } from '../domain/attribute-cast';
import { resolvePrice, computeMargin, type PriceListEntry } from '../domain/pricing';
import {
  ProductRepository,
  type CreateProductInput,
  type UpdateProductInput,
} from '../infrastructure/product.repository';

export interface ProductAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}

export interface ProductEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/** Narrow slice of RuleEvaluationService's public API — see docs/DOMAIN_MODEL_PHASE4.md. */
export interface ApprovalEvaluator {
  evaluateApproval(
    companyId: string,
    module: string,
    attributes: Record<string, unknown>,
  ): Promise<{
    approvers: Array<{ ruleId: string; [key: string]: unknown }>;
    matchedRuleIds: string[];
  }>;
}

export interface GetEffectivePriceQuery {
  customerId?: string;
  quantity: number;
  currency: string;
  asOf?: Date;
}

/**
 * Application-layer use cases for the Product aggregate (doc 12): category hierarchy,
 * dynamic (EAV) attributes, packaging, and price-list resolution. Approval (Draft -> Active)
 * is delegated to the Rules Engine, never reimplemented here — see
 * docs/DOMAIN_MODEL_PHASE3.md §6 and docs/DOMAIN_MODEL_PHASE4.md.
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  private readonly repo: ProductRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly events: ProductEventPublisher,
    private readonly audit: ProductAuditWriter,
  ) {
    this.repo = new ProductRepository(db);
  }

  async create(
    input: CreateProductInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Product> {
    const product = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.PRODUCT_CREATED,
      entityType: 'Product',
      entityId: product.id,
      after: { sku: input.sku, name: input.name },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.PRODUCT_CREATED,
      input.companyId,
      { productId: product.id, sku: input.sku, name: input.name },
      'products',
    );
    return product;
  }

  async getById(id: string): Promise<Product> {
    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  list(filters: {
    companyId: string;
    status?: ProductStatus;
    categoryId?: string;
  }): Promise<Product[]> {
    return this.repo.list(filters);
  }

  async update(
    id: string,
    data: UpdateProductInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Product> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, data);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.PRODUCT_UPDATED,
      entityType: 'Product',
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async archive(id: string, actorUserId: string, ipAddress?: string | null): Promise<Product> {
    const before = await this.getById(id);
    const updated = await this.repo.updateStatus(id, 'ARCHIVED');
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.PRODUCT_UPDATED,
      entityType: 'Product',
      entityId: id,
      after: { status: 'ARCHIVED' },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  /** Delegates approval resolution to the Rules Engine — never reimplemented here. */
  async requestApproval(
    productId: string,
    actorUserId: string,
    attributes: Record<string, unknown> = {},
  ): Promise<ApprovalRequest[]> {
    const product = await this.getById(productId);
    const { approvers } = await this.approvalEvaluator.evaluateApproval(
      product.companyId,
      'products',
      {
        ...attributes,
        productId,
        categoryId: product.categoryId,
      },
    );

    await this.repo.updateStatus(productId, 'PENDING_APPROVAL');

    if (approvers.length === 0) {
      await this.repo.updateStatus(productId, 'ACTIVE');
      return [];
    }

    return Promise.all(
      approvers.map((a) =>
        this.repo.createApproval({
          companyId: product.companyId,
          productId,
          approverRoleId: typeof a.approverRoleId === 'string' ? a.approverRoleId : undefined,
          approverUserId: typeof a.approverUserId === 'string' ? a.approverUserId : undefined,
        }),
      ),
    );
  }

  async decideApproval(
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    comment?: string,
    ipAddress?: string | null,
  ): Promise<ApprovalRequest> {
    const approval = await this.repo.findApproval(approvalId);
    if (!approval) throw new NotFoundException('Approval not found.');
    const updated = await this.repo.decideApproval(approvalId, decision, comment);
    const product = await this.getById(approval.entityId);

    if (decision === 'APPROVED') {
      await this.repo.updateStatus(approval.entityId, 'ACTIVE');
    } else {
      await this.repo.updateStatus(approval.entityId, 'DRAFT');
    }
    await this.audit.record({
      companyId: product.companyId,
      actorUserId,
      eventType: AuditEventType.PRODUCT_UPDATED,
      entityType: 'Product',
      entityId: approval.entityId,
      after: { status: decision === 'APPROVED' ? 'ACTIVE' : 'DRAFT' },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  // Categories — thin passthroughs, tenant-scoped via TenantScopedPrismaClient.

  async createCategory(companyId: string, name: string, parentId?: string): Promise<Category> {
    const category = await this.repo.createCategory(companyId, name, parentId);
    await this.audit.record({
      companyId,
      actorUserId: null,
      eventType: AuditEventType.CATEGORY_CREATED,
      entityType: 'Category',
      entityId: category.id,
      after: { name },
    });
    return category;
  }

  listCategories(companyId: string): Promise<Category[]> {
    return this.repo.listCategories(companyId);
  }

  // Dynamic (EAV) attributes.

  createAttribute(
    companyId: string,
    name: string,
    dataType: AttributeDataType,
    unit?: string,
  ): Promise<ProductAttribute> {
    return this.repo.createAttribute(companyId, name, dataType, unit);
  }

  listAttributes(companyId: string): Promise<ProductAttribute[]> {
    return this.repo.listAttributes(companyId);
  }

  async setAttributeValue(
    productId: string,
    attributeId: string,
    rawValue: string,
  ): Promise<ProductAttributeValue> {
    const attribute = await this.repo.findAttributeById(attributeId);
    if (!attribute) throw new NotFoundException('Attribute not found.');
    const cast = castAttributeValue(attribute, rawValue);
    return this.repo.setAttributeValue(productId, attributeId, cast.value, cast.valueNumber);
  }

  listAttributeValues(productId: string): Promise<ProductAttributeValue[]> {
    return this.repo.listAttributeValues(productId);
  }

  // Packaging.

  addPackaging(
    productId: string,
    packagingType: PackagingType,
    unitsPerPackage?: number,
    uom?: UnitOfMeasure,
  ): Promise<ProductPackaging> {
    return this.repo.addPackaging(productId, packagingType, unitsPerPackage, uom);
  }

  listPackaging(productId: string): Promise<ProductPackaging[]> {
    return this.repo.listPackaging(productId);
  }

  // Pricing.

  async upsertPriceListEntry(
    input: Parameters<ProductRepository['upsertPriceListEntry']>[0],
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PriceList> {
    const entry = await this.repo.upsertPriceListEntry(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.PRICE_CHANGED,
      entityType: 'Product',
      entityId: input.productId,
      after: { unitPrice: input.unitPrice, currency: input.currency },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.PRODUCT_PRICE_CHANGED,
      input.companyId,
      { productId: input.productId, unitPrice: input.unitPrice, currency: input.currency },
      'products',
    );
    return entry;
  }

  listPriceLists(companyId: string, productId?: string): Promise<PriceList[]> {
    return this.repo.listPriceLists(companyId, productId);
  }

  /** Never queried directly by other modules — this is the one published pricing seam. */
  async getEffectivePrice(
    companyId: string,
    productId: string,
    query: GetEffectivePriceQuery,
  ): Promise<{ unitPrice: number; currency: string; uom: string; marginPercent: number | null }> {
    const [product, priceLists] = await Promise.all([
      this.getById(productId),
      this.repo.listPriceLists(companyId, productId),
    ]);

    const entries: PriceListEntry[] = priceLists.map((p) => ({
      id: p.id,
      productId: p.productId,
      customerId: p.customerId,
      currency: p.currency,
      uom: p.uom,
      minQuantity: Number(p.minQuantity),
      unitPrice: Number(p.unitPrice),
      validFrom: p.validFrom,
      validTo: p.validTo,
    }));

    const resolved = resolvePrice(entries, query);
    if (!resolved) {
      throw new BadRequestException(
        `No price list entry found for product ${productId} in ${query.currency}.`,
      );
    }

    return {
      unitPrice: resolved.unitPrice,
      currency: resolved.currency,
      uom: resolved.uom,
      marginPercent: computeMargin(
        resolved.unitPrice,
        product.standardCost ? Number(product.standardCost) : null,
      ),
    };
  }
}
