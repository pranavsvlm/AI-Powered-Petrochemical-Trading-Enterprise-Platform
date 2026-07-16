export const PACKAGE_NAME = '@platform/workflow';

export type {
  WorkflowNodeType,
  GraphNode,
  GraphEdge,
  WorkflowGraph,
} from './domain/workflow-graph';
export {
  detectCycle,
  findStartNode,
  outgoingEdges,
  nodeById,
  CyclicGraphError,
  InvalidGraphError,
} from './domain/workflow-graph';
export type {
  DocumentGeneratorPort,
  DocumentTemplate,
  GeneratedDocument,
} from './domain/ports/document-generator.port';
export type {
  NotificationClientPort,
  AiDecisionProviderPort,
} from './domain/ports/workflow-clients.port';

export { NodeExecutor } from './application/node-executor';
export type { NodeExecutorDeps, NodeExecutionResult } from './application/node-executor';
export { WorkflowExecutionEngine } from './application/workflow-execution.engine';
export { WorkflowManagementService } from './application/workflow-management.service';
export type { CreateWorkflowInput } from './application/workflow-management.service';

export { PdfKitDocumentGenerator } from './infrastructure/pdfkit-document-generator';
export {
  DATABASE_NODE_MODEL_WHITELIST,
  assertWhitelistedModel,
} from './infrastructure/database-node-whitelist';
export type { DatabaseNodeModel } from './infrastructure/database-node-whitelist';
export {
  WorkflowResumeQueue,
  createWorkflowResumeWorker,
} from './infrastructure/workflow-resume.queue';
export { WorkflowTriggerScheduler } from './infrastructure/workflow-triggers';
