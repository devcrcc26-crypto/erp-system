import { DesignPackageProjectedStatus } from './contracts/enums/design-package-projected-status.enum';
import { TaskDisciplineProjectedStatus } from './contracts/enums/task-discipline-projected-status.enum';
import { resolveDisciplineProjectedStatus } from './discipline-status-resolver';

describe('discipline-status-resolver', () => {
  it('returns IN_PROGRESS for empty packages', () => {
    expect(resolveDisciplineProjectedStatus([])).toBe(
      TaskDisciplineProjectedStatus.IN_PROGRESS,
    );
  });

  it('returns worst-case across packages', () => {
    expect(
      resolveDisciplineProjectedStatus([
        DesignPackageProjectedStatus.APPROVED,
        DesignPackageProjectedStatus.IN_PROGRESS,
      ]),
    ).toBe(TaskDisciplineProjectedStatus.IN_PROGRESS);
  });

  it('returns REWORK_REQUIRED when any package requires rework', () => {
    expect(
      resolveDisciplineProjectedStatus([
        DesignPackageProjectedStatus.APPROVED,
        DesignPackageProjectedStatus.REWORK_REQUIRED,
        DesignPackageProjectedStatus.PENDING_LEAD,
      ]),
    ).toBe(TaskDisciplineProjectedStatus.REWORK_REQUIRED);
  });

  it('returns PENDING_LEAD when all packages at PENDING_LEAD or better', () => {
    expect(
      resolveDisciplineProjectedStatus([
        DesignPackageProjectedStatus.APPROVED,
        DesignPackageProjectedStatus.PENDING_LEAD,
      ]),
    ).toBe(TaskDisciplineProjectedStatus.PENDING_LEAD);
  });
});
