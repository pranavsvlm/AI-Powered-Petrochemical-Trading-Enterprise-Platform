import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import { detectCycle, type WorkflowGraph } from '../domain/workflow-graph';

export interface CreateWorkflowInput {
  companyId: string;
  name: string;
  description?: string;
  triggerType: 'MANUAL' | 'API' | 'SCHEDULED' | 'EVENT';
  triggerConfig?: Record<string, unknown>;
  graph: WorkflowGraph;
  actorUserId?: string;
}

/** Workflow CRUD + version history + publish (with cycle detection) + audit. */
export class WorkflowManagementService {
  constructor(private readonly prisma: TenantScopedPrismaClient = getPrismaClient()) {}

  async create(input: CreateWorkflowInput) {
    const workflow = await this.prisma.workflow.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        description: input.description,
        status: 'DRAFT',
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig as object | undefined,
        versions: {
          create: {
            version: 1,
            status: 'DRAFT',
            nodes: {
              create: input.graph.nodes.map((n) => ({
                id: n.id,
                key: n.key,
                name: (n.config.name as string | undefined) ?? n.key,
                type: n.type,
                config: n.config as object,
              })),
            },
          },
        },
      },
      include: { versions: true },
    });

    const versionId = workflow.versions[0]!.id;
    for (const edge of input.graph.edges) {
      await this.prisma.workflowEdge.create({
        data: {
          workflowVersionId: versionId,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          condition: edge.condition as object | undefined,
        },
      });
    }

    await this.audit(workflow.id, 'CREATED', input.actorUserId, { name: input.name });
    return workflow;
  }

  async publish(workflowId: string, actorUserId?: string) {
    const workflow = await this.prisma.workflow.findUniqueOrThrow({
      where: { id: workflowId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1, include: { nodes: true, edges: true } },
      },
    });
    const draft = workflow.versions[0];
    if (!draft) throw new Error(`Workflow ${workflowId} has no versions.`);

    const graph: WorkflowGraph = {
      nodes: draft.nodes.map((n) => ({
        id: n.id,
        key: n.key,
        type: n.type as never,
        config: n.config as never,
      })),
      edges: draft.edges.map((e) => ({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        condition: e.condition,
      })),
    };
    // Real graph-cycle-detection at publish time — throws CyclicGraphError if invalid.
    detectCycle(graph);

    await this.prisma.$transaction([
      this.prisma.workflowVersion.updateMany({
        where: { workflowId, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      }),
      this.prisma.workflowVersion.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
      this.prisma.workflow.update({ where: { id: workflowId }, data: { status: 'PUBLISHED' } }),
    ]);

    await this.audit(workflowId, 'PUBLISHED', actorUserId, {});
    return workflow;
  }

  async loadPublishedGraph(workflowId: string): Promise<WorkflowGraph> {
    const version = await this.prisma.workflowVersion.findFirstOrThrow({
      where: { workflowId, status: 'PUBLISHED' },
      include: { nodes: true, edges: true },
    });
    return {
      nodes: version.nodes.map((n) => ({
        id: n.id,
        key: n.key,
        type: n.type as never,
        config: n.config as never,
      })),
      edges: version.edges.map((e) => ({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        condition: e.condition,
      })),
    };
  }

  private async audit(
    workflowId: string,
    action: string,
    actorUserId: string | undefined,
    detail: Record<string, unknown>,
  ) {
    await this.prisma.workflowAudit.create({
      data: { workflowId, action, actorUserId, detail: detail as object },
    });
  }
}
