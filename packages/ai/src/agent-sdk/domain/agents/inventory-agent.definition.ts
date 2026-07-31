import { PermissionAction } from '@platform/types';
import type { AgentDefinition, ToolDefinition } from '../agent-types';

/**
 * Consolidates doc 26's Inventory + Procurement agents — see docs/DOMAIN_MODEL_PHASE6.md §12.
 * Stock adjustments and PO creation are real spend/inventory-affecting commitments and both
 * require human approval. Tool-binding constraint: InventoryService.reserve/release/commit/
 * reverseCommit are saga-internal (take an externally-supplied tx) and are NOT bound here —
 * only getInventoryItem/adjustStock, which own their complete transaction boundary.
 */
export const INVENTORY_AGENT: AgentDefinition = {
  key: 'inventory-agent',
  name: 'Inventory & Procurement Agent',
  description:
    'Helps operations staff check stock levels, adjust inventory, and draft/submit purchase requisitions and orders.',
  version: 1,
  capabilities: [
    'inventory.getInventoryItem',
    'inventory.adjustStock',
    'procurement.getSupplier',
    'procurement.createRequisition',
    'procurement.submitRequisition',
    'procurement.createPurchaseOrderFromRequisition',
  ],
  systemPromptTemplateKey: 'inventory-agent.system-prompt',
};

export const INVENTORY_AGENT_TOOLS: ToolDefinition[] = [
  {
    key: 'inventory.getInventoryItem',
    name: 'Get Inventory Item',
    description: 'Fetch an inventory item by id, including on-hand and reserved quantities.',
    inputSchema: {
      type: 'object',
      properties: { inventoryItemId: { type: 'string' } },
      required: ['inventoryItemId'],
    },
    requiredPermissionModule: 'inventory',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'inventory.adjustStock',
    name: 'Adjust Stock',
    description:
      "Manually adjust an inventory item's on-hand quantity by a delta, with a reason. Requires human approval.",
    inputSchema: {
      type: 'object',
      properties: {
        inventoryItemId: { type: 'string' },
        quantityDelta: {
          type: 'number',
          description: 'Positive to increase, negative to decrease.',
        },
        reason: { type: 'string' },
      },
      required: ['inventoryItemId', 'quantityDelta', 'reason'],
    },
    requiredPermissionModule: 'inventory',
    requiredPermissionAction: PermissionAction.EDIT,
    requiresHumanApproval: true,
  },
  {
    key: 'procurement.getSupplier',
    name: 'Get Supplier',
    description: 'Fetch a supplier record by id.',
    inputSchema: {
      type: 'object',
      properties: { supplierId: { type: 'string' } },
      required: ['supplierId'],
    },
    requiredPermissionModule: 'procurement',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'procurement.createRequisition',
    name: 'Create Purchase Requisition',
    description: 'Create a draft purchase requisition with line items.',
    inputSchema: {
      type: 'object',
      properties: {
        requisitionNumber: { type: 'string' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
              uom: {
                type: 'string',
                enum: ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'],
              },
              estimatedUnitPrice: { type: 'number' },
            },
            required: ['productId', 'quantity', 'uom'],
          },
        },
      },
      required: ['requisitionNumber', 'lineItems'],
    },
    requiredPermissionModule: 'procurement',
    requiredPermissionAction: PermissionAction.CREATE,
    requiresHumanApproval: false,
  },
  {
    key: 'procurement.submitRequisition',
    name: 'Submit Requisition',
    description:
      'Submit a draft requisition for approval per the configured Rules Engine approval chain.',
    inputSchema: {
      type: 'object',
      properties: { requisitionId: { type: 'string' } },
      required: ['requisitionId'],
    },
    requiredPermissionModule: 'procurement',
    requiredPermissionAction: PermissionAction.APPROVE,
    requiresHumanApproval: false,
  },
  {
    key: 'procurement.createPurchaseOrderFromRequisition',
    name: 'Create Purchase Order From Requisition',
    description:
      'Create a purchase order from an approved requisition and a chosen supplier. A real spend commitment — requires human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        poNumber: { type: 'string' },
        requisitionId: { type: 'string' },
        supplierId: { type: 'string' },
        currency: { type: 'string' },
      },
      required: ['poNumber', 'requisitionId', 'supplierId', 'currency'],
    },
    requiredPermissionModule: 'procurement',
    requiredPermissionAction: PermissionAction.CREATE,
    requiresHumanApproval: true,
  },
];
