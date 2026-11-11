import { buildOrgGapReport, OrgGapUserInput } from './org-gap-report';

function user(overrides: Partial<OrgGapUserInput> & { id: string }): OrgGapUserInput {
  return {
    employeeId: null,
    name: overrides.id,
    approverOnly: false,
    departmentId: 'd1',
    departmentName: 'Design',
    disciplineId: 'x1',
    disciplineName: 'Civil',
    reportsToUserId: 'boss',
    reportsToVacant: false,
    ...overrides,
  };
}

describe('buildOrgGapReport', () => {
  it('lists employees missing supervisor, department or discipline', () => {
    const report = buildOrgGapReport({
      users: [
        user({ id: 'complete' }),
        user({ id: 'no-boss', reportsToUserId: null }),
        user({ id: 'vacant-boss', reportsToVacant: true }),
        user({ id: 'no-dept', departmentId: null, departmentName: null }),
        user({ id: 'no-disc', disciplineId: null, disciplineName: null }),
      ],
      departments: [],
      disciplines: [],
    });

    expect(report.withoutSupervisor.map((u) => u.id)).toEqual(['no-boss']);
    expect(report.withVacantSupervisor.map((u) => u.id)).toEqual(['vacant-boss']);
    expect(report.withoutDepartment.map((u) => u.id)).toEqual(['no-dept']);
    expect(report.withoutDiscipline.map((u) => u.id)).toEqual(['no-disc']);
    expect(report.totals.employees).toBe(5);
  });

  it('ignores approver-only accounts as employees and in member counts', () => {
    const report = buildOrgGapReport({
      users: [
        user({ id: 'approver', approverOnly: true, reportsToUserId: null, departmentId: null }),
        user({ id: 'e1', departmentId: 'd1' }),
      ],
      departments: [{ id: 'd1', name: 'Design', leaderUserId: null, leaderVacant: false }],
      disciplines: [],
    });

    expect(report.totals.employees).toBe(1);
    expect(report.withoutSupervisor).toHaveLength(0);
    expect(report.departmentsWithoutLeader).toEqual([
      { id: 'd1', name: 'Design', members: 1, reason: 'NONE' },
    ]);
  });

  it('reports vacant leaders separately from missing ones and sorts by members', () => {
    const report = buildOrgGapReport({
      users: [user({ id: 'e1', disciplineId: 'x2' }), user({ id: 'e2', disciplineId: 'x2' })],
      departments: [],
      disciplines: [
        { id: 'x1', name: 'Civil', leaderUserId: 'gone', leaderVacant: true },
        { id: 'x2', name: 'Survey', leaderUserId: null, leaderVacant: false },
        { id: 'x3', name: 'Water', leaderUserId: 'ok', leaderVacant: false },
      ],
    });

    expect(report.disciplinesWithoutLeader).toEqual([
      { id: 'x2', name: 'Survey', members: 2, reason: 'NONE' },
      { id: 'x1', name: 'Civil', members: 0, reason: 'VACANT' },
    ]);
  });

  it('dedupes and sorts supervisors without accounts', () => {
    const report = buildOrgGapReport({
      users: [],
      departments: [],
      disciplines: [],
      supervisorsWithoutAccount: ['Supervisor B', 'Manager C', 'Supervisor B'],
    });
    expect(report.supervisorsWithoutAccount).toEqual(['Manager C', 'Supervisor B']);
    expect(report.totals.supervisorsWithoutAccount).toBe(2);
  });
});
