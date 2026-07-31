import { interpolatePrompt } from '../domain/prompt-resolution';
import type { PromptTemplateRepository } from '../infrastructure/prompt-template.repository';

export class PromptTemplateNotFoundError extends Error {
  constructor(key: string) {
    super(
      `No active PromptTemplate found for key "${key}" (neither a company override nor a platform default).`,
    );
    this.name = 'PromptTemplateNotFoundError';
  }
}

/**
 * Resolves a prompt template by key: a company's own override (if it has published one) wins,
 * otherwise the platform-wide default (companyId: null, seeded separately — see
 * PromptTemplateRepository) is used. Company customization is zero-code — creating a
 * same-`key` PromptTemplate row via `publish()` is the entire override mechanism.
 */
export class PromptTemplateService {
  constructor(private readonly repo: PromptTemplateRepository) {}

  async resolve(key: string, vars: Record<string, string> = {}): Promise<string> {
    const companyTemplate = await this.repo.findActiveByKey(key);
    const template = companyTemplate ?? (await this.repo.findPlatformDefaultByKey(key));
    const latestVersion = template?.versions[0];
    if (!template || !latestVersion) {
      throw new PromptTemplateNotFoundError(key);
    }
    return interpolatePrompt(latestVersion.content, vars);
  }

  publish(key: string, content: string) {
    return this.repo.publish(key, content);
  }
}
