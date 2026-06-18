export interface PackageDependencyEdge {
  readonly dependentPackageId: string;
  readonly prerequisitePackageId: string;
}

/**
 * Returns true when adding `candidate` would create a directed cycle.
 * Edge direction: dependent → prerequisite (must finish prerequisite first).
 */
export function wouldCreateDependencyCycle(
  existingEdges: readonly PackageDependencyEdge[],
  candidate: PackageDependencyEdge,
): boolean {
  if (candidate.dependentPackageId === candidate.prerequisitePackageId) {
    return true;
  }

  const adjacency = new Map<string, string[]>();
  const addEdge = (from: string, to: string): void => {
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  };

  for (const edge of existingEdges) {
    addEdge(edge.dependentPackageId, edge.prerequisitePackageId);
  }
  addEdge(candidate.dependentPackageId, candidate.prerequisitePackageId);

  const visited = new Set<string>();
  const stack = [candidate.prerequisitePackageId];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === candidate.dependentPackageId) {
      return true;
    }
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);
    const next = adjacency.get(node) ?? [];
    for (const n of next) {
      stack.push(n);
    }
  }

  return false;
}
