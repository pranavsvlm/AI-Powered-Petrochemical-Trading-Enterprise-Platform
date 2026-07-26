import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type {
  TenantScopedPrismaClient,
  PurchaseRequisition,
  ApprovalRequest,
} from '@platform/database';
import { assertRequisitionTransition } from '../domain/requisition-lifecycle';
import {
  RequisitionRepository,
  type CreateRequisitionInput,
} from '../infrastructure/procurement.repository';

export interface RequisitionAuditWriter {
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

/** Published by @modules/products, satisfied by ProductService.getById — tenant-scoping validation. */
export interface ProductLookupPort {
  getById(productId: string): Promise<{ id: string }>;
}

/**
 * Published to @modules/procurement's own PurchaseOrderService, satisfied by
 * RequisitionService.getForPurchaseOrderCreation.
 */
export interface RequisitionLookupPort {
  getForPurchaseOrderCreation(requisitionId: string): Promise<{
    id: string;
    companyId: string;
    status: string;
    lineItems: Array<{
      productId: string;
      quantity: unknown;
      uom: string;
      estimatedUnitPrice: unknown;
    }>;
  }>;
  markConverted(requisitionId: string, actorUserId: string): Promise<void>;
}

/** Application-layer use cases for the PurchaseRequisition aggregate (doc 17): draft, submit, approval. */
@Injectable()
export class RequisitionService implements RequisitionLookupPort {
  private readonly logger = new Logger(RequisitionService.name);
  private readonly repo: RequisitionRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly audit: RequisitionAuditWriter,
    private readonly products: ProductLookupPort,
  ) {
    this.repo = new RequisitionRepository(db);
  }

  async create(
    input: CreateRequisitionInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PurchaseRequisition> {
    await Promise.all(input.lineItems.map((li) => this.products.getById(li.productId)));
    const requisition = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.REQUISITION_CREATED,
      entityType: 'PurchaseRequisition',
      entityId: requisition.id,
      after: { requisitionNumber: input.requisitionNumber },
      ipAddress: ipAddress ?? null,
    });
    return requisition;
  }

  async getById(id: string) {
    const requisition = await this.repo.findById(id);
    if (!requisition) throw new NotFoundException('Purchase requisition not found.');
    return requisition;
  }

  async getForPurchaseOrderCreation(requisitionId: string) {
    const requisition = await this.getById(requisitionId);
    if (requisition.status !== 'APPROVED') {
      throw new BadRequestException(
        'Requisition must be APPROVED before it can become a purchase order.',
      );
    }
    return requisition;
  }

  async markConverted(requisitionId: string, actorUserId: string): Promise<void> {
    const before = await this.getById(requisitionId);
    assertRequisitionTransition(before.status, 'CONVERTED');
    await this.repo.updateStatus(requisitionId, 'CONVERTED');
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.REQUISITION_APPROVED,
      entityType: 'PurchaseRequisition',
      entityId: requisitionId,
      after: { status: 'CONVERTED' },
    });
  }

  list(filters: {
    companyId: string;
    status?: PurchaseRequisition['status'];
  }): Promise<PurchaseRequisition[]> {
    return this.repo.list(filters);
  }

  /** Delegates approval resolution to the Rules Engine — never reimplemented here. */
  async submit(
    requisitionId: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<ApprovalRequest[]> {
    const before = await this.repo.findById(requisitionId);
    if (!before) throw new NotFoundException('Purchase requisition not found.');
    assertRequisitionTransition(before.status, 'SUBMITTED');
    await this.repo.updateStatus(requisitionId, 'SUBMITTED');

    const totalEstimated = before.lineItems.reduce(
      (sum, li) => sum + Number(li.quantity) * Number(li.estimatedUnitPrice ?? 0),
      0,
    );
    const { approvers } = await this.approvalEvaluator.evaluateApproval(
      before.companyId,
      'procurement',
      {
        requisitionId,
        poValue: totalEstimated,
      },
    );

    if (approvers.length === 0) {
      await this.repo.updateStatus(requisitionId, 'APPROVED');
      await this.audit.record({
        companyId: before.companyId,
        actorUserId,
        eventType: AuditEventType.REQUISITION_APPROVED,
        entityType: 'PurchaseRequisition',
        entityId: requisitionId,
        after: { status: 'APPROVED', autoApproved: true },
        ipAddress: ipAddress ?? null,
      });
      return [];
    }

    return Promise.all(
      approvers.map((a) =>
        this.repo.createApproval({
          companyId: before.companyId,
          requisitionId,
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
    const requisition = await this.getById(approval.entityId);

    const nextStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    assertRequisitionTransition(requisition.status, nextStatus);
    await this.repo.updateStatus(approval.entityId, nextStatus);
    await this.audit.record({
      companyId: requisition.companyId,
      actorUserId,
      eventType:
        decision === 'APPROVED'
          ? AuditEventType.REQUISITION_APPROVED
          : AuditEventType.REQUISITION_REJECTED,
      entityType: 'PurchaseRequisition',
      entityId: approval.entityId,
      after: { decision },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }
}
