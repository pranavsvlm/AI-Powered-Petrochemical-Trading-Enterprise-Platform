export type WorkflowNodeType =
  | 'START'
  | 'AI_DECISION'
  | 'CONDITION'
  | 'APPROVAL'
  | 'TASK'
  | 'NOTIFICATION'
  | 'API'
  | 'DOCUMENT'
  | 'DATABASE'
  | 'DELAY'
  | 'END';

export interface GraphNode {
  id: string;
  key: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  condition?: unknown;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class CyclicGraphError extends Error {
  constructor(public readonly cyclePath: string[]) {
    super(`Workflow graph contains a cycle: ${cyclePath.join(' -> ')}`);
    this.name = 'CyclicGraphError';
  }
}

export class InvalidGraphError extends Error {}

/**
 * Real DFS-based cycle detection (white/gray/black coloring). Run at publish time — a
 * cyclic graph is rejected before it can ever be executed.
 */
export function detectCycle(graph: WorkflowGraph): void {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(graph.nodes.map((n) => [n.id, WHITE]));
  const path: string[] = [];

  function visit(nodeId: string): void {
    color.set(nodeId, GRAY);
    path.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      const c = color.get(next);
      if (c === GRAY) {
        throw new CyclicGraphError([...path, next]);
      }
      if (c === WHITE) visit(next);
    }
    path.pop();
    color.set(nodeId, BLACK);
  }

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE) visit(node.id);
  }
}

export function findStartNode(graph: WorkflowGraph): GraphNode {
  const starts = graph.nodes.filter((n) => n.type === 'START');
  if (starts.length !== 1) {
    throw new InvalidGraphError(
      `Workflow must have exactly one START node, found ${starts.length}.`,
    );
  }
  return starts[0]!;
}

export function outgoingEdges(graph: WorkflowGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((e) => e.fromNodeId === nodeId);
}

export function nodeById(graph: WorkflowGraph, nodeId: string): GraphNode {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new InvalidGraphError(`Node ${nodeId} not found in graph.`);
  return node;
}
