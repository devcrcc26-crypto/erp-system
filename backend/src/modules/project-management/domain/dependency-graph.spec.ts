import {
  PackageDependencyEdge,
  wouldCreateDependencyCycle,
} from './dependency-graph';

describe('dependency-graph', () => {
  const edges: PackageDependencyEdge[] = [
    { dependentPackageId: 'B', prerequisitePackageId: 'A' },
    { dependentPackageId: 'C', prerequisitePackageId: 'B' },
  ];

  it('detects direct self-dependency', () => {
    expect(
      wouldCreateDependencyCycle([], {
        dependentPackageId: 'A',
        prerequisitePackageId: 'A',
      }),
    ).toBe(true);
  });

  it('allows acyclic edge', () => {
    expect(
      wouldCreateDependencyCycle(edges, {
        dependentPackageId: 'D',
        prerequisitePackageId: 'C',
      }),
    ).toBe(false);
  });

  it('detects transitive cycle', () => {
    expect(
      wouldCreateDependencyCycle(edges, {
        dependentPackageId: 'A',
        prerequisitePackageId: 'C',
      }),
    ).toBe(true);
  });
});
