import { PromptTemplateService, PromptTemplateNotFoundError } from './prompt-template.service';
import type {
  PromptTemplateRepository,
  PromptTemplateWithLatestVersion,
} from '../infrastructure/prompt-template.repository';

function makeTemplate(content: string): PromptTemplateWithLatestVersion {
  return {
    id: 'tpl-1',
    companyId: 'company-1',
    key: 'sales-agent.system-prompt',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: 'v1',
        promptTemplateId: 'tpl-1',
        version: 1,
        content,
        publishedAt: new Date(),
        createdAt: new Date(),
      },
    ],
  } as PromptTemplateWithLatestVersion;
}

describe('PromptTemplateService.resolve', () => {
  it('prefers a company override over the platform default', async () => {
    const repo: jest.Mocked<
      Pick<PromptTemplateRepository, 'findActiveByKey' | 'findPlatformDefaultByKey'>
    > = {
      findActiveByKey: jest
        .fn()
        .mockResolvedValue(makeTemplate('Hello {{name}}, company edition.')),
      findPlatformDefaultByKey: jest
        .fn()
        .mockResolvedValue(makeTemplate('Hello {{name}}, default edition.')),
    };

    const service = new PromptTemplateService(repo as unknown as PromptTemplateRepository);
    const result = await service.resolve('sales-agent.system-prompt', { name: 'Ana' });

    expect(result).toBe('Hello Ana, company edition.');
    expect(repo.findPlatformDefaultByKey).not.toHaveBeenCalled();
  });

  it('falls back to the platform default when the company has no override', async () => {
    const repo: jest.Mocked<
      Pick<PromptTemplateRepository, 'findActiveByKey' | 'findPlatformDefaultByKey'>
    > = {
      findActiveByKey: jest.fn().mockResolvedValue(null),
      findPlatformDefaultByKey: jest
        .fn()
        .mockResolvedValue(makeTemplate('Hello {{name}}, default edition.')),
    };

    const service = new PromptTemplateService(repo as unknown as PromptTemplateRepository);
    const result = await service.resolve('sales-agent.system-prompt', { name: 'Ana' });

    expect(result).toBe('Hello Ana, default edition.');
  });

  it('throws PromptTemplateNotFoundError when neither a company override nor a platform default exists', async () => {
    const repo: jest.Mocked<
      Pick<PromptTemplateRepository, 'findActiveByKey' | 'findPlatformDefaultByKey'>
    > = {
      findActiveByKey: jest.fn().mockResolvedValue(null),
      findPlatformDefaultByKey: jest.fn().mockResolvedValue(null),
    };

    const service = new PromptTemplateService(repo as unknown as PromptTemplateRepository);
    await expect(service.resolve('unknown.key')).rejects.toThrow(PromptTemplateNotFoundError);
  });
});
