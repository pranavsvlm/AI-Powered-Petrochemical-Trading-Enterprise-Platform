import type { AiRouter, PromptTemplateService } from '@platform/ai';
import { parseJsonResponse } from '@platform/ai';
import type { CustomerService } from '../application/customer.service';
import type {
  AiCustomerProfileProvider,
  CustomerProfileInsight,
  CustomerProfileQuery,
} from '../domain/ports/ai-customer-profile.port';

export const AI_CUSTOMER_PROFILE_PROMPT_KEY = 'customers.ai-profile-analysis';

/**
 * Real implementation of the AI Customer Profile seam (doc 11) — see
 * docs/DOMAIN_MODEL_PHASE6.md §9. Lives inside modules/customers rather than packages/ai
 * because it needs to read this module's own Customer/CustomerActivity data, and packages/*
 * must never depend on modules/* (see packages/search's document-fulltext-search.service.ts
 * comment for the same rule stated in an already-shipped file). `packages/ai`'s AiRouter and
 * PromptTemplateService are the only cross-package dependencies — the normal, allowed
 * direction (modules depend on packages).
 */
export class RealAiCustomerProfileProvider implements AiCustomerProfileProvider {
  constructor(
    private readonly router: AiRouter,
    private readonly prompts: PromptTemplateService,
    private readonly customerService: CustomerService,
  ) {}

  async analyze(query: CustomerProfileQuery): Promise<CustomerProfileInsight> {
    const customer = await this.customerService.getById(query.customerId);
    const activities = await this.customerService.listActivities(query.customerId);

    const systemPrompt = await this.prompts.resolve(AI_CUSTOMER_PROFILE_PROMPT_KEY);
    const result = await this.router.chatComplete(
      customer.companyId,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              profile: {
                legalName: customer.legalName,
                status: customer.status,
                customerType: customer.customerType,
                segment: customer.segment,
                creditLimit: customer.creditLimit,
                paymentTermsDays: customer.paymentTermsDays,
                tags: customer.tags,
              },
              recentActivity: activities
                .slice(0, 20)
                .map((a) => ({ type: a.type, body: a.body, occurredAt: a.createdAt })),
            }),
          },
        ],
      },
      { purpose: 'customer_profile' },
    );

    return parseJsonResponse<CustomerProfileInsight>(result.content, 'AI Customer Profile');
  }
}
