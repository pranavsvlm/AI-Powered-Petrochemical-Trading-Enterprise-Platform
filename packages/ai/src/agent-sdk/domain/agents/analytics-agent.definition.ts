import { PermissionAction } from '@platform/types';
import type { AgentDefinition, ToolDefinition } from '../agent-types';

/**
 * The real substance behind doc 20's Natural Language Analytics ("Show revenue in Africa this
 * month", "Why did profit decrease?") — deliberately read-only, zero write-tools, zero approval
 * path, following `KNOWLEDGE_AGENT`'s exact precedent. Turns a question into a
 * `analytics.queryKpis`/`analytics.getForecast` tool call plus a synthesized text answer,
 * reusing 100% of the existing orchestrator/tool-calling loop rather than a bespoke
 * NL-to-SQL parser. See docs/DOMAIN_MODEL_PHASE7.md, Analytics section.
 */
export const ANALYTICS_AGENT: AgentDefinition = {
  key: 'analytics-agent',
  name: 'Analytics Assistant',
  description: 'Answers natural-language questions about business KPIs, dashboards, and forecasts.',
  version: 1,
  capabilities: ['analytics.queryKpis', 'analytics.getForecast'],
  systemPromptTemplateKey: 'analytics-agent.system-prompt',
};

export const ANALYTICS_AGENT_TOOLS: ToolDefinition[] = [
  {
    key: 'analytics.queryKpis',
    name: 'Query KPIs',
    description:
      'Fetch real computed KPI figures for one dashboard section (executive, sales, trading, finance, inventory, procurement, or ai).',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['executive', 'sales', 'trading', 'finance', 'inventory', 'procurement', 'ai'],
        },
      },
      required: ['section'],
    },
    requiredPermissionModule: 'analytics',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'analytics.getForecast',
    name: 'Get Forecast',
    description: 'Fetch the latest generated forecast for a given type (currently only "SALES").',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', enum: ['SALES'] } },
      required: ['type'],
    },
    requiredPermissionModule: 'analytics',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
];
