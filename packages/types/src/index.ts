// Shared cross-package types for Phase 1 (Identity, Tenancy & Access Control).

export enum CompanyStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum UserStatus {
  PENDING_INVITATION = 'PENDING_INVITATION',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  LOCKED = 'LOCKED',
  ARCHIVED = 'ARCHIVED',
}

export enum PermissionAction {
  VIEW = 'VIEW',
  CREATE = 'CREATE',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  PRINT = 'PRINT',
  SHARE = 'SHARE',
  EXECUTE_AI = 'EXECUTE_AI',
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
}

export enum BranchType {
  HEADQUARTERS = 'HEADQUARTERS',
  REGIONAL_OFFICE = 'REGIONAL_OFFICE',
  WAREHOUSE = 'WAREHOUSE',
  SALES_OFFICE = 'SALES_OFFICE',
  MANUFACTURING_PLANT = 'MANUFACTURING_PLANT',
}

export enum MfaMethod {
  TOTP = 'TOTP',
  EMAIL_OTP = 'EMAIL_OTP',
}

/** Extensible per doc 09 — only LOCAL is implemented in Phase 1. */
export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  MICROSOFT = 'MICROSOFT',
  SAML = 'SAML',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** The set of tenant-scoped Prisma model names the tenant extension guards. */
export const TENANT_SCOPED_MODELS = [
  'User',
  'Department',
  'Team',
  'Role',
  'Policy',
  'ApprovalRule',
  'CompanyProfile',
  'CompanySettings',
  'CompanyFeature',
  'Branch',
  'Event',
  'Rule',
  'RuleGroup',
  'RuleExecution',
  'Workflow',
  'WorkflowExecution',
  'Notification',
  'NotificationGroup',
  'Document',
  'DocumentFolder',
  'DocumentCategory',
  'DocumentTag',
  'Customer',
  'Category',
  'Product',
  'ProductAttribute',
  'PriceList',
  'Rfq',
  'Quotation',
  'Order',
  'ApprovalRequest',
  'Warehouse',
  'InventoryItem',
  'InventoryMovement',
  'StockReservation',
  'StockAdjustment',
  'Supplier',
  'PurchaseRequisition',
  'PurchaseOrder',
  'GoodsReceipt',
  'ChartOfAccount',
  'Journal',
  'Invoice',
  'Payment',
  'SupplierBill',
  'AiProviderConfig',
  'AiUsageRecord',
  'PromptTemplate',
  'AgentExecution',
  'Conversation',
  'Memory',
] as const;
// Note: AuditLog is intentionally NOT tenant-scoped by the Prisma extension — it has a
// nullable company_id (platform-level events have none) and its company_id is set
// explicitly by AuditService from the acting request's context, not force-injected.

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export interface JwtAccessTokenPayload {
  sub: string; // userId
  companyId: string;
  email: string;
  sessionId: string;
  roles: string[];
  type: 'access';
}

export interface JwtRefreshTokenPayload {
  sub: string; // userId
  sessionId: string;
  type: 'refresh';
}

/** Attribute context an ABAC condition is evaluated against (doc 07). */
export interface AttributeContext {
  companyId: string;
  userId: string;
  department?: string;
  region?: string;
  country?: string;
  jobTitle?: string;
  approvalLimit?: number;
  customerType?: string;
  productCategory?: string;
  orderValue?: number;
  currency?: string;
  businessHours?: boolean;
  poValue?: number;
  supplierId?: string;
  [key: string]: string | number | boolean | undefined;
}

export const PACKAGE_NAME = '@platform/types';
