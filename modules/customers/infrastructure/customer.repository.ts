import type {
  TenantScopedPrismaClient,
  Customer,
  Contact,
  CustomerActivity,
  CustomerStatus,
  ActivityType,
  ApprovalRequest,
  ApprovalStatus,
} from '@platform/database';

export interface CreateCustomerInput {
  companyId: string;
  customerCode: string;
  legalName: string;
  tradeName?: string;
  taxNumber?: string;
  country: string;
  city?: string;
  address?: string;
  currency: string;
  language?: string;
  industry?: string;
  website?: string;
  customerType?: Customer['customerType'];
  segment?: string;
  tags?: string[];
  creditLimit?: number;
  paymentTermsDays?: number;
}

export interface UpdateCustomerInput {
  legalName?: string;
  tradeName?: string;
  taxNumber?: string;
  city?: string;
  address?: string;
  industry?: string;
  website?: string;
  customerType?: Customer['customerType'];
  segment?: string;
  tags?: string[];
  creditLimit?: number;
  paymentTermsDays?: number;
}

const CUSTOMER_INCLUDE = { contacts: true } as const;

export type CustomerWithRelations = Customer & { contacts: Contact[] };

export class CustomerRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateCustomerInput): Promise<CustomerWithRelations> {
    return this.prisma.customer.create({
      data: { ...input, status: 'PROSPECT' },
      include: CUSTOMER_INCLUDE,
    });
  }

  findById(id: string): Promise<CustomerWithRelations | null> {
    return this.prisma.customer.findUnique({ where: { id }, include: CUSTOMER_INCLUDE });
  }

  list(filters: { companyId: string; status?: CustomerStatus }): Promise<CustomerWithRelations[]> {
    return this.prisma.customer.findMany({
      where: { companyId: filters.companyId, status: filters.status },
      include: CUSTOMER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: UpdateCustomerInput): Promise<CustomerWithRelations> {
    return this.prisma.customer.update({ where: { id }, data, include: CUSTOMER_INCLUDE });
  }

  updateStatus(id: string, status: CustomerStatus): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data: { status } });
  }

  addContact(
    customerId: string,
    input: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      isPrimary?: boolean;
    },
  ): Promise<Contact> {
    return this.prisma.contact.create({ data: { customerId, ...input } });
  }

  listContacts(customerId: string): Promise<Contact[]> {
    return this.prisma.contact.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
  }

  async setPrimaryContact(customerId: string, contactId: string): Promise<Contact> {
    await this.prisma.contact.updateMany({ where: { customerId }, data: { isPrimary: false } });
    return this.prisma.contact.update({ where: { id: contactId }, data: { isPrimary: true } });
  }

  addActivity(
    customerId: string,
    type: ActivityType,
    body: string,
    authorUserId: string,
  ): Promise<CustomerActivity> {
    return this.prisma.customerActivity.create({ data: { customerId, type, body, authorUserId } });
  }

  listActivities(customerId: string): Promise<CustomerActivity[]> {
    return this.prisma.customerActivity.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createApproval(input: {
    companyId: string;
    customerId: string;
    ruleExecutionId?: string;
    approverUserId?: string;
    approverRoleId?: string;
  }): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'customer',
        entityId: input.customerId,
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
