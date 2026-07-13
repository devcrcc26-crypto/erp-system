import {
  buildTaskSubtaskWorkDaysSummaries,
  computePlannedWorkDays,
} from '../task-subtask-date-summary.util';

describe('computePlannedWorkDays', () => {
  it('returns calendar days between planned start and finish', () => {
    expect(
      computePlannedWorkDays(
        new Date('2026-01-01'),
        new Date('2026-01-10'),
      ),
    ).toBe(9);
  });

  it('returns null when either date is missing', () => {
    expect(
      computePlannedWorkDays(new Date('2026-01-01'), null),
    ).toBeNull();
  });
});

describe('buildTaskSubtaskWorkDaysSummaries', () => {
  it('returns null summaries when task has no subtasks', () => {
    const result = buildTaskSubtaskWorkDaysSummaries(['task-1'], []);
    expect(result.get('task-1')).toEqual({
      computedPlannedWorkDays: null,
      computedActualWorkDays: null,
    });
  });

  it('sums planned work days across subtasks', () => {
    const result = buildTaskSubtaskWorkDaysSummaries(
      ['task-1'],
      [
        {
          taskId: 'task-1',
          plannedStartDate: new Date('2026-01-01'),
          plannedFinishDate: new Date('2026-01-11'),
          actualWorkDays: null,
        },
        {
          taskId: 'task-1',
          plannedStartDate: new Date('2026-02-01'),
          plannedFinishDate: new Date('2026-02-06'),
          actualWorkDays: null,
        },
      ],
    );
    expect(result.get('task-1')?.computedPlannedWorkDays).toBe(15);
    expect(result.get('task-1')?.computedActualWorkDays).toBeNull();
  });

  it('sums actual work days from subtasks', () => {
    const result = buildTaskSubtaskWorkDaysSummaries(
      ['task-1'],
      [
        {
          taskId: 'task-1',
          plannedStartDate: null,
          plannedFinishDate: null,
          actualWorkDays: 12,
        },
        {
          taskId: 'task-1',
          plannedStartDate: null,
          plannedFinishDate: null,
          actualWorkDays: 8,
        },
      ],
    );
    expect(result.get('task-1')?.computedActualWorkDays).toBe(20);
  });
});
