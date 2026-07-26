import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { TenantScopedPrismaClient, ChartOfAccount, AccountType } from '@platform/database';
import {
  ChartOfAccountRepository,
  type CreateChartOfAccountInput,
} from '../infrastructure/accounting.repository';

export interface ChartOfAccountsAuditWriter {
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
 * The default chart seeded for a new company — enough for InvoiceService (1100/4000) and
 * SupplierBillService (1200/2000) to post against without a dedicated account-setup flow.
 * See docs/DOMAIN_MODEL_PHASE5.md.
 */
export const DEFAULT_CHART_OF_ACCOUNTS: Array<{
  accountCode: string;
  name: string;
  accountType: AccountType;
}> = [
  { accountCode: '1000', name: 'Cash', accountType: 'ASSET' },
  { accountCode: '1100', name: 'Accounts Receivable', accountType: 'ASSET' },
  { accountCode: '1200', name: 'Inventory', accountType: 'ASSET' },
  { accountCode: '2000', name: 'Accounts Payable', accountType: 'LIABILITY' },
  { accountCode: '3000', name: 'Retained Earnings', accountType: 'EQUITY' },
  { accountCode: '4000', name: 'Sales Revenue', accountType: 'REVENUE' },
  { accountCode: '5000', name: 'Cost of Goods Sold', accountType: 'EXPENSE' },
];

/** Application-layer use cases for the ChartOfAccount aggregate (doc 14). */
@Injectable()
export class ChartOfAccountsService {
  private readonly logger = new Logger(ChartOfAccountsService.name);
  private readonly repo: ChartOfAccountRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: ChartOfAccountsAuditWriter,
  ) {
    this.repo = new ChartOfAccountRepository(db);
  }

  async create(
    input: CreateChartOfAccountInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<ChartOfAccount> {
    const account = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.CHART_OF_ACCOUNT_CREATED,
      entityType: 'ChartOfAccount',
      entityId: account.id,
      after: { accountCode: input.accountCode, name: input.name, accountType: input.accountType },
      ipAddress: ipAddress ?? null,
    });
    return account;
  }

  async getById(id: string): Promise<ChartOfAccount> {
    const account = await this.repo.findById(id);
    if (!account) throw new NotFoundException('Chart of account entry not found.');
    return account;
  }

  findByCode(companyId: string, accountCode: string): Promise<ChartOfAccount | null> {
    return this.repo.findByCode(companyId, accountCode);
  }

  list(companyId: string, accountType?: AccountType): Promise<ChartOfAccount[]> {
    return this.repo.list(companyId, accountType);
  }

  /** Idempotent — only creates the accounts from DEFAULT_CHART_OF_ACCOUNTS that don't already exist. */
  async seedDefaultChart(companyId: string, actorUserId: string): Promise<ChartOfAccount[]> {
    const created: ChartOfAccount[] = [];
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      const existing = await this.repo.findByCode(companyId, account.accountCode);
      if (!existing) {
        created.push(await this.create({ companyId, ...account }, actorUserId));
      }
    }
    return created;
  }
}
