import type { TenantScopedPrismaClient } from '@platform/database';
import {
  AiProviderConfigRepository,
  AiRouter,
  AiUsageRepository,
  PromptTemplateRepository,
  PromptTemplateService,
} from '@platform/ai';

/**
 * Builds the two generic engines every AI seam wiring site needs — pure infrastructure
 * composition (no business logic), so it's shared rather than re-duplicated at each of the
 * ~14 module wiring sites the way business-specific lookup ports are (those genuinely differ
 * per module; this never does). See docs/DOMAIN_MODEL_PHASE6.md §9.
 */
export function buildAiRouter(db: TenantScopedPrismaClient): AiRouter {
  return new AiRouter({
    providerConfigRepo: new AiProviderConfigRepository(db),
    usageRepo: new AiUsageRepository(db),
  });
}

export function buildPromptTemplateService(db: TenantScopedPrismaClient): PromptTemplateService {
  return new PromptTemplateService(new PromptTemplateRepository(db));
}
