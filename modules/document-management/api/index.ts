export { DocumentService } from '../application/document.service';
export type {
  DocumentAuditWriter,
  DocumentEventPublisher,
  ApprovalEvaluator,
  UploadDocumentInput,
  UploadDocumentResult,
} from '../application/document.service';
export { DocumentRepository } from '../infrastructure/document.repository';
export type {
  CreateDocumentInput,
  CreateVersionInput,
} from '../infrastructure/document.repository';
export { computeSha256 } from '../domain/document-hash';
export { computeRetentionExpiry, isPastRetention } from '../domain/retention';
export type { RetentionPolicy } from '../domain/retention';
