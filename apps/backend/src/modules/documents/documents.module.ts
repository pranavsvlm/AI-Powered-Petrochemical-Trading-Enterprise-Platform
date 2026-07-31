import { Module } from '@nestjs/common';
import { DocumentService } from '@modules/document-management';
import { getSharedStorage } from '@platform/storage';
import {
  SearchService,
  DocumentFullTextSearchService,
  PgVectorSearchProvider,
} from '@platform/search';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider, RealOcrProvider } from '@platform/ai';
import {
  DocumentsController,
  DocumentFoldersController,
  DocumentCategoriesController,
  DocumentTagsController,
} from './documents.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildAiRouter, buildPromptTemplateService } from '../../common/ai/ai-factory';

@Module({
  controllers: [
    DocumentsController,
    DocumentFoldersController,
    DocumentCategoriesController,
    DocumentTagsController,
  ],
  providers: [
    AuditService,
    {
      provide: DocumentService,
      useFactory: (prisma: PrismaService, audit: AuditService) => {
        const db = prisma.client;
        const storage = getSharedStorage();
        const aiRouter = buildAiRouter(db);
        const prompts = buildPromptTemplateService(db);
        const search = new SearchService(
          new DocumentFullTextSearchService(db),
          new PgVectorSearchProvider(db, aiRouter),
        );
        const eventBus = new RedisStreamsEventBus();
        const ruleRepository = new RuleRepository(db);
        const ruleActionExecutor = new RuleActionExecutor({
          eventBus,
          aiDecisionProvider: new RealAiDecisionProvider(aiRouter, prompts),
        });
        const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
          new LegacyApprovalRuleSource(db),
          new NativeRuleSource((companyId, module) =>
            ruleRepository.loadApplicable(companyId, module),
          ),
        ]);
        const ocrProvider = new RealOcrProvider(aiRouter, prompts);
        return new DocumentService(
          db,
          storage,
          search,
          approvalEvaluator,
          eventBus,
          audit,
          ocrProvider,
        );
      },
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [DocumentService],
})
export class DocumentsModule {}
