import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import { evaluateCondition, type ConditionNode } from '@platform/permissions';
import {
  findStartNode,
  nodeById,
  outgoingEdges,
  type WorkflowGraph,
} from '../domain/workflow-graph';
import { NodeExecutor } from './node-executor';

/**
 * Walks a WorkflowGraph (DAG) from START to END, persisting WorkflowExecution state after
 * every node so execution can be resumed (e.g. after a DELAY or a waiting APPROVAL/TASK).
 */
export class WorkflowExecutionEngine {
  constructor(
    private readonly nodeExecutor: NodeExecutor,
    private readonly prisma: TenantScopedPrismaClient = getPrismaClient(),
  ) {}

  async start(
    graph: WorkflowGraph,
    workflowId: string,
    companyId: string,
    initialContext: Record<string, unknown>,
    isSimulation = false,
  ): Promise<{ executionId: string; status: string }> {
    const startNode = findStartNode(graph);
    const execution = await this.prisma.workflowExecution.create({
      data: {
        workflowId,
        companyId,
        status: 'RUNNING',
        currentNodeId: startNode.id,
        context: initialContext as object,
        isSimulation,
      },
    });
    return this.runFrom(graph, execution.id, startNode.id, isSimulation);
  }

  async resume(
    graph: WorkflowGraph,
    executionId: string,
  ): Promise<{ executionId: string; status: string }> {
    const execution = await this.prisma.workflowExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    if (!execution.currentNodeId) throw new Error(`Execution ${executionId} has no current node.`);
    return this.runFrom(graph, executionId, execution.currentNodeId, execution.isSimulation);
  }

  private async runFrom(
    graph: WorkflowGraph,
    executionId: string,
    startNodeId: string,
    isSimulation: boolean,
  ): Promise<{ executionId: string; status: string }> {
    let currentNodeId: string | undefined = startNodeId;
    const execution = await this.prisma.workflowExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    let context = execution.context as Record<string, unknown>;

    while (currentNodeId) {
      const node = nodeById(graph, currentNodeId);

      let result;
      try {
        result = await this.nodeExecutor.execute(
          node,
          context,
          executionId,
          execution.companyId,
          isSimulation,
        );
      } catch (err) {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
        });
        return { executionId, status: 'FAILED' };
      }

      if (result.output !== undefined) {
        context = { ...context, [`${node.key}_output`]: result.output };
      }

      if (node.type === 'END') {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            context: context as object,
            currentNodeId: null,
          },
        });
        return { executionId, status: 'COMPLETED' };
      }

      if (result.waiting) {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'WAITING', context: context as object, currentNodeId: node.id },
        });
        return { executionId, status: 'WAITING' };
      }

      const edges = outgoingEdges(graph, node.id);
      const nextEdge = this.pickEdge(edges, result.branch, context);
      if (!nextEdge) {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'FAILED',
            error: `No outgoing edge from node ${node.key}.`,
            context: context as object,
          },
        });
        return { executionId, status: 'FAILED' };
      }

      currentNodeId = nextEdge.toNodeId;
      await this.prisma.workflowExecution.update({
        where: { id: executionId },
        data: { currentNodeId, context: context as object },
      });
    }

    return { executionId, status: 'RUNNING' };
  }

  private pickEdge(
    edges: ReturnType<typeof outgoingEdges>,
    branch: string | undefined,
    context: Record<string, unknown>,
  ) {
    if (branch) {
      const labeled = edges.find(
        (e) => (e.condition as { branch?: string } | undefined)?.branch === branch,
      );
      if (labeled) return labeled;
    }
    const conditional = edges.find(
      (e) => e.condition && !(e.condition as { branch?: string }).branch,
    );
    if (
      conditional &&
      evaluateCondition(conditional.condition as ConditionNode, context as never)
    ) {
      return conditional;
    }
    return edges.find((e) => !e.condition) ?? edges[0];
  }
}
