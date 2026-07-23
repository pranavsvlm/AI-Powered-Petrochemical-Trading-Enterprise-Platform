export { RfqService } from '../application/rfq.service';
export type {
  RfqAuditWriter,
  RfqEventPublisher,
  CustomerLookupPort,
  ProductLookupPort,
} from '../application/rfq.service';
export { RfqRepository } from '../infrastructure/rfq.repository';
export type { CreateRfqInput } from '../infrastructure/rfq.repository';
export { canTransitionRfq, assertRfqTransition } from '../domain/rfq-lifecycle';
export type { RfqStatus } from '../domain/rfq-lifecycle';

export { QuotationService } from '../application/quotation.service';
export type {
  QuotationAuditWriter,
  QuotationEventPublisher,
  ApprovalEvaluator,
  PricingLookupPort,
  QuotationLineInput,
  CreateQuotationFromRfqInput,
  CreateQuotationDirectInput,
} from '../application/quotation.service';
export { QuotationRepository } from '../infrastructure/quotation.repository';
export type {
  CreateQuotationInput,
  QuotationLineItemInput,
  QuotationTotalsInput,
} from '../infrastructure/quotation.repository';
export { canTransitionQuotation, assertQuotationTransition } from '../domain/quotation-lifecycle';
export type { QuotationStatus } from '../domain/quotation-lifecycle';
export {
  computeLineTotal,
  computeVersionTotals,
  computeMarginPercent,
  computeWeightedMarginPercent,
} from '../domain/quotation-totals';
export type {
  QuotationLineItemInput as QuotationTotalsLineInput,
  VersionTotals,
} from '../domain/quotation-totals';
