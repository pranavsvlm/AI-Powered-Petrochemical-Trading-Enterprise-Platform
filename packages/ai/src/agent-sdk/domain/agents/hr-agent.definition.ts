import { PermissionAction } from '@platform/types';
import type { AgentDefinition, ToolDefinition } from '../agent-types';

/**
 * The real substance behind doc 15's AI HR Assistant "answer HR policy/employee questions"
 * bullet — deliberately read-only, zero write-tools, zero approval path, following
 * `KNOWLEDGE_AGENT`/`ANALYTICS_AGENT`'s exact precedent. Doc 15 also lists write-ish AI actions
 * (recommend leave approvals, draft offer letters) — explicitly deferred, matching every prior
 * agent's human-in-the-loop stance for consequential HR actions. See
 * docs/DOMAIN_MODEL_PHASE7.md, HR section.
 */
export const HR_AGENT: AgentDefinition = {
  key: 'hr-agent',
  name: 'HR Assistant',
  description: 'Answers questions about employees, leave balances, and team rosters.',
  version: 1,
  capabilities: ['hr.getEmployee', 'hr.getLeaveBalance', 'hr.listTeamRoster'],
  systemPromptTemplateKey: 'hr-agent.system-prompt',
};

export const HR_AGENT_TOOLS: ToolDefinition[] = [
  {
    key: 'hr.getEmployee',
    name: 'Get Employee',
    description:
      "Fetch an employee's profile (job title, department, manager, employment status) by id.",
    inputSchema: {
      type: 'object',
      properties: { employeeId: { type: 'string' } },
      required: ['employeeId'],
    },
    requiredPermissionModule: 'hr',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'hr.getLeaveBalance',
    name: 'Get Leave Balance',
    description: "Compute an employee's remaining leave days for a given leave policy this year.",
    inputSchema: {
      type: 'object',
      properties: { employeeId: { type: 'string' }, policyId: { type: 'string' } },
      required: ['employeeId', 'policyId'],
    },
    requiredPermissionModule: 'hr',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
  {
    key: 'hr.listTeamRoster',
    name: 'List Team Roster',
    description: 'List the employees who report to a given manager (by employee id).',
    inputSchema: {
      type: 'object',
      properties: { managerId: { type: 'string' } },
      required: ['managerId'],
    },
    requiredPermissionModule: 'hr',
    requiredPermissionAction: PermissionAction.VIEW,
    requiresHumanApproval: false,
  },
];
