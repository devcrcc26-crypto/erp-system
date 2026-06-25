export interface TaskDependencyEdge {
  readonly predecessorTaskId: string;
  readonly successorTaskId: string;
}

/**
 * Returns true when adding `candidate` would create a directed cycle.
 * Edge direction: predecessor must complete before successor.
 */
export function wouldCreateTaskDependencyCycle(
  existingEdges: readonly TaskDependencyEdge[],
  candidate: TaskDependencyEdge,
): boolean {
  if (candidate.predecessorTaskId === candidate.successorTaskId) {
    return true;
  }

  const adjacency = new Map<string, string[]>();
  const addEdge = (from: string, to: string): void => {
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  };

  for (const edge of existingEdges) {
    addEdge(edge.predecessorTaskId, edge.successorTaskId);
  }
  addEdge(candidate.predecessorTaskId, candidate.successorTaskId);

  const visited = new Set<string>();
  const stack = [candidate.successorTaskId];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === candidate.predecessorTaskId) {
      return true;
    }
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);
    for (const next of adjacency.get(node) ?? []) {
      stack.push(next);
    }
  }

  return false;
}
