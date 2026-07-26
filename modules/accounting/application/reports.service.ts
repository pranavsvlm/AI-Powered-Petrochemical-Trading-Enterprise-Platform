import { Injectable } from '@nestjs/common';
import type { TenantScopedPrismaClient } from '@platform/database';
import { aggregateTrialBalance, type TrialBalanceReport } from '../domain/trial-balance';
import { computeProfitAndLoss, type ProfitAndLossReport } from '../domain/profit-and-loss';
import {
  ChartOfAccountRepository,
  JournalRepository,
} from '../infrastructure/accounting.repository';

/**
 * Read-side reports (doc 14): both are pure functions over ChartOfAccount + JournalLine,
 * composed here with a repository fetch — neither is itself a stored entity, so there is
 * nothing to keep in sync. See docs/DOMAIN_MODEL_PHASE5.md.
 */
@Injectable()
export class ReportsService {
  private readonly chartRepo: ChartOfAccountRepository;
  private readonly journalRepo: JournalRepository;

  constructor(private readonly db: TenantScopedPrismaClient) {
    this.chartRepo = new ChartOfAccountRepository(db);
    this.journalRepo = new JournalRepository(db);
  }

  async trialBalance(companyId: string): Promise<TrialBalanceReport> {
    const [accounts, lines] = await Promise.all([
      this.chartRepo.list(companyId),
      this.journalRepo.listLinesForCompany(companyId),
    ]);
    return aggregateTrialBalance(
      accounts.map((a) => ({
        id: a.id,
        accountCode: a.accountCode,
        name: a.name,
        accountType: a.accountType,
      })),
      lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
    );
  }

  async profitAndLoss(companyId: string): Promise<ProfitAndLossReport> {
    const trialBalance = await this.trialBalance(companyId);
    return computeProfitAndLoss(trialBalance);
  }
}
