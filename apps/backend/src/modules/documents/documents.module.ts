import { Module } from '@nestjs/common';
import { DocumentService } from '@modules/document-management';
import { getSharedStorage } from '@platform/storage';
import {
  SearchService,
  DocumentFullTextSearchService,
  NotImplementedVectorSearchProvider,
} from '@platform/search';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import {
  DocumentsController,
  DocumentFoldersController,
  DocumentCategoriesController,
  DocumentTagsController,
} from './documents.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

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
        const search = new SearchService(
          new DocumentFullTextSearchService(db),
          new NotImplementedVectorSearchProvider(),
        );
        const eventBus = new RedisStreamsEventBus();
        const ruleRepository = new RuleRepository(db);
        const ruleActionExecutor = new RuleActionExecutor({
          eventBus,
          aiDecisionProvider: new NotImplementedAiDecisionProvider(),
        });
        const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
          new LegacyApprovalRuleSource(db),
          new NativeRuleSource((companyId, module) =>
            ruleRepository.loadApplicable(companyId, module),
          ),
        ]);
        return new DocumentService(db, storage, search, approvalEvaluator, eventBus, audit);
      },
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [DocumentService],
})
export class DocumentsModule {}
