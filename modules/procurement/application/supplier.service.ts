import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type {
  TenantScopedPrismaClient,
  Supplier,
  SupplierContact,
  SupplierStatus,
} from '@platform/database';
import { assertSupplierTransition } from '../domain/supplier-lifecycle';
import {
  SupplierRepository,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from '../infrastructure/procurement.repository';

export interface SupplierAuditWriter {
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

/**
 * Published to @modules/procurement's own PurchaseOrderService and to
 * @modules/accounting's SupplierBillService — satisfied by SupplierService.getById, the same
 * tenant-scoping-through-the-owning-module's-own-lookup pattern as Phase 4's
 * CustomerLookupPort/ProductLookupPort.
 */
export interface SupplierLookupPort {
  getById(supplierId: string): Promise<{ id: string; currency: string }>;
}

/** Application-layer use cases for the Supplier aggregate (doc 17): profile, contacts, status. */
@Injectable()
export class SupplierService implements SupplierLookupPort {
  private readonly logger = new Logger(SupplierService.name);
  private readonly repo: SupplierRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: SupplierAuditWriter,
  ) {
    this.repo = new SupplierRepository(db);
  }

  async create(
    input: CreateSupplierInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Supplier> {
    const supplier = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.SUPPLIER_CREATED,
      entityType: 'Supplier',
      entityId: supplier.id,
      after: { supplierCode: input.supplierCode, legalName: input.legalName },
      ipAddress: ipAddress ?? null,
    });
    return supplier;
  }

  async getById(id: string): Promise<Supplier> {
    const supplier = await this.repo.findById(id);
    if (!supplier) throw new NotFoundException('Supplier not found.');
    return supplier;
  }

  list(filters: { companyId: string; status?: SupplierStatus }): Promise<Supplier[]> {
    return this.repo.list(filters);
  }

  async update(
    id: string,
    data: UpdateSupplierInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Supplier> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, data);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.SUPPLIER_UPDATED,
      entityType: 'Supplier',
      entityId: id,
      before: { legalName: before.legalName },
      after: { legalName: updated.legalName },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async transitionStatus(
    id: string,
    to: SupplierStatus,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Supplier> {
    const before = await this.getById(id);
    assertSupplierTransition(before.status, to);
    const updated = await this.repo.updateStatus(id, to);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.SUPPLIER_UPDATED,
      entityType: 'Supplier',
      entityId: id,
      before: { status: before.status },
      after: { status: to },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async addContact(
    supplierId: string,
    input: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      isPrimary?: boolean;
    },
  ): Promise<SupplierContact> {
    await this.getById(supplierId);
    return this.repo.addContact(supplierId, input);
  }

  listContacts(supplierId: string): Promise<SupplierContact[]> {
    return this.repo.listContacts(supplierId);
  }
}
