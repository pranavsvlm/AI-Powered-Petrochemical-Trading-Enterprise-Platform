export { CustomerService } from '../application/customer.service';
export type {
  CustomerAuditWriter,
  CustomerAuditReader,
  CustomerEventPublisher,
  ApprovalEvaluator,
} from '../application/customer.service';
export { CustomerRepository } from '../infrastructure/customer.repository';
export type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from '../infrastructure/customer.repository';
export { canTransitionCustomer, assertCustomerTransition } from '../domain/customer-lifecycle';
export type { CustomerStatus } from '../domain/customer-lifecycle';
export { isWithinCreditLimit } from '../domain/credit';
export type { CreditCheckInput } from '../domain/credit';
export { NotImplementedAiCustomerProfileProvider } from '../domain/ports/ai-customer-profile.port';
export type { AiCustomerProfileProvider } from '../domain/ports/ai-customer-profile.port';
