import {
  TaskDependencyEdge,
  wouldCreateTaskDependencyCycle,
} from './task-dependency-graph';

describe('task-dependency-graph', () => {
  const edges: TaskDependencyEdge[] = [
    { predecessorTaskId: 'A', successorTaskId: 'B' },
    { predecessorTaskId: 'B', successorTaskId: 'C' },
  ];

  it('detects direct self-dependency', () => {
    expect(
      wouldCreateTaskDependencyCycle([], {
        predecessorTaskId: 'A',
        successorTaskId: 'A',
      }),
    ).toBe(true);
  });

  it('allows acyclic edge', () => {
    expect(
      wouldCreateTaskDependencyCycle(edges, {
        predecessorTaskId: 'C',
        successorTaskId: 'D',
      }),
    ).toBe(false);
  });

  it('detects transitive cycle A→B→A', () => {
    expect(
      wouldCreateTaskDependencyCycle(
        [{ predecessorTaskId: 'A', successorTaskId: 'B' }],
        { predecessorTaskId: 'B', successorTaskId: 'A' },
      ),
    ).toBe(true);
  });
});
