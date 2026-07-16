import {
  CyclicGraphError,
  InvalidGraphError,
  detectCycle,
  findStartNode,
  type WorkflowGraph,
} from './workflow-graph';

function graph(overrides: Partial<WorkflowGraph>): WorkflowGraph {
  return {
    nodes: [
      { id: 'start', key: 'start', type: 'START', config: {} },
      { id: 'end', key: 'end', type: 'END', config: {} },
    ],
    edges: [{ id: 'e1', fromNodeId: 'start', toNodeId: 'end' }],
    ...overrides,
  };
}

describe('detectCycle', () => {
  it('accepts a valid acyclic graph', () => {
    expect(() => detectCycle(graph({}))).not.toThrow();
  });

  it('rejects a graph with a direct cycle', () => {
    const g = graph({
      nodes: [
        { id: 'a', key: 'a', type: 'CONDITION', config: {} },
        { id: 'b', key: 'b', type: 'CONDITION', config: {} },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'a', toNodeId: 'b' },
        { id: 'e2', fromNodeId: 'b', toNodeId: 'a' },
      ],
    });
    expect(() => detectCycle(g)).toThrow(CyclicGraphError);
  });

  it('rejects a longer indirect cycle', () => {
    const g = graph({
      nodes: [
        { id: 'a', key: 'a', type: 'CONDITION', config: {} },
        { id: 'b', key: 'b', type: 'CONDITION', config: {} },
        { id: 'c', key: 'c', type: 'CONDITION', config: {} },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'a', toNodeId: 'b' },
        { id: 'e2', fromNodeId: 'b', toNodeId: 'c' },
        { id: 'e3', fromNodeId: 'c', toNodeId: 'a' },
      ],
    });
    expect(() => detectCycle(g)).toThrow(CyclicGraphError);
  });
});

describe('findStartNode', () => {
  it('finds exactly one START node', () => {
    expect(findStartNode(graph({})).id).toBe('start');
  });

  it('throws if there is no START node', () => {
    const g = graph({ nodes: [{ id: 'end', key: 'end', type: 'END', config: {} }] });
    expect(() => findStartNode(g)).toThrow(InvalidGraphError);
  });

  it('throws if there is more than one START node', () => {
    const g = graph({
      nodes: [
        { id: 'start1', key: 'start1', type: 'START', config: {} },
        { id: 'start2', key: 'start2', type: 'START', config: {} },
      ],
    });
    expect(() => findStartNode(g)).toThrow(InvalidGraphError);
  });
});
