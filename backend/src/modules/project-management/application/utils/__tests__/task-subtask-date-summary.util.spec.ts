import { DesignPackageStatus } from '@prisma/client';
import { buildTaskSubtaskDateSummaries } from '../task-subtask-date-summary.util';

describe('buildTaskSubtaskDateSummaries', () => {
  it('returns null summaries when task has no subtasks', () => {
    const result = buildTaskSubtaskDateSummaries(['task-1'], []);
    expect(result.get('task-1')).toEqual({
      computedPlannedFinish: null,
      computedActualFinish: null,
    });
  });

  it('computes MAX planned finish across subtasks', () => {
    const result = buildTaskSubtaskDateSummaries(
      ['task-1'],
      [
        {
          taskId: 'task-1',
          plannedFinishDate: new Date('2026-03-01'),
          packageClosedAt: null,
          packageStatus: DesignPackageStatus.OPEN,
        },
        {
          taskId: 'task-1',
          plannedFinishDate: new Date('2026-06-15'),
          packageClosedAt: null,
          packageStatus: DesignPackageStatus.OPEN,
        },
      ],
    );
    expect(result.get('task-1')?.computedPlannedFinish).toBe('2026-06-15');
    expect(result.get('task-1')?.computedActualFinish).toBeNull();
  });

  it('computes actual finish only when all subtasks are CLOSED', () => {
    const result = buildTaskSubtaskDateSummaries(
      ['task-1'],
      [
        {
          taskId: 'task-1',
          plannedFinishDate: new Date('2026-03-01'),
          packageClosedAt: new Date('2026-03-10T12:00:00.000Z'),
          packageStatus: DesignPackageStatus.CLOSED,
        },
        {
          taskId: 'task-1',
          plannedFinishDate: new Date('2026-06-15'),
          packageClosedAt: new Date('2026-06-20T08:00:00.000Z'),
          packageStatus: DesignPackageStatus.CLOSED,
        },
      ],
    );
    expect(result.get('task-1')?.computedActualFinish).toBe('2026-06-20');
  });

  it('returns null actual finish when any subtask is still open', () => {
    const result = buildTaskSubtaskDateSummaries(
      ['task-1'],
      [
        {
          taskId: 'task-1',
          plannedFinishDate: new Date('2026-03-01'),
          packageClosedAt: new Date('2026-03-10T12:00:00.000Z'),
          packageStatus: DesignPackageStatus.CLOSED,
        },
        {
          taskId: 'task-1',
          plannedFinishDate: new Date('2026-06-15'),
          packageClosedAt: null,
          packageStatus: DesignPackageStatus.OPEN,
        },
      ],
    );
    expect(result.get('task-1')?.computedActualFinish).toBeNull();
  });
});
