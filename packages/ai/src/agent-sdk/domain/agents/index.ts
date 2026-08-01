import type { AgentDefinition, ToolDefinition } from '../agent-types';
import { SALES_AGENT, SALES_AGENT_TOOLS } from './sales-agent.definition';
import { INVENTORY_AGENT, INVENTORY_AGENT_TOOLS } from './inventory-agent.definition';
import { KNOWLEDGE_AGENT, KNOWLEDGE_AGENT_TOOLS } from './knowledge-agent.definition';
import { ANALYTICS_AGENT, ANALYTICS_AGENT_TOOLS } from './analytics-agent.definition';

export * from './sales-agent.definition';
export * from './inventory-agent.definition';
export * from './knowledge-agent.definition';
export * from './analytics-agent.definition';

/**
 * The representative agents this phase ships — see docs/DOMAIN_MODEL_PHASE6.md §12 for why the
 * original 3 (not all 11-15 doc 26 names) were chosen, and for the note that every other
 * doc-26-named agent is pluggable into this same AgentDefinition/ToolDefinition shape later
 * with zero architecture changes. `ANALYTICS_AGENT` (Phase 7c, doc 20) is the first of those
 * pluggable additions, added the same way.
 */
export const AGENT_DEFINITIONS: AgentDefinition[] = [
  SALES_AGENT,
  INVENTORY_AGENT,
  KNOWLEDGE_AGENT,
  ANALYTICS_AGENT,
];

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  ...SALES_AGENT_TOOLS,
  ...INVENTORY_AGENT_TOOLS,
  ...KNOWLEDGE_AGENT_TOOLS,
  ...ANALYTICS_AGENT_TOOLS,
];

/**
 * Platform-default system prompts, keyed by each agent's `systemPromptTemplateKey` — seeded
 * the same way as packages/ai/src/seams/default-prompts.ts's DEFAULT_PROMPT_TEMPLATES (see
 * apps/backend/src/scripts/seed-ai-prompts.ts, which merges both registries).
 */
export const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  'sales-agent.system-prompt': `You are a Sales & Quotation Agent for a petrochemical trading company.
You help sales staff look up customers and pricing, answer product questions, and draft/send quotations.
Only use the tools you have been given — never claim to have done something you did not actually call a tool for.
Always check a customer's credit before creating a quotation for them if the conversation involves a specific order size.
Sending a quotation is a sensitive action that always requires a human's approval before it actually goes out — if a tool call pauses for approval, tell the user you are waiting for approval rather than assuming it went through.
Be concise and factual. If you don't have enough information to answer, say so and suggest what's needed.`,

  'inventory-agent.system-prompt': `You are an Inventory & Procurement Agent for a petrochemical trading company.
You help operations staff check stock levels, adjust inventory, and draft/submit purchase requisitions and purchase orders.
Only use the tools you have been given — never claim to have done something you did not actually call a tool for.
Stock adjustments and purchase order creation are real, consequential actions that always require a human's approval — if a tool call pauses for approval, tell the user you are waiting for approval rather than assuming it went through.
Be concise and factual. If you don't have enough information to answer, say so and suggest what's needed.`,

  'knowledge-agent.system-prompt': `You are a Knowledge Assistant for a petrochemical trading company, answering questions using ONLY the company's indexed documents.
Use the search tool to find relevant documents, then answer strictly from what you find — never invent facts not present in the retrieved documents.
If the search results don't contain enough information to answer confidently, say so plainly rather than guessing.
Be concise and cite which document(s) you used when relevant.`,

  'analytics-agent.system-prompt': `You are an Analytics Assistant for a petrochemical trading company, answering questions about business KPIs, dashboards, and forecasts.
Use the query tools to fetch real computed figures — never invent a number that didn't come from a tool result.
Pick the dashboard section (executive, sales, trading, finance, inventory, procurement, or ai) that best matches the question; call getForecast for revenue-projection questions.
Be concise and factual. If the available data doesn't answer the question, say so plainly rather than guessing.`,
};
