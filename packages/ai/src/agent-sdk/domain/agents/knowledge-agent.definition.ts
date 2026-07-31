import { PermissionAction } from '@platform/types';
import type { AgentDefinition, ToolDefinition } from '../agent-types';

/**
 * Deliberately read-only — zero write-tools, zero approval path. Proves the RAG substrate
 * (packages/search's PgVectorSearchProvider) through the full agent framework, not just a raw
 * SearchService unit test. See docs/DOMAIN_MODEL_PHASE6.md §12.
 */
export const KNOWLEDGE_AGENT: AgentDefinition = {
  key: 'knowledge-agent',
  name: 'Knowledge Assistant',
  description: "Answers questions by searching the company's indexed documents.",
  version: 1,
  capabilities: ['knowledge.search', 'knowledge.getDocument'],
  systemPromptTemplateKey: 'knowledge-agent.system-prompt',
};

export const KNOWLEDGE_AGENT_TOOLS: ToolDefinition[] = [
  {
    key: 'knowledge.search',
    name: 'Search Documents',
    description:
      "Semantic search over the company's indexed documents; returns matching document ids ranked by relevance.",
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
    requiredPermissionModule: 'documents',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'knowledge.getDocument',
    name: 'Get Document',
    description: "Fetch a document's metadata (title, description, folder, category) by id.",
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string' } },
      required: ['documentId'],
    },
    requiredPermissionModule: 'documents',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
];
