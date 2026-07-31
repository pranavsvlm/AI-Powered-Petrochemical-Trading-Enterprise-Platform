import { PermissionAction } from '@platform/types';
import type { AgentDefinition, ToolDefinition } from '../agent-types';

/**
 * Consolidates doc 26's Sales + Quotation + Product-Expert agents into one — see
 * docs/DOMAIN_MODEL_PHASE6.md §12. `quotations.send` requires human approval (doc 26's
 * "sensitive AI response" example); `quotations.requestApproval` is itself internally gated
 * by the Rules Engine already (a separate, complementary layer from this agent-level gate).
 */
export const SALES_AGENT: AgentDefinition = {
  key: 'sales-agent',
  name: 'Sales & Quotation Agent',
  description:
    'Helps sales staff look up customers and pricing, answer product questions, and draft/send quotations.',
  version: 1,
  capabilities: [
    'customers.getById',
    'customers.checkCredit',
    'products.getEffectivePrice',
    'products.ragAsk',
    'quotations.createFromRfq',
    'quotations.createDirect',
    'quotations.requestApproval',
    'quotations.send',
  ],
  systemPromptTemplateKey: 'sales-agent.system-prompt',
};

export const SALES_AGENT_TOOLS: ToolDefinition[] = [
  {
    key: 'customers.getById',
    name: 'Get Customer',
    description: 'Fetch a customer record by id (profile, credit limit, payment terms, status).',
    inputSchema: {
      type: 'object',
      properties: { customerId: { type: 'string', description: 'The customer id.' } },
      required: ['customerId'],
    },
    requiredPermissionModule: 'customers',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'customers.checkCredit',
    name: 'Check Customer Credit',
    description: "Check whether a proposed order total is within a customer's credit limit.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string' },
        proposedOrderTotal: {
          type: 'number',
          description: "The proposed order total in the customer's currency.",
        },
      },
      required: ['customerId', 'proposedOrderTotal'],
    },
    requiredPermissionModule: 'customers',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'products.getEffectivePrice',
    name: 'Get Effective Price',
    description:
      'Resolve the effective unit price for a product at a given quantity/currency, optionally for a specific customer.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'number' },
        currency: { type: 'string', description: 'ISO 4217 currency code, e.g. USD.' },
        customerId: { type: 'string' },
      },
      required: ['productId', 'quantity', 'currency'],
    },
    requiredPermissionModule: 'products',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'products.ragAsk',
    name: 'Ask Product Expert',
    description:
      'Answer a technical question about a product using its indexed spec documents (RAG).',
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string' }, question: { type: 'string' } },
      required: ['productId', 'question'],
    },
    requiredPermissionModule: 'products',
    requiredPermissionAction: PermissionAction.EXECUTE_AI,
    requiresHumanApproval: false,
  },
  {
    key: 'quotations.createFromRfq',
    name: 'Create Quotation From RFQ',
    description:
      'Create a draft quotation from an existing RFQ and its line items. Pricing is resolved automatically from the price list — do not supply a unit price.',
    inputSchema: {
      type: 'object',
      properties: {
        quotationNumber: { type: 'string' },
        rfqId: { type: 'string' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
              discountPercent: { type: 'number' },
            },
            required: ['productId', 'quantity'],
          },
        },
      },
      required: ['quotationNumber', 'rfqId', 'lineItems'],
    },
    requiredPermissionModule: 'quotations',
    requiredPermissionAction: PermissionAction.CREATE,
    requiresHumanApproval: false,
  },
  {
    key: 'quotations.createDirect',
    name: 'Create Direct Quotation',
    description:
      'Create a draft quotation directly for a customer, without a prior RFQ. Pricing is resolved automatically from the price list — do not supply a unit price.',
    inputSchema: {
      type: 'object',
      properties: {
        quotationNumber: { type: 'string' },
        customerId: { type: 'string' },
        currency: { type: 'string' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
              discountPercent: { type: 'number' },
            },
            required: ['productId', 'quantity'],
          },
        },
      },
      required: ['quotationNumber', 'customerId', 'currency', 'lineItems'],
    },
    requiredPermissionModule: 'quotations',
    requiredPermissionAction: PermissionAction.CREATE,
    requiresHumanApproval: false,
  },
  {
    key: 'quotations.requestApproval',
    name: 'Request Quotation Approval',
    description:
      'Submit a draft quotation for approval per the configured Rules Engine approval chain.',
    inputSchema: {
      type: 'object',
      properties: { quotationId: { type: 'string' } },
      required: ['quotationId'],
    },
    requiredPermissionModule: 'quotations',
    requiredPermissionAction: PermissionAction.APPROVE,
    requiresHumanApproval: false,
  },
  {
    key: 'quotations.send',
    name: 'Send Quotation',
    description:
      'Send an approved quotation to the customer. Sensitive — always requires human approval before an AI agent may do this.',
    inputSchema: {
      type: 'object',
      properties: { quotationId: { type: 'string' } },
      required: ['quotationId'],
    },
    requiredPermissionModule: 'quotations',
    requiredPermissionAction: PermissionAction.EDIT,
    requiresHumanApproval: true,
  },
];
