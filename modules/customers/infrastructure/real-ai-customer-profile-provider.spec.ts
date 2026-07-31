import {
  RealAiCustomerProfileProvider,
  AI_CUSTOMER_PROFILE_PROMPT_KEY,
} from './real-ai-customer-profile-provider';
import type { AiRouter, PromptTemplateService } from '@platform/ai';
import type { CustomerService } from '../application/customer.service';

describe('RealAiCustomerProfileProvider', () => {
  it('gathers the customer profile + recent activity, resolves the prompt, and parses the insight', async () => {
    const router = {
      chatComplete: jest.fn().mockResolvedValue({
        content: '{"summary":"Loyal customer","recommendedActions":["Offer volume discount"]}',
        toolCalls: [],
        promptTokens: 10,
        completionTokens: 5,
        provider: 'OLLAMA',
        model: 'llama3.2:1b',
      }),
    };
    const prompts = { resolve: jest.fn().mockResolvedValue('Analyze this customer.') };
    const customerService = {
      getById: jest.fn().mockResolvedValue({
        id: 'cust-1',
        companyId: 'company-1',
        legalName: 'Acme Corp',
        status: 'ACTIVE',
        customerType: 'DISTRIBUTOR',
        segment: 'enterprise',
        creditLimit: 50000,
        paymentTermsDays: 30,
        tags: ['vip'],
      }),
      listActivities: jest
        .fn()
        .mockResolvedValue([
          { type: 'CALL', body: 'Discussed renewal', createdAt: new Date('2026-01-01') },
        ]),
    };

    const provider = new RealAiCustomerProfileProvider(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
      customerService as unknown as CustomerService,
    );

    const result = await provider.analyze({ customerId: 'cust-1' });

    expect(customerService.getById).toHaveBeenCalledWith('cust-1');
    expect(customerService.listActivities).toHaveBeenCalledWith('cust-1');
    expect(prompts.resolve).toHaveBeenCalledWith(AI_CUSTOMER_PROFILE_PROMPT_KEY);
    expect(router.chatComplete).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'system', content: 'Analyze this customer.' }]),
      }),
      { purpose: 'customer_profile' },
    );
    expect(result).toEqual({
      summary: 'Loyal customer',
      recommendedActions: ['Offer volume discount'],
    });
  });
});
