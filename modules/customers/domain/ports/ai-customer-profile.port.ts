import { NotImplementedInPhaseError } from '@platform/core';

export interface CustomerProfileQuery {
  customerId: string;
}

export interface CustomerProfileInsight {
  summary: string;
  recommendedActions: string[];
}

/** See docs/DOMAIN_MODEL_PHASE4.md — no AI Customer Profile provider exists yet; a typed seam. */
export interface AiCustomerProfileProvider {
  analyze(query: CustomerProfileQuery): Promise<CustomerProfileInsight>;
}

export class NotImplementedAiCustomerProfileProvider implements AiCustomerProfileProvider {
  async analyze(): Promise<CustomerProfileInsight> {
    throw new NotImplementedInPhaseError('AI Customer Profile', 'Phase 6+');
  }
}
