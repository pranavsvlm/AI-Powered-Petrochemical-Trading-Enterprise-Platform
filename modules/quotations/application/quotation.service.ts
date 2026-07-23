import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type {
  TenantScopedPrismaClient,
  Quotation,
  QuotationStatus,
  UnitOfMeasure,
  ApprovalRequest,
} from '@platform/database';
import { assertQuotationTransition } from '../domain/quotation-lifecycle';
import {
  computeLineTotal,
  computeVersionTotals,
  computeWeightedMarginPercent,
} from '../domain/quotation-totals';
import {
  QuotationRepository,
  type QuotationLineItemInput,
} from '../infrastructure/quotation.repository';
import { RfqService, type CustomerLookupPort } from './rfq.service';

export interface QuotationAuditWriter {
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

export interface QuotationEventPublisher {
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

/**
 * Published by @modules/products, satisfied at NestJS wiring time by
 * ProductService.getEffectivePrice — never queried directly against products' tables.
 */
export interface PricingLookupPort {
  getEffectivePrice(
    companyId: string,
    productId: string,
    query: { customerId?: string; quantity: number; currency: string },
  ): Promise<{ unitPrice: number; currency: string; uom: string; marginPercent: number | null }>;
}

export interface QuotationLineInput {
  productId: string;
  quantity: number;
  discountPercent?: number;
}

export interface CreateQuotationFromRfqInput {
  quotationNumber: string;
  rfqId: string;
  lineItems: QuotationLineInput[];
  validUntil?: Date;
}

export interface CreateQuotationDirectInput {
  quotationNumber: string;
  customerId: string;
  currency: string;
  lineItems: QuotationLineInput[];
  validUntil?: Date;
}

/**
 * Application-layer use cases for the Quotation aggregate (doc 13): versioned pricing,
 * negotiation, and the one explicit approval gate (Negotiation -> Approval -> Sales Order),
 * delegated to the Rules Engine — never reimplemented here. See
 * docs/DOMAIN_MODEL_PHASE3.md §6 and docs/DOMAIN_MODEL_PHASE4.md.
 */
@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);
  private readonly repo: QuotationRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly events: QuotationEventPublisher,
    private readonly audit: QuotationAuditWriter,
    private readonly pricing: PricingLookupPort,
    private readonly rfqs: RfqService,
    private readonly customers: CustomerLookupPort,
  ) {
    this.repo = new QuotationRepository(db);
  }

  private async resolveLineItems(
    companyId: string,
    customerId: string,
    currency: string,
    lines: QuotationLineInput[],
  ): Promise<Array<QuotationLineItemInput & { marginPercent: number | null }>> {
    return Promise.all(
      lines.map(async (line) => {
        const price = await this.pricing.getEffectivePrice(companyId, line.productId, {
          customerId,
          quantity: line.quantity,
          currency,
        });
        return {
          productId: line.productId,
          quantity: line.quantity,
          uom: price.uom as UnitOfMeasure,
          unitPrice: price.unitPrice,
          discountPercent: line.discountPercent ?? 0,
          lineTotal: computeLineTotal({
            quantity: line.quantity,
            unitPrice: price.unitPrice,
            discountPercent: line.discountPercent,
          }),
          marginPercent: price.marginPercent,
        };
      }),
    );
  }

  async createFromRfq(
    companyId: string,
    input: CreateQuotationFromRfqInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Quotation> {
    const rfq = await this.rfqs.getById(input.rfqId);
    const resolved = await this.resolveLineItems(
      companyId,
      rfq.customerId,
      rfq.currency,
      input.lineItems,
    );
    const totals = computeVersionTotals(resolved);
    const marginPercent = computeWeightedMarginPercent(resolved);
    const lineItems: QuotationLineItemInput[] = resolved.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      uom: line.uom,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      lineTotal: line.lineTotal,
    }));

    const quotation = await this.repo.create({
      companyId,
      quotationNumber: input.quotationNumber,
      rfqId: input.rfqId,
      customerId: rfq.customerId,
      currency: rfq.currency,
      validUntil: input.validUntil,
      createdByUserId: actorUserId,
      lineItems,
      totals: { ...totals, marginPercent },
    });
    await this.rfqs.markQuoted(input.rfqId);

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.QUOTATION_GENERATED,
      entityType: 'Quotation',
      entityId: quotation.id,
      after: { quotationNumber: input.quotationNumber, totalAmount: totals.totalAmount },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.QUOTATION_GENERATED,
      companyId,
      { quotationId: quotation.id, rfqId: input.rfqId, totalAmount: totals.totalAmount },
      'quotations',
    );
    return quotation;
  }

  async createDirect(
    companyId: string,
    input: CreateQuotationDirectInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Quotation> {
    await this.customers.getById(input.customerId);
    const resolved = await this.resolveLineItems(
      companyId,
      input.customerId,
      input.currency,
      input.lineItems,
    );
    const totals = computeVersionTotals(resolved);
    const marginPercent = computeWeightedMarginPercent(resolved);
    const lineItems: QuotationLineItemInput[] = resolved.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      uom: line.uom,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      lineTotal: line.lineTotal,
    }));

    const quotation = await this.repo.create({
      companyId,
      quotationNumber: input.quotationNumber,
      customerId: input.customerId,
      currency: input.currency,
      validUntil: input.validUntil,
      createdByUserId: actorUserId,
      lineItems,
      totals: { ...totals, marginPercent },
    });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.QUOTATION_GENERATED,
      entityType: 'Quotation',
      entityId: quotation.id,
      after: { quotationNumber: input.quotationNumber, totalAmount: totals.totalAmount },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.QUOTATION_GENERATED,
      companyId,
      { quotationId: quotation.id, totalAmount: totals.totalAmount },
      'quotations',
    );
    return quotation;
  }

  async getById(id: string) {
    const quotation = await this.repo.findById(id);
    if (!quotation) throw new NotFoundException('Quotation not found.');
    return quotation;
  }

  /** Called by OrderService.createFromQuotation through QuotationLookupPort — not exposed on the REST surface. */
  async getForOrderCreation(id: string) {
    return this.getById(id);
  }

  list(filters: { companyId: string; status?: QuotationStatus; customerId?: string }) {
    return this.repo.list(filters);
  }

  async send(id: string, actorUserId: string, ipAddress?: string | null): Promise<Quotation> {
    const before = await this.getById(id);
    assertQuotationTransition(before.status, 'SENT');
    const updated = await this.repo.updateStatus(id, 'SENT');
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.QUOTATION_GENERATED,
      entityType: 'Quotation',
      entityId: id,
      after: { status: 'SENT' },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.QUOTATION_SENT,
      before.companyId,
      { quotationId: id },
      'quotations',
    );
    return updated;
  }

  async negotiate(id: string): Promise<Quotation> {
    const before = await this.getById(id);
    assertQuotationTransition(before.status, 'NEGOTIATING');
    return this.repo.updateStatus(id, 'NEGOTIATING');
  }

  /** Sales-entered price override during negotiation — records a new immutable version, never mutates history. */
  async reviseVersion(
    id: string,
    lineItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discountPercent?: number;
      uom: UnitOfMeasure;
    }>,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Quotation> {
    const before = await this.getById(id);
    const resolved: QuotationLineItemInput[] = lineItems.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      uom: line.uom,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent ?? 0,
      lineTotal: computeLineTotal(line),
    }));
    const totals = computeVersionTotals(resolved);
    const nextVersion = before.currentVersionNumber + 1;

    await this.repo.addVersion(id, nextVersion, totals, resolved, actorUserId);

    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.PRICE_OVERRIDDEN,
      entityType: 'Quotation',
      entityId: id,
      before: {
        versionNumber: before.currentVersionNumber,
        totalAmount: Number(before.totalAmount),
      },
      after: { versionNumber: nextVersion, totalAmount: totals.totalAmount },
      ipAddress: ipAddress ?? null,
    });
    return this.getById(id);
  }

  /** Delegates approval resolution to the Rules Engine — never reimplemented here. */
  async requestApproval(
    quotationId: string,
    actorUserId: string,
    attributes: Record<string, unknown> = {},
  ): Promise<ApprovalRequest[]> {
    const quotation = await this.getById(quotationId);
    assertQuotationTransition(quotation.status, 'PENDING_APPROVAL');
    const { approvers } = await this.approvalEvaluator.evaluateApproval(
      quotation.companyId,
      'quotations',
      {
        ...attributes,
        quotationId,
        orderValue: Number(quotation.totalAmount),
        currency: quotation.currency,
        marginPercent: quotation.marginPercent ? Number(quotation.marginPercent) : undefined,
      },
    );

    await this.repo.updateStatus(quotationId, 'PENDING_APPROVAL');

    if (approvers.length === 0) {
      await this.repo.updateStatus(quotationId, 'APPROVED');
      await this.audit.record({
        companyId: quotation.companyId,
        actorUserId,
        eventType: AuditEventType.QUOTATION_APPROVED,
        entityType: 'Quotation',
        entityId: quotationId,
      });
      await this.events.publish(
        EVENT_TYPES.QUOTATION_APPROVED,
        quotation.companyId,
        { quotationId },
        'quotations',
      );
      return [];
    }

    return Promise.all(
      approvers.map((a) =>
        this.repo.createApproval({
          companyId: quotation.companyId,
          quotationId,
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
    const quotation = await this.getById(approval.entityId);

    if (decision === 'APPROVED') {
      await this.repo.updateStatus(approval.entityId, 'APPROVED');
      await this.audit.record({
        companyId: quotation.companyId,
        actorUserId,
        eventType: AuditEventType.QUOTATION_APPROVED,
        entityType: 'Quotation',
        entityId: approval.entityId,
        ipAddress: ipAddress ?? null,
      });
      await this.events.publish(
        EVENT_TYPES.QUOTATION_APPROVED,
        quotation.companyId,
        { quotationId: approval.entityId },
        'quotations',
      );
    } else {
      // Rejection reopens straight to NEGOTIATING — no separate REJECTED quotation status.
      await this.repo.updateStatus(approval.entityId, 'NEGOTIATING');
      await this.audit.record({
        companyId: quotation.companyId,
        actorUserId,
        eventType: AuditEventType.QUOTATION_REJECTED,
        entityType: 'Quotation',
        entityId: approval.entityId,
        ipAddress: ipAddress ?? null,
      });
      await this.events.publish(
        EVENT_TYPES.QUOTATION_REJECTED,
        quotation.companyId,
        { quotationId: approval.entityId },
        'quotations',
      );
    }
    return updated;
  }

  async convertToOrder(id: string, actorUserId: string): Promise<Quotation> {
    const before = await this.getById(id);
    assertQuotationTransition(before.status, 'CONVERTED');
    const updated = await this.repo.updateStatus(id, 'CONVERTED');
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.QUOTATION_CONVERTED,
      entityType: 'Quotation',
      entityId: id,
    });
    return updated;
  }

  async cancel(id: string): Promise<Quotation> {
    const before = await this.getById(id);
    assertQuotationTransition(before.status, 'CANCELLED');
    return this.repo.updateStatus(id, 'CANCELLED');
  }
}
