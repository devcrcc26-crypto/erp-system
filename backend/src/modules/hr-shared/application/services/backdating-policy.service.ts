import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { assertWithinEmploymentWindow } from '../../../../shared/employment/employment-guard.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PAYROLL_LOCKED_RUN_STATUSES } from '../../../attendance/application/utils/attendance-recalc-policy.util';
import { HrApprovalChainService } from './hr-approval-chain.service';
import {
  assertDatesNotBeforeEarliest,
  assertNoLockedPayrollMonths,
  BackdatingActorKind,
  getEarliestAllowedDate,
  isLateSubmissionDate,
  requiresLateReason,
} from '../utils/earliest-allowed-date.util';
import { dateToYyyyMmDd } from '../../../attendance/application/services/attendance-leave.util';

export type ValidateBackdatingInput = {
  companyId: string;
  actorUserId: string;
  targetEmployeeId: string;
  dates: Date[];
  lateReason?: string | null;
  today?: Date;
  /** When set, skips resolveActorKind (site assignment supervisor vs HR). */
  actorKind?: BackdatingActorKind;
};

export type ValidateBackdatingResult = {
  earliestDate: string;
  isLateSubmission: boolean;
  lateReason: string | null;
  actorKind: BackdatingActorKind;
};

@Injectable()
export class BackdatingPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly hrApprovalChain: HrApprovalChainService,
  ) {}

  /**
   * Loads payroll-locked month keys for a company (APPROVED / GM_APPROVED / PAID).
   */
  async loadLockedMonthKeys(companyId: string): Promise<Set<string>> {
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: [...PAYROLL_LOCKED_RUN_STATUSES] },
      },
      select: { month: true, year: true },
    });
    return new Set(
      runs.map((run) => `${run.year}-${String(run.month).padStart(2, '0')}`),
    );
  }

  async resolveActorKind(
    actorUserId: string,
    companyId: string,
    targetEmployeeId: string,
  ): Promise<BackdatingActorKind> {
    if (actorUserId === targetEmployeeId) {
      return 'EMPLOYEE_SELF';
    }
    const isHrOrAdmin = await this.hrApprovalChain.isHrOrFullAccessActor(
      actorUserId,
      companyId,
    );
    if (isHrOrAdmin) {
      return 'HR_ON_BEHALF';
    }
    // Discipline lead / department head on-behalf uses the employee window.
    return 'EMPLOYEE_SELF';
  }

  async getEarliestAllowedDateForEmployee(
    companyId: string,
    actorUserId: string,
    targetEmployeeId: string,
    today: Date = new Date(),
  ): Promise<{
    earliestDate: string;
    actorKind: BackdatingActorKind;
    requiresLateReasonWhenBeforeCurrentMonth: boolean;
  }> {
    const actorKind = await this.resolveActorKind(
      actorUserId,
      companyId,
      targetEmployeeId,
    );
    const lockedMonths = await this.loadLockedMonthKeys(companyId);
    const earliest = getEarliestAllowedDate({
      today,
      lockedMonths,
      actorKind,
    });
    return {
      earliestDate: dateToYyyyMmDd(earliest),
      actorKind,
      requiresLateReasonWhenBeforeCurrentMonth: actorKind === 'HR_ON_BEHALF',
    };
  }

  /**
   * Validates selectable dates and returns late-submission metadata for persistence.
   */
  async validateSubmissionDates(
    input: ValidateBackdatingInput,
  ): Promise<ValidateBackdatingResult> {
    const today = input.today ?? new Date();
    const actorKind =
      input.actorKind ??
      (await this.resolveActorKind(
        input.actorUserId,
        input.companyId,
        input.targetEmployeeId,
      ));
    const lockedMonths = await this.loadLockedMonthKeys(input.companyId);
    const earliest = getEarliestAllowedDate({
      today,
      lockedMonths,
      actorKind,
    });

    try {
      assertNoLockedPayrollMonths(input.dates, lockedMonths);
      assertDatesNotBeforeEarliest(input.dates, earliest);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid date',
      );
    }
    // Field movement, WFH and site assignments: never for days outside employment.
    await assertWithinEmploymentWindow(this.prisma, input.targetEmployeeId, input.dates);

    const primaryDate = input.dates.reduce(
      (min, d) => (d.getTime() < min.getTime() ? d : min),
      input.dates[0]!,
    );
    const isLate = isLateSubmissionDate(primaryDate, today);
    const needsReason = requiresLateReason({
      actorKind,
      primaryDate,
      today,
    });
    const lateReason = input.lateReason?.trim() ?? '';
    if (needsReason && !lateReason) {
      throw new BadRequestException(
        'Reason is required when entering dates before the current month',
      );
    }

    return {
      earliestDate: dateToYyyyMmDd(earliest),
      isLateSubmission: isLate,
      lateReason: needsReason ? lateReason : null,
      actorKind,
    };
  }
}
