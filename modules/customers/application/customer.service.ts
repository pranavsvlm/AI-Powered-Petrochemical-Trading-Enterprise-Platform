import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type {
  TenantScopedPrismaClient,
  Customer,
  Contact,
  CustomerActivity,
  CustomerStatus,
  ActivityType,
  ApprovalRequest,
} from '@platform/database';
import { assertCustomerTransition } from '../domain/customer-lifecycle';
import { isWithinCreditLimit } from '../domain/credit';
import {
  CustomerRepository,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from '../infrastructure/customer.repository';

export interface CustomerAuditWriter {
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

/** Read-side twin of CustomerAuditWriter — backs getTimeline() with no separate timeline table. */
export interface CustomerAuditReader {
  listForEntity(
    companyId: string,
    entityType: string,
    entityId: string,
  ): Promise<
    Array<{
      eventType: string;
      actorUserId: string | null;
      before: unknown;
      after: unknown;
      createdAt: Date;
    }>
  >;
}

export interface CustomerEventPublisher {
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
 * Application-layer use cases for the Customer aggregate (doc 11): profile, contacts, credit
 * terms, segmentation, activities, and an audit-log-backed timeline. Approval is delegated to
 * the Rules Engine, never reimplemented here — see docs/DOMAIN_MODEL_PHASE3.md §6 and
 * docs/DOMAIN_MODEL_PHASE4.md.
 */
@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);
  private readonly repo: CustomerRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly events: CustomerEventPublisher,
    private readonly audit: CustomerAuditWriter,
    private readonly auditReader: CustomerAuditReader,
  ) {
    this.repo = new CustomerRepository(db);
  }

  async create(
    input: CreateCustomerInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Customer> {
    const customer = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.CUSTOMER_CREATED,
      entityType: 'Customer',
      entityId: customer.id,
      after: { customerCode: input.customerCode, legalName: input.legalName },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.CUSTOMER_CREATED,
      input.companyId,
      { customerId: customer.id, customerCode: input.customerCode },
      'customers',
    );
    return customer;
  }

  /**
   * Simplified credit check — a real "outstanding balance" would net out unpaid Invoices via
   * modules/accounting, a cross-module dependency deliberately not added for this one field
   * (see docs/DOMAIN_MODEL_PHASE6.md §14 for what's out of scope). Treats outstanding balance
   * as zero for now; the pure `isWithinCreditLimit` check itself is real.
   */
  async checkCredit(
    customerId: string,
    proposedOrderTotal: number,
  ): Promise<{ withinLimit: boolean; creditLimit: number | null }> {
    const customer = await this.getById(customerId);
    const creditLimit = customer.creditLimit == null ? null : Number(customer.creditLimit);
    const withinLimit = isWithinCreditLimit({
      creditLimit,
      outstandingBalance: 0,
      proposedOrderTotal,
    });
    return { withinLimit, creditLimit };
  }

  async getById(id: string): Promise<Customer> {
    const customer = await this.repo.findById(id);
    if (!customer) throw new NotFoundException('Customer not found.');
    return customer;
  }

  list(filters: { companyId: string; status?: CustomerStatus }): Promise<Customer[]> {
    return this.repo.list(filters);
  }

  async update(
    id: string,
    data: UpdateCustomerInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Customer> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, data);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.CUSTOMER_UPDATED,
      entityType: 'Customer',
      entityId: id,
      before: { legalName: before.legalName },
      after: { legalName: updated.legalName },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.CUSTOMER_UPDATED,
      before.companyId,
      { customerId: id },
      'customers',
    );
    return updated;
  }

  async transitionStatus(
    id: string,
    to: CustomerStatus,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Customer> {
    const before = await this.getById(id);
    assertCustomerTransition(before.status, to);
    const updated = await this.repo.updateStatus(id, to);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.CUSTOMER_UPDATED,
      entityType: 'Customer',
      entityId: id,
      before: { status: before.status },
      after: { status: to },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async archive(id: string, actorUserId: string, ipAddress?: string | null): Promise<Customer> {
    const before = await this.getById(id);
    assertCustomerTransition(before.status, 'ARCHIVED');
    const updated = await this.repo.updateStatus(id, 'ARCHIVED');
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.CUSTOMER_ARCHIVED,
      entityType: 'Customer',
      entityId: id,
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  /** Delegates approval resolution to the Rules Engine — never reimplemented here. */
  async requestApproval(
    customerId: string,
    actorUserId: string,
    attributes: Record<string, unknown> = {},
  ): Promise<ApprovalRequest[]> {
    const customer = await this.getById(customerId);
    assertCustomerTransition(customer.status, 'PENDING_APPROVAL');
    const { approvers } = await this.approvalEvaluator.evaluateApproval(
      customer.companyId,
      'customers',
      { ...attributes, customerId, customerType: customer.customerType, segment: customer.segment },
    );

    await this.repo.updateStatus(customerId, 'PENDING_APPROVAL');

    if (approvers.length === 0) {
      await this.repo.updateStatus(customerId, 'ACTIVE');
      return [];
    }

    return Promise.all(
      approvers.map((a) =>
        this.repo.createApproval({
          companyId: customer.companyId,
          customerId,
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
    const customer = await this.getById(approval.entityId);

    await this.repo.updateStatus(
      approval.entityId,
      decision === 'APPROVED' ? 'ACTIVE' : 'QUALIFIED_LEAD',
    );
    await this.audit.record({
      companyId: customer.companyId,
      actorUserId,
      eventType: AuditEventType.CUSTOMER_UPDATED,
      entityType: 'Customer',
      entityId: approval.entityId,
      after: { status: decision === 'APPROVED' ? 'ACTIVE' : 'QUALIFIED_LEAD' },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  // Contacts.

  async addContact(
    customerId: string,
    input: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      isPrimary?: boolean;
    },
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Contact> {
    const customer = await this.getById(customerId);
    const contact = await this.repo.addContact(customerId, input);
    await this.audit.record({
      companyId: customer.companyId,
      actorUserId,
      eventType: AuditEventType.CONTACT_ADDED,
      entityType: 'Customer',
      entityId: customerId,
      after: { contactId: contact.id, firstName: input.firstName, lastName: input.lastName },
      ipAddress: ipAddress ?? null,
    });
    return contact;
  }

  listContacts(customerId: string): Promise<Contact[]> {
    return this.repo.listContacts(customerId);
  }

  setPrimaryContact(customerId: string, contactId: string): Promise<Contact> {
    return this.repo.setPrimaryContact(customerId, contactId);
  }

  // Activities.

  addActivity(
    customerId: string,
    type: ActivityType,
    body: string,
    authorUserId: string,
  ): Promise<CustomerActivity> {
    return this.repo.addActivity(customerId, type, body, authorUserId);
  }

  listActivities(customerId: string): Promise<CustomerActivity[]> {
    return this.repo.listActivities(customerId);
  }

  // Timeline — read-only projection over AuditLog; see CustomerAuditReader.

  async getTimeline(customerId: string) {
    const customer = await this.getById(customerId);
    return this.auditReader.listForEntity(customer.companyId, 'Customer', customerId);
  }
}
