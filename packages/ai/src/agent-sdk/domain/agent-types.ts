import type { PermissionAction } from '@platform/types';

/** Plain-data agent definition — code-defined, DB-mirrored at boot by AgentRegistryService.sync(). Not user-authored, unlike Rule/Workflow. */
export interface AgentDefinition {
  key: string;
  name: string;
  description: string;
  version: number;
  /** Tool.key values this agent may call. */
  capabilities: string[];
  systemPromptTemplateKey: string;
}

/** Plain-data tool definition — code-defined, DB-mirrored at boot by ToolRegistryService.sync(). */
export interface ToolDefinition {
  key: string;
  name: string;
  description: string;
  /** JSON-schema-shaped, passed straight through to the LLM provider's tool-calling API. */
  inputSchema: Record<string, unknown>;
  requiredPermissionModule: string;
  requiredPermissionAction: PermissionAction;
  requiresHumanApproval: boolean;
}
