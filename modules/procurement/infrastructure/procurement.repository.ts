import type {
  TenantScopedPrismaClient,
  Supplier,
  SupplierContact,
  SupplierStatus,
  PurchaseRequisition,
  PurchaseRequisitionItem,
  PurchaseRequisitionStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  GoodsReceipt,
  GoodsReceiptItem,
  GoodsReceiptStatus,
  UnitOfMeasure,
  InspectionResult,
  ApprovalRequest,
  ApprovalStatus,
} from '@platform/database';

export interface CreateSupplierInput {
  companyId: string;
  supplierCode: string;
  legalName: string;
  tradeName?: string;
  taxNumber?: string;
  country: string;
  city?: string;
  address?: string;
  currency: string;
  paymentTermsDays?: number;
}

export type UpdateSupplierInput = Partial<Omit<CreateSupplierInput, 'companyId' | 'supplierCode'>>;

const SUPPLIER_INCLUDE = { contacts: true } as const;
export type SupplierWithRelations = Supplier & { contacts: SupplierContact[] };

export class SupplierRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateSupplierInput): Promise<SupplierWithRelations> {
    return this.prisma.supplier.create({
      data: { ...input, status: 'PROSPECT' },
      include: SUPPLIER_INCLUDE,
    });
  }

  findById(id: string): Promise<SupplierWithRelations | null> {
    return this.prisma.supplier.findUnique({ where: { id }, include: SUPPLIER_INCLUDE });
  }

  list(filters: { companyId: string; status?: SupplierStatus }): Promise<SupplierWithRelations[]> {
    return this.prisma.supplier.findMany({
      where: { companyId: filters.companyId, status: filters.status },
      include: SUPPLIER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: UpdateSupplierInput): Promise<SupplierWithRelations> {
    return this.prisma.supplier.update({ where: { id }, data, include: SUPPLIER_INCLUDE });
  }

  updateStatus(id: string, status: SupplierStatus): Promise<Supplier> {
    return this.prisma.supplier.update({ where: { id }, data: { status } });
  }

  addContact(
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
    return this.prisma.supplierContact.create({ data: { supplierId, ...input } });
  }

  listContacts(supplierId: string): Promise<SupplierContact[]> {
    return this.prisma.supplierContact.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export interface RequisitionLineItemInput {
  productId: string;
  quantity: number;
  uom: UnitOfMeasure;
  estimatedUnitPrice?: number;
}

export interface CreateRequisitionInput {
  companyId: string;
  requisitionNumber: string;
  requestedByUserId: string;
  notes?: string;
  lineItems: RequisitionLineItemInput[];
}

const REQUISITION_INCLUDE = { lineItems: true } as const;
export type RequisitionWithLineItems = PurchaseRequisition & {
  lineItems: PurchaseRequisitionItem[];
};

export class RequisitionRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateRequisitionInput): Promise<RequisitionWithLineItems> {
    return this.prisma.purchaseRequisition.create({
      data: {
        companyId: input.companyId,
        requisitionNumber: input.requisitionNumber,
        requestedByUserId: input.requestedByUserId,
        notes: input.notes,
        status: 'DRAFT',
        lineItems: { create: input.lineItems },
      },
      include: REQUISITION_INCLUDE,
    });
  }

  findById(id: string): Promise<RequisitionWithLineItems | null> {
    return this.prisma.purchaseRequisition.findUnique({
      where: { id },
      include: REQUISITION_INCLUDE,
    });
  }

  list(filters: {
    companyId: string;
    status?: PurchaseRequisitionStatus;
  }): Promise<RequisitionWithLineItems[]> {
    return this.prisma.purchaseRequisition.findMany({
      where: { companyId: filters.companyId, status: filters.status },
      include: REQUISITION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: PurchaseRequisitionStatus): Promise<PurchaseRequisition> {
    return this.prisma.purchaseRequisition.update({ where: { id }, data: { status } });
  }

  createApproval(input: {
    companyId: string;
    requisitionId: string;
    approverRoleId?: string;
    approverUserId?: string;
  }): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'requisition',
        entityId: input.requisitionId,
        approverRoleId: input.approverRoleId,
        approverUserId: input.approverUserId,
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

export interface PurchaseOrderLineItemInput {
  productId: string;
  quantity: number;
  uom: UnitOfMeasure;
  unitPrice: number;
  lineTotal: number;
}

export interface CreatePurchaseOrderInput {
  companyId: string;
  poNumber: string;
  supplierId: string;
  requisitionId?: string;
  currency: string;
  createdByUserId: string;
  lineItems: PurchaseOrderLineItemInput[];
  subtotal: number;
  totalAmount: number;
}

const PO_INCLUDE = { lineItems: true } as const;
export type PurchaseOrderWithLineItems = PurchaseOrder & { lineItems: PurchaseOrderItem[] };

export class PurchaseOrderRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderWithLineItems> {
    return this.prisma.purchaseOrder.create({
      data: {
        companyId: input.companyId,
        poNumber: input.poNumber,
        supplierId: input.supplierId,
        requisitionId: input.requisitionId,
        currency: input.currency,
        createdByUserId: input.createdByUserId,
        status: 'DRAFT',
        subtotal: input.subtotal,
        totalAmount: input.totalAmount,
        lineItems: { create: input.lineItems },
      },
      include: PO_INCLUDE,
    });
  }

  findById(id: string): Promise<PurchaseOrderWithLineItems | null> {
    return this.prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
  }

  list(filters: {
    companyId: string;
    status?: PurchaseOrderStatus;
    supplierId?: string;
  }): Promise<PurchaseOrderWithLineItems[]> {
    return this.prisma.purchaseOrder.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        supplierId: filters.supplierId,
      },
      include: PO_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status } });
  }

  listLineItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]> {
    return this.prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
  }

  incrementLineReceivedQuantity(lineItemId: string, quantity: number): Promise<PurchaseOrderItem> {
    return this.prisma.purchaseOrderItem.update({
      where: { id: lineItemId },
      data: { receivedQuantity: { increment: quantity } },
    });
  }

  createApproval(input: {
    companyId: string;
    purchaseOrderId: string;
    approverRoleId?: string;
    approverUserId?: string;
  }): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'purchase_order',
        entityId: input.purchaseOrderId,
        approverRoleId: input.approverRoleId,
        approverUserId: input.approverUserId,
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

