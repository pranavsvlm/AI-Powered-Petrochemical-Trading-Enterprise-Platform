import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type {
  TenantScopedPrismaClient,
  Rfq,
  RfqLineItem,
  RfqStatus,
  UnitOfMeasure,
} from '@platform/database';
import { assertRfqTransition } from '../domain/rfq-lifecycle';
import { RfqRepository, type CreateRfqInput } from '../infrastructure/rfq.repository';

export interface RfqAuditWriter {
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

export interface RfqEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/**
 * Published by @modules/customers, satisfied at NestJS wiring time by CustomerService.getById
 * — already tenant-scoped (the Prisma tenant extension forces companyId into the lookup), so
 * calling it is what actually rejects a cross-tenant customerId, not a raw FK existence check.
 */
export interface CustomerLookupPort {
  getById(customerId: string): Promise<{ id: string }>;
}

/** Published by @modules/products, satisfied by ProductService.getById — same tenant-scoping reasoning. */
export interface ProductLookupPort {
  getById(productId: string): Promise<{ id: string }>;
}

/**
 * Application-layer use cases for the RFQ aggregate (doc 13). RFQ and Quotation are owned by
 * the same module because they share a tight 1:1 lifecycle — see docs/DOMAIN_MODEL_PHASE4.md.
 */
@Injectable()
export class RfqService {
  private readonly logger = new Logger(RfqService.name);
  private readonly repo: RfqRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly events: RfqEventPublisher,
    private readonly audit: RfqAuditWriter,
    private readonly customers: CustomerLookupPort,
    private readonly products: ProductLookupPort,
  ) {
    this.repo = new RfqRepository(db);
  }

  /**
   * customerId/productId are foreign keys, not tenant-scoped columns themselves — a raw insert
   * would happily create an RFQ against another company's Customer/Product since the FK
   * constraint only checks the row exists *somewhere*. Routing both through their owning
   * module's own tenant-scoped getById is what actually enforces the boundary.
   */
  async create(input: CreateRfqInput, ipAddress?: string | null): Promise<Rfq> {
    await this.customers.getById(input.customerId);
    await Promise.all(input.lineItems.map((line) => this.products.getById(line.productId)));

    const rfq = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.createdByUserId,
      eventType: AuditEventType.RFQ_CREATED,
      entityType: 'Rfq',
      entityId: rfq.id,
      after: { rfqNumber: input.rfqNumber, customerId: input.customerId },
      ipAddress: ipAddress ?? null,
    });
    return rfq;
  }

  async getById(id: string) {
    const rfq = await this.repo.findById(id);
    if (!rfq) throw new NotFoundException('RFQ not found.');
    return rfq;
  }

  list(filters: { companyId: string; status?: RfqStatus; customerId?: string }) {
    return this.repo.list(filters);
  }

  /** Formally logs the RFQ (whether drafted internally or received externally — doc 13 draws no distinction). */
  async submit(id: string): Promise<Rfq> {
    const rfq = await this.getById(id);
    assertRfqTransition(rfq.status, 'SUBMITTED');
    const updated = await this.repo.updateStatus(id, 'SUBMITTED');
    await this.events.publish(
      EVENT_TYPES.RFQ_RECEIVED,
      rfq.companyId,
      { rfqId: id, rfqNumber: rfq.rfqNumber, customerId: rfq.customerId },
      'quotations',
    );
    return updated;
  }

  /** Called internally by QuotationService.createFromRfq — not exposed on the REST surface. */
  async markQuoted(id: string): Promise<Rfq> {
    const rfq = await this.getById(id);
    assertRfqTransition(rfq.status, 'QUOTED');
    return this.repo.updateStatus(id, 'QUOTED');
  }

  async close(id: string): Promise<Rfq> {
    const rfq = await this.getById(id);
    assertRfqTransition(rfq.status, 'CLOSED');
    return this.repo.updateStatus(id, 'CLOSED');
  }

  async cancel(id: string): Promise<Rfq> {
    const rfq = await this.getById(id);
    assertRfqTransition(rfq.status, 'CANCELLED');
    return this.repo.updateStatus(id, 'CANCELLED');
  }

  async addLineItem(
    rfqId: string,
    input: { productId: string; quantity: number; uom: UnitOfMeasure; targetPrice?: number },
  ): Promise<RfqLineItem> {
    await this.products.getById(input.productId);
    return this.repo.addLineItem(rfqId, input);
  }

  removeLineItem(lineItemId: string): Promise<RfqLineItem> {
    return this.repo.removeLineItem(lineItemId);
  }
}
