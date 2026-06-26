import { DesignPackageProjectedStatus } from './contracts/enums/design-package-projected-status.enum';
import { TaskDisciplineProjectedStatus } from './contracts/enums/task-discipline-projected-status.enum';
import { PACKAGE_STATUS_PRIORITY } from './package-status-resolver';

/**
 * Maps package projected status to discipline projected status (1:1 enum values).
 */
const PACKAGE_TO_DISCIPLINE: Readonly<
  Record<DesignPackageProjectedStatus, TaskDisciplineProjectedStatus>
> = {
  [DesignPackageProjectedStatus.REWORK_REQUIRED]:
    TaskDisciplineProjectedStatus.REWORK_REQUIRED,
  [DesignPackageProjectedStatus.IN_PROGRESS]:
    TaskDisciplineProjectedStatus.IN_PROGRESS,
  [DesignPackageProjectedStatus.PENDING_LEAD]:
    TaskDisciplineProjectedStatus.PENDING_LEAD,
  [DesignPackageProjectedStatus.LOCKED]:
    TaskDisciplineProjectedStatus.APPROVED,
  [DesignPackageProjectedStatus.APPROVED]:
    TaskDisciplineProjectedStatus.APPROVED,
};

/**
 * Derives TaskDiscipline.projectedStatus - worst-case across DesignPackages.
 */
export function resolveDisciplineProjectedStatus(
  packageStatuses: readonly DesignPackageProjectedStatus[],
): TaskDisciplineProjectedStatus {
  if (packageStatuses.length === 0) {
    return TaskDisciplineProjectedStatus.IN_PROGRESS;
  }

  let worst = packageStatuses[0];
  for (let i = 1; i < packageStatuses.length; i++) {
    const current = packageStatuses[i];
    const indexWorst = PACKAGE_STATUS_PRIORITY.indexOf(worst);
    const indexCurrent = PACKAGE_STATUS_PRIORITY.indexOf(current);
    if (indexCurrent < indexWorst) {
      worst = current;
    }
  }

  return PACKAGE_TO_DISCIPLINE[worst];
}