export interface GoodsReceiptLineItemInput {
  purchaseOrderItemId: string;
  quantityReceived: number;
  inspectionResult: InspectionResult;
  batchNumber?: string;
  expiryDate?: Date;
}

export interface CreateGoodsReceiptInput {
  companyId: string;
  receiptNumber: string;
  purchaseOrderId: string;
  warehouseId: string;
  receivedByUserId: string;
  lineItems: GoodsReceiptLineItemInput[];
}

const RECEIPT_INCLUDE = { lineItems: true } as const;
export type GoodsReceiptWithLineItems = GoodsReceipt & { lineItems: GoodsReceiptItem[] };

export class GoodsReceiptRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateGoodsReceiptInput): Promise<GoodsReceiptWithLineItems> {
    return this.prisma.goodsReceipt.create({
      data: {
        companyId: input.companyId,
        receiptNumber: input.receiptNumber,
        purchaseOrderId: input.purchaseOrderId,
        warehouseId: input.warehouseId,
        receivedByUserId: input.receivedByUserId,
        status: 'DRAFT',
        lineItems: { create: input.lineItems },
      },
      include: RECEIPT_INCLUDE,
    });
  }

  findById(id: string): Promise<GoodsReceiptWithLineItems | null> {
    return this.prisma.goodsReceipt.findUnique({ where: { id }, include: RECEIPT_INCLUDE });
  }

  list(filters: {
    companyId: string;
    purchaseOrderId?: string;
  }): Promise<GoodsReceiptWithLineItems[]> {
    return this.prisma.goodsReceipt.findMany({
      where: { companyId: filters.companyId, purchaseOrderId: filters.purchaseOrderId },
      include: RECEIPT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: GoodsReceiptStatus): Promise<GoodsReceipt> {
    return this.prisma.goodsReceipt.update({ where: { id }, data: { status } });
  }
}
