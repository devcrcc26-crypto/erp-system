import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSource,
  EmployeeContractStatus,
  type EmploymentPeriod,
  type Prisma,
  type SeparationType,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { AuditService } from '../../../audit/application/services/audit.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { markPayrollAttendanceSnapshotStale } from '../../../attendance/application/utils/attendance-recalc-policy.util';
import { ApprovalReassignmentService } from '../../../approvals/application/services/approval-reassignment.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import { isVacantApprover } from '../../../../shared/employment/vacant-approver.util';
import {
  formatDateOnlyUtc,
  minDate,
  parseDateOnlyUtc,
  separationIsEffective,
  todayInAddisUtc,
} from '../../../../shared/employment/separation-dates.util';

type Ctx = { companyId: string; userId: string };

export const LOCKED_PAYROLL_STATUSES = ['APPROVED', 'GM_APPROVED', 'PAID'] as const;
const PENDING_REQUEST_STATUSES = ['PENDING', 'SUBMITTED', 'IN_REVIEW'] as const;
const PAYROLL_NOTIFY_ROLES = ['HR Manager', 'Local HR Manager'] as const;
const LIST_LIMIT = 20;

export const APPROVER_ROLE_NAMES = [
  'HR Manager',
  'HR Officer',
  'Local HR Manager',
  'General Manager',
] as const;

export type LeadershipKind = 'DEPARTMENT_LEADER' | 'DISCIPLINE_LEADER' | 'ROLE';

export interface HandoverDecision {
  /** Tier id, department id, discipline id or role id. */
  id: string;
  replacementId?: string | null;
  skipReason?: string | null;
}

export interface HandoverInput {
  tiers?: HandoverDecision[];
  leadership?: Array<HandoverDecision & { kind: LeadershipKind }>;
  submittedRequests?: Array<{ requestId: string; action: 'CANCEL' | 'KEEP' }>;
}

export interface HandoverRequirements {
  tiers: Array<{ tierId: string; requestId: string; requestNumber: string; title: string; tierLabel: string }>;
  leadership: Array<{ kind: LeadershipKind; id: string; name: string }>;
  submittedRequests: Array<{ requestId: string; requestNumber: string; title: string; status: string }>;
}

/**
 * Every pending tier and leadership post needs a replacement or a skip reason;
 * every pending request they submitted needs cancel/keep. Returns what is missing.
 */
export function missingHandover(
  required: HandoverRequirements,
  input: HandoverInput | undefined,
): { tiers: string[]; leadership: string[]; submittedRequests: string[] } {
  const decided = (d: HandoverDecision | undefined): boolean =>
    Boolean(d && (d.replacementId || (d.skipReason && d.skipReason.trim().length >= 3)));
  const tierById = new Map((input?.tiers ?? []).map((d) => [d.id, d]));
  const leadById = new Map((input?.leadership ?? []).map((d) => [`${d.kind}:${d.id}`, d]));
  const reqById = new Map((input?.submittedRequests ?? []).map((d) => [d.requestId, d]));
  return {
    tiers: required.tiers.filter((t) => !decided(tierById.get(t.tierId))).map((t) => t.tierId),
    leadership: required.leadership
      .filter((l) => !decided(leadById.get(`${l.kind}:${l.id}`)))
      .map((l) => `${l.kind}:${l.id}`),
    submittedRequests: required.submittedRequests
      .filter((r) => !reqById.has(r.requestId))
      .map((r) => r.requestId),
  };
}

export interface SeparateEmployeeInput {
  leavingDate: string;
  separationType: SeparationType;
  reason: string;
  /** Required when the leaving date falls in (or before) an approved / paid payroll month. */
  confirmLockedPayroll?: boolean;
  /** Required when the person approves, leads or has pending requests. */
  handover?: HandoverInput;
}

export interface UpdateLeavingDateInput {
  leavingDate: string;
  /** Required when the new leaving date falls in (or before) an approved / paid payroll month. */
  confirmLockedPayroll?: boolean;
}

export interface LockedPayrollRun {
  id: string;
  runNumber: string;
  month: number;
  year: number;
  status: string;
}

export interface SeparationPreview {
  leavingDate: string;
  effectiveImmediately: boolean;
  employmentStart: string | null;
  activeContract: {
    id: string;
    contractNumber: string;
    startDate: string;
    endDate: string | null;
  } | null;
  lockedPayrollRuns: LockedPayrollRun[];
  pendingApprovalTiers: {
    count: number;
    items: Array<{ requestId: string; requestNumber: string; title: string; tierLabel: string }>;
  };
  pendingSubmittedRequests: {
    count: number;
    items: Array<{ requestId: string; requestNumber: string; title: string; status: string }>;
  };
  /** Everything the handover step must decide before the separation can be confirmed. */
  handover: HandoverRequirements;
}

export interface EmploymentState {
  employmentStatus: string;
  isActive: boolean;
  employmentDate: string | null;
  periods: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    separationType: string | null;
    separationReason: string | null;
    separatedAt: string | null;
  }>;
  /** Current or next upcoming inactive period, if any. */
  inactive: { id: string; type: string; fromDate: string; toDate: string | null; current: boolean } | null;
  /** Latest separation on the employee's latest period, if any. */
  separation: {
    periodId: string;
    leavingDate: string;
    separationType: string | null;
    reason: string | null;
    effective: boolean;
    canCancel: boolean;
    cancelBlockedReason: string | null;
  } | null;
}

/**
 * Separation (leaving) of an employee. The leaving date is the last working day;
 * login and contract status flip the day after (now, or via the daily job).
 */
@Injectable()
export class EmploymentSeparationService {
  private readonly logger = new Logger(EmploymentSeparationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly reassignment: ApprovalReassignmentService,
    private readonly approvals: ApprovalsService,
  ) {}

  async getEmployment(ctx: Ctx, userId: string): Promise<EmploymentState> {
    const user = await this.requireUser(ctx, userId);
    const periods = await this.prisma.employmentPeriod.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
    const latest = periods[0];
    let separation: EmploymentState['separation'] = null;
    if (latest?.endDate) {
      const blocked = await this.cancelBlockedReason(ctx.companyId, latest.endDate);
      separation = {
        periodId: latest.id,
        leavingDate: formatDateOnlyUtc(latest.endDate),
        separationType: latest.separationType,
        reason: latest.separationReason,
        effective: separationIsEffective(latest.endDate, todayInAddisUtc()),
        canCancel: blocked == null,
        cancelBlockedReason: blocked,
      };
    }
    const today = todayInAddisUtc();
    const inactiveRow = await this.prisma.inactivePeriod.findFirst({
      where: { userId, OR: [{ toDate: null }, { toDate: { gte: today } }] },
      orderBy: { fromDate: 'asc' },
    });
    return {
      inactive: inactiveRow
        ? {
            id: inactiveRow.id,
            type: inactiveRow.type,
            fromDate: formatDateOnlyUtc(inactiveRow.fromDate),
            toDate: inactiveRow.toDate ? formatDateOnlyUtc(inactiveRow.toDate) : null,
            current: inactiveRow.fromDate.getTime() <= today.getTime(),
          }
        : null,
      employmentStatus: user.employmentStatus,
      isActive: user.isActive,
      employmentDate: user.employmentDate ? formatDateOnlyUtc(user.employmentDate) : null,
      periods: periods.map((p) => ({
        id: p.id,
        startDate: formatDateOnlyUtc(p.startDate),
        endDate: p.endDate ? formatDateOnlyUtc(p.endDate) : null,
        separationType: p.separationType,
        separationReason: p.separationReason,
        separatedAt: p.separatedAt?.toISOString() ?? null,
      })),
      separation,
    };
  }

  async preview(ctx: Ctx, userId: string, leavingDateRaw: string): Promise<SeparationPreview> {
    const leavingDate = this.parseLeavingDate(leavingDateRaw);
    const user = await this.requireUser(ctx, userId);
    const openPeriod = await this.prisma.employmentPeriod.findFirst({
      where: { userId, endDate: null },
      orderBy: { startDate: 'desc' },
    });
    const employmentStart = openPeriod?.startDate ?? user.employmentDate ?? null;
    const [contract, lockedPayrollRuns, tiers, submitted, handover] = await Promise.all([
      this.activeContract(ctx.companyId, userId),
      this.lockedRunsFrom(ctx.companyId, leavingDate),
      this.pendingApprovalTiers(ctx.companyId, userId),
      this.pendingSubmittedRequests(ctx.companyId, userId),
      this.handoverRequirements(ctx.companyId, userId),
    ]);
    return {
      leavingDate: formatDateOnlyUtc(leavingDate),
      effectiveImmediately: separationIsEffective(leavingDate, todayInAddisUtc()),
      employmentStart: employmentStart ? formatDateOnlyUtc(employmentStart) : null,
      activeContract: contract
        ? {
            id: contract.id,
            contractNumber: contract.contractNumber,
            startDate: formatDateOnlyUtc(contract.startDate),
            endDate: contract.endDate ? formatDateOnlyUtc(contract.endDate) : null,
          }
        : null,
      lockedPayrollRuns,
      pendingApprovalTiers: tiers,
      pendingSubmittedRequests: submitted,
      handover,
    };
  }

  async separate(ctx: Ctx, userId: string, input: SeparateEmployeeInput): Promise<EmploymentState> {
    const leavingDate = this.parseLeavingDate(input.leavingDate);
    const reason = input.reason?.trim() ?? '';
    if (!reason) {
      throw new BadRequestException('A separation reason is required');
    }
    const user = await this.requireUser(ctx, userId);
    if (user.employmentStatus === 'SEPARATED') {
      throw new BadRequestException('Employee is already separated');
    }

    const period = await this.findOrCreateOpenPeriod(ctx, user);
    if (leavingDate.getTime() < period.startDate.getTime()) {
      throw new BadRequestException(
        `Leaving date cannot be before the employment start (${formatDateOnlyUtc(period.startDate)})`,
      );
    }

    const contract = await this.activeContract(ctx.companyId, userId);
    if (contract && contract.startDate.getTime() > leavingDate.getTime()) {
      throw new BadRequestException(
        `The active contract ${contract.contractNumber} starts after the leaving date; adjust or delete it first`,
      );
    }

    const handoverRequired = await this.handoverRequirements(ctx.companyId, userId);
    const missing = missingHandover(handoverRequired, input.handover);
    if (missing.tiers.length + missing.leadership.length + missing.submittedRequests.length > 0) {
      throw new BadRequestException({
        message:
          'Complete the handover first: choose a replacement (or skip with a reason) for each approval and leadership role, and cancel or keep each pending request.',
        // The exception filter forwards `error` (as the code) and `details` only.
        error: 'HANDOVER_REQUIRED',
        details: { code: 'HANDOVER_REQUIRED', missing },
      });
    }
    await this.validateReplacements(ctx.companyId, userId, input.handover);

    const lockedRuns = await this.lockedRunsFrom(ctx.companyId, leavingDate);
    if (lockedRuns.length > 0 && !input.confirmLockedPayroll) {
      throw new ConflictException({
        message:
          'The leaving date falls in a payroll month that is already approved or paid. Confirm to continue; the run will be marked stale and payroll notified.',
        code: 'LOCKED_PAYROLL_CONFIRMATION_REQUIRED',
        lockedPayrollRuns: lockedRuns,
      });
    }

    const today = todayInAddisUtc();
    const effective = separationIsEffective(leavingDate, today);

    await this.prisma.$transaction(async (tx) => {
      await tx.employmentPeriod.update({
        where: { id: period.id },
        data: {
          endDate: leavingDate,
          separationType: input.separationType,
          separationReason: reason,
          separatedById: ctx.userId,
          separatedAt: new Date(),
          separationContractId: contract?.id ?? null,
          separationContractPrevEndDate: contract?.endDate ?? null,
          loginDisabledBySeparation: effective && user.isActive,
        },
      });
      if (contract) {
        await tx.employeeContract.update({
          where: { id: contract.id },
          data: {
            endDate: minDate(contract.endDate, leavingDate),
            terminatedAt: leavingDate,
            terminationReason: reason,
            status: effective ? EmployeeContractStatus.TERMINATED : contract.status,
            updatedBy: ctx.userId,
          },
        });
      }
      if (effective) {
        await tx.user.update({
          where: { id: userId },
          data: { employmentStatus: 'SEPARATED', isActive: false, updatedBy: ctx.userId },
        });
        await tx.userSession.deleteMany({ where: { userId } });
      }
    });

    await this.afterPayrollAffectingChange(ctx, user, leavingDate, lockedRuns, 'separated');
    const handoverResult = await this.applyHandover(
      ctx,
      userId,
      `${user.firstName} ${user.lastName}`.trim(),
      input.handover,
    );
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'users',
        action: 'separate',
        recordType: 'employment_period',
        recordId: period.id,
        afterValue: {
          employeeId: userId,
          leavingDate: formatDateOnlyUtc(leavingDate),
          separationType: input.separationType,
          reason,
          effectiveImmediately: effective,
          contractId: contract?.id ?? null,
          lockedPayrollRuns: lockedRuns.map((r) => r.runNumber),
          handover: handoverResult,
        },
      }),
    );
    this.logger.log(
      `[Separation] ${userId} leaving ${formatDateOnlyUtc(leavingDate)} (${input.separationType}); effective=${effective}`,
    );
    return this.getEmployment(ctx, userId);
  }

  /**
   * Change the leaving date on the current separation. HR can correct a wrong
   * date without cancelling and re-separating (cancel may be blocked by payroll).
   */
  async updateLeavingDate(
    ctx: Ctx,
    userId: string,
    input: UpdateLeavingDateInput,
  ): Promise<EmploymentState> {
    const leavingDate = this.parseLeavingDate(input.leavingDate);
    const user = await this.requireUser(ctx, userId);
    const period = await this.prisma.employmentPeriod.findFirst({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
    if (!period?.endDate || !period.separationType) {
      throw new BadRequestException('Employee has no separation to update');
    }
    if (leavingDate.getTime() === period.endDate.getTime()) {
      return this.getEmployment(ctx, userId);
    }
    if (leavingDate.getTime() < period.startDate.getTime()) {
      throw new BadRequestException(
        `Leaving date cannot be before the employment start (${formatDateOnlyUtc(period.startDate)})`,
      );
    }

    const lockedRuns = await this.lockedRunsFrom(ctx.companyId, leavingDate);
    if (lockedRuns.length > 0 && !input.confirmLockedPayroll) {
      throw new ConflictException({
        message:
          'The leaving date falls in a payroll month that is already approved or paid. Confirm to continue; the run will be marked stale and payroll notified.',
        code: 'LOCKED_PAYROLL_CONFIRMATION_REQUIRED',
        lockedPayrollRuns: lockedRuns,
      });
    }

    let linkedContract: { id: string; startDate: Date } | null = null;
    if (period.separationContractId) {
      linkedContract = await this.prisma.employeeContract.findFirst({
        where: { id: period.separationContractId, deletedAt: null },
        select: { id: true, startDate: true },
      });
      if (
        linkedContract &&
        linkedContract.startDate.getTime() > leavingDate.getTime()
      ) {
        throw new BadRequestException(
          `Leaving date cannot be before the contract start (${formatDateOnlyUtc(linkedContract.startDate)})`,
        );
      }
    }

    const previousLeavingDate = period.endDate;
    const today = todayInAddisUtc();
    const effective = separationIsEffective(leavingDate, today);
    const wasSeparated =
      user.employmentStatus === 'SEPARATED' || period.loginDisabledBySeparation;

    await this.prisma.$transaction(async (tx) => {
      await tx.employmentPeriod.update({
        where: { id: period.id },
        data: {
          endDate: leavingDate,
          loginDisabledBySeparation: effective && (wasSeparated || user.isActive),
        },
      });

      if (linkedContract) {
        await tx.employeeContract.update({
          where: { id: linkedContract.id },
          data: {
            endDate: minDate(period.separationContractPrevEndDate, leavingDate),
            terminatedAt: leavingDate,
            status: effective
              ? EmployeeContractStatus.TERMINATED
              : EmployeeContractStatus.ACTIVE,
            updatedBy: ctx.userId,
          },
        });
      }

      if (effective) {
        await tx.user.update({
          where: { id: userId },
          data: {
            employmentStatus: 'SEPARATED',
            isActive: false,
            updatedBy: ctx.userId,
          },
        });
        await tx.userSession.deleteMany({ where: { userId } });
      } else if (wasSeparated) {
        // Moved to a future leaving date: restore login until the date passes.
        await tx.user.update({
          where: { id: userId },
          data: {
            employmentStatus: 'ACTIVE',
            isActive: true,
            updatedBy: ctx.userId,
          },
        });
        await tx.employmentPeriod.update({
          where: { id: period.id },
          data: { loginDisabledBySeparation: false },
        });
      }
    });

    await this.afterPayrollAffectingChange(
      ctx,
      user,
      leavingDate,
      lockedRuns,
      'leaving date updated',
    );
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'users',
        action: 'update_leaving_date',
        recordType: 'employment_period',
        recordId: period.id,
        beforeValue: { leavingDate: formatDateOnlyUtc(previousLeavingDate) },
        afterValue: {
          employeeId: userId,
          leavingDate: formatDateOnlyUtc(leavingDate),
          effectiveImmediately: effective,
          lockedPayrollRuns: lockedRuns.map((r) => r.runNumber),
        },
      }),
    );
    this.logger.log(
      `[Separation] ${userId} leaving date ${formatDateOnlyUtc(previousLeavingDate)} → ${formatDateOnlyUtc(leavingDate)}; effective=${effective}`,
    );
    return this.getEmployment(ctx, userId);
  }

  async cancel(ctx: Ctx, userId: string): Promise<EmploymentState> {
    const user = await this.requireUser(ctx, userId);
    const period = await this.prisma.employmentPeriod.findFirst({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
    if (!period?.endDate) {
      throw new BadRequestException('Employee has no separation to cancel');
    }
    const blocked = await this.cancelBlockedReason(ctx.companyId, period.endDate);
    if (blocked) {
      throw new BadRequestException(blocked);
    }
    const leavingDate = period.endDate;

    await this.prisma.$transaction(async (tx) => {
      await tx.employmentPeriod.update({
        where: { id: period.id },
        data: {
          endDate: null,
          separationType: null,
          separationReason: null,
          separatedById: null,
          separatedAt: null,
          separationContractId: null,
          separationContractPrevEndDate: null,
          loginDisabledBySeparation: false,
        },
      });
      if (period.separationContractId) {
        const contract = await tx.employeeContract.findFirst({
          where: { id: period.separationContractId, deletedAt: null },
          select: { id: true, terminatedAt: true },
        });
        // Only undo our own change (a later manual termination stays).
        if (contract && contract.terminatedAt?.getTime() === leavingDate.getTime()) {
          await tx.employeeContract.update({
            where: { id: contract.id },
            data: {
              endDate: period.separationContractPrevEndDate,
              terminatedAt: null,
              terminationReason: null,
              status: EmployeeContractStatus.ACTIVE,
              updatedBy: ctx.userId,
            },
          });
        }
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          employmentStatus: 'ACTIVE',
          ...(period.loginDisabledBySeparation ? { isActive: true } : {}),
          updatedBy: ctx.userId,
        },
      });
    });

    await this.afterPayrollAffectingChange(ctx, user, leavingDate, [], 'separation cancelled');
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'users',
        action: 'cancel_separation',
        recordType: 'employment_period',
        recordId: period.id,
        beforeValue: {
          leavingDate: formatDateOnlyUtc(leavingDate),
          separationType: period.separationType,
          reason: period.separationReason,
        },
      }),
    );
    return this.getEmployment(ctx, userId);
  }

  /**
   * Daily job body: separations whose leaving date has passed turn login off,
   * revoke sessions and terminate the contract. Idempotent.
   */
  async processDueSeparations(now: Date = new Date()): Promise<{ processed: number; checked: number }> {
    const today = todayInAddisUtc(now);
    const due = await this.prisma.employmentPeriod.findMany({
      where: {
        endDate: { lt: today },
        separationType: { not: null },
        user: { deletedAt: null },
      },
      include: {
        user: { select: { id: true, companyId: true, isActive: true, employmentStatus: true } },
      },
    });

    let processed = 0;
    for (const period of due) {
      const later = await this.prisma.employmentPeriod.count({
        where: { userId: period.userId, startDate: { gt: period.endDate! } },
      });
      if (later > 0) continue; // rehired since - this period is history

      const contract = period.separationContractId
        ? await this.prisma.employeeContract.findFirst({
            where: { id: period.separationContractId, deletedAt: null },
            select: { id: true, status: true },
          })
        : null;
      const contractNeedsTerminate = contract?.status === EmployeeContractStatus.ACTIVE;
      const needsWork =
        period.user.isActive ||
        period.user.employmentStatus !== 'SEPARATED' ||
        contractNeedsTerminate;
      if (!needsWork) continue;

      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: period.userId },
          data: { isActive: false, employmentStatus: 'SEPARATED' },
        });
        if (period.user.isActive) {
          await tx.employmentPeriod.update({
            where: { id: period.id },
            data: { loginDisabledBySeparation: true },
          });
        }
        await tx.userSession.deleteMany({ where: { userId: period.userId } });
        if (contract && contractNeedsTerminate) {
          await tx.employeeContract.update({
            where: { id: contract.id },
            data: { status: EmployeeContractStatus.TERMINATED },
          });
        }
      });
      await this.audit.create({
        companyId: period.user.companyId,
        source: AuditLogSource.SYSTEM_JOB,
        module: 'users',
        action: 'separation_effective',
        recordType: 'employment_period',
        recordId: period.id,
        afterValue: {
          employeeId: period.userId,
          leavingDate: formatDateOnlyUtc(period.endDate!),
          loginDisabled: period.user.isActive,
          contractTerminated: contractNeedsTerminate,
        },
      });
      processed += 1;
    }
    return { processed, checked: due.length };
  }

  // ── handover ────────────────────────────────────────────────────────────

  async handoverRequirements(companyId: string, userId: string): Promise<HandoverRequirements> {
    const [tiers, departments, disciplines, roles, submitted] = await Promise.all([
      this.prisma.approvalTier.findMany({
        where: {
          approverId: userId,
          decision: 'PENDING',
          request: { companyId, deletedAt: null, status: { in: [...PENDING_REQUEST_STATUSES] } },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          label: true,
          request: { select: { id: true, requestNumber: true, title: true } },
        },
      }),
      this.prisma.department.findMany({
        where: { companyId, leaderUserId: userId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.discipline.findMany({
        where: { companyId, leaderId: userId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.userRole.findMany({
        where: {
          userId,
          deletedAt: null,
          role: { companyId, deletedAt: null, name: { in: [...APPROVER_ROLE_NAMES] } },
        },
        select: { role: { select: { id: true, name: true } } },
      }),
      this.prisma.approvalRequest.findMany({
        where: {
          companyId,
          deletedAt: null,
          requestedBy: userId,
          status: { in: [...PENDING_REQUEST_STATUSES] },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, requestNumber: true, title: true, status: true },
      }),
    ]);
    return {
      tiers: tiers.map((t) => ({
        tierId: t.id,
        requestId: t.request.id,
        requestNumber: t.request.requestNumber,
        title: t.request.title,
        tierLabel: t.label,
      })),
      leadership: [
        ...departments.map((d) => ({ kind: 'DEPARTMENT_LEADER' as const, id: d.id, name: d.name })),
        ...disciplines.map((d) => ({ kind: 'DISCIPLINE_LEADER' as const, id: d.id, name: d.name })),
        ...roles.map((r) => ({ kind: 'ROLE' as const, id: r.role.id, name: r.role.name })),
      ],
      submittedRequests: submitted.map((r) => ({
        requestId: r.id,
        requestNumber: r.requestNumber,
        title: r.title,
        status: r.status,
      })),
    };
  }

  private async validateReplacements(
    companyId: string,
    leaverId: string,
    handover: HandoverInput | undefined,
  ): Promise<void> {
    const ids = new Set<string>();
    for (const d of [...(handover?.tiers ?? []), ...(handover?.leadership ?? [])]) {
      if (d.replacementId) ids.add(d.replacementId);
    }
    if (ids.has(leaverId)) {
      throw new BadRequestException('The person leaving cannot be their own replacement');
    }
    if (ids.size === 0) return;
    const users = await this.prisma.user.findMany({
      where: activeOnly({ companyId, id: { in: [...ids] } }),
      select: { id: true, isActive: true, employmentStatus: true },
    });
    const ok = new Set(users.filter((u) => !isVacantApprover(u)).map((u) => u.id));
    const bad = [...ids].filter((id) => !ok.has(id));
    if (bad.length > 0) {
      throw new BadRequestException('Every replacement must be an active employee');
    }
  }

  private async applyHandover(
    ctx: Ctx,
    leaverId: string,
    leaverName: string,
    handover: HandoverInput | undefined,
  ): Promise<{ reassignedTiers: number; leadershipChanged: number; cancelledRequests: number; skipped: string[] }> {
    const result = { reassignedTiers: 0, leadershipChanged: 0, cancelledRequests: 0, skipped: [] as string[] };
    const reason = `Handover: ${leaverName} is leaving`;
    for (const d of handover?.tiers ?? []) {
      if (d.replacementId) {
        await this.reassignment.reassignTier(ctx, d.id, d.replacementId, reason, {
          skipPermissionCheck: true,
        });
        result.reassignedTiers += 1;
      } else {
        result.skipped.push(`tier ${d.id}: ${d.skipReason}`);
      }
    }
    for (const d of handover?.leadership ?? []) {
      if (!d.replacementId) {
        result.skipped.push(`${d.kind} ${d.id}: ${d.skipReason}`);
        continue;
      }
      if (d.kind === 'DEPARTMENT_LEADER') {
        await this.prisma.department.updateMany({
          where: { id: d.id, companyId: ctx.companyId, leaderUserId: leaverId },
          data: { leaderUserId: d.replacementId },
        });
      } else if (d.kind === 'DISCIPLINE_LEADER') {
        await this.prisma.discipline.updateMany({
          where: { id: d.id, companyId: ctx.companyId, leaderId: leaverId },
          data: { leaderId: d.replacementId },
        });
      } else {
        const existing = await this.prisma.userRole.findFirst({
          where: { userId: d.replacementId, roleId: d.id, deletedAt: null },
          select: { id: true },
        });
        // HR chains resolve these roles by *primary* role assignment.
        const hasPrimary = await this.prisma.userRole.count({
          where: { userId: d.replacementId, isPrimary: true, deletedAt: null },
        });
        if (!existing) {
          await this.prisma.userRole.create({
            data: {
              userId: d.replacementId,
              roleId: d.id,
              isPrimary: hasPrimary === 0,
              assignedBy: ctx.userId,
              createdBy: ctx.userId,
              updatedBy: ctx.userId,
            },
          });
        }
        if (hasPrimary > 0) {
          result.skipped.push(
            `ROLE ${d.id}: given to the replacement as a secondary role; approval chains use primary roles, so change their primary role if they should approve`,
          );
        }
      }
      result.leadershipChanged += 1;
    }
    for (const r of handover?.submittedRequests ?? []) {
      if (r.action !== 'CANCEL') continue;
      const current = await this.prisma.approvalTier.findFirst({
        where: {
          requestId: r.requestId,
          decision: 'PENDING',
          request: { companyId: ctx.companyId, requestedBy: leaverId },
        },
        orderBy: { tierOrder: 'asc' },
        select: { id: true },
      });
      if (!current) continue;
      // System rejection runs the domain listeners (leave, overtime, …) like a normal decision.
      await this.approvals.rejectTier(
        r.requestId,
        current.id,
        ctx.userId,
        `Cancelled at separation of ${leaverName}`,
        { bypassApproverCheck: true },
      );
      result.cancelledRequests += 1;
    }
    return result;
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private parseLeavingDate(raw: string): Date {
    const date = parseDateOnlyUtc(raw ?? '');
    if (!date) {
      throw new BadRequestException('leavingDate must be a date (YYYY-MM-DD)');
    }
    return date;
  }

  private async requireUser(ctx: Ctx, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employmentDate: true,
        employmentStatus: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Users that predate the backfill get their open period on first separation. */
  private async findOrCreateOpenPeriod(
    ctx: Ctx,
    user: { id: string; employmentDate: Date | null; createdAt: Date },
  ): Promise<EmploymentPeriod> {
    const open = await this.prisma.employmentPeriod.findFirst({
      where: { userId: user.id, endDate: null },
      orderBy: { startDate: 'desc' },
    });
    if (open) return open;
    const anyPeriod = await this.prisma.employmentPeriod.count({ where: { userId: user.id } });
    if (anyPeriod > 0) {
      throw new BadRequestException('Employee has no open employment period (already separated)');
    }
    const firstContract = await this.prisma.employeeContract.findFirst({
      where: { employeeId: user.id, deletedAt: null },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    });
    const startDate =
      user.employmentDate ??
      firstContract?.startDate ??
      new Date(Date.UTC(user.createdAt.getUTCFullYear(), user.createdAt.getUTCMonth(), user.createdAt.getUTCDate()));
    return this.prisma.employmentPeriod.create({
      data: { companyId: ctx.companyId, userId: user.id, startDate, createdBy: ctx.userId },
    });
  }

  private activeContract(companyId: string, userId: string) {
    return this.prisma.employeeContract.findFirst({
      where: activeOnly({ companyId, employeeId: userId, status: EmployeeContractStatus.ACTIVE }),
      orderBy: { startDate: 'desc' },
      select: { id: true, contractNumber: true, startDate: true, endDate: true, status: true },
    });
  }

  /** Approved / paid runs from the leaving month up to the current month. */
  async lockedRunsFrom(companyId: string, leavingDate: Date): Promise<LockedPayrollRun[]> {
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: [...LOCKED_PAYROLL_STATUSES] },
        OR: [
          { year: { gt: leavingDate.getUTCFullYear() } },
          { year: leavingDate.getUTCFullYear(), month: { gte: leavingDate.getUTCMonth() + 1 } },
        ],
      },
      select: { id: true, runNumber: true, month: true, year: true, status: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    return runs;
  }

  private async cancelBlockedReason(companyId: string, leavingDate: Date): Promise<string | null> {
    if (!separationIsEffective(leavingDate, todayInAddisUtc())) {
      return null;
    }
    const locked = await this.lockedRunsFrom(companyId, leavingDate);
    if (locked.length === 0) return null;
    return `Cannot cancel: payroll ${locked.map((r) => r.runNumber).join(', ')} is already approved or paid for the affected months`;
  }

  private async pendingApprovalTiers(companyId: string, userId: string) {
    const where: Prisma.ApprovalTierWhereInput = {
      approverId: userId,
      decision: 'PENDING',
      request: { companyId, deletedAt: null, status: { in: [...PENDING_REQUEST_STATUSES] } },
    };
    const [count, rows] = await Promise.all([
      this.prisma.approvalTier.count({ where }),
      this.prisma.approvalTier.findMany({
        where,
        take: LIST_LIMIT,
        orderBy: { createdAt: 'asc' },
        select: {
          label: true,
          request: { select: { id: true, requestNumber: true, title: true } },
        },
      }),
    ]);
    return {
      count,
      items: rows.map((r) => ({
        requestId: r.request.id,
        requestNumber: r.request.requestNumber,
        title: r.request.title,
        tierLabel: r.label,
      })),
    };
  }

  private async pendingSubmittedRequests(companyId: string, userId: string) {
    const where: Prisma.ApprovalRequestWhereInput = {
      companyId,
      deletedAt: null,
      requestedBy: userId,
      status: { in: [...PENDING_REQUEST_STATUSES] },
    };
    const [count, rows] = await Promise.all([
      this.prisma.approvalRequest.count({ where }),
      this.prisma.approvalRequest.findMany({
        where,
        take: LIST_LIMIT,
        orderBy: { createdAt: 'asc' },
        select: { id: true, requestNumber: true, title: true, status: true },
      }),
    ]);
    return {
      count,
      items: rows.map((r) => ({
        requestId: r.id,
        requestNumber: r.requestNumber,
        title: r.title,
        status: r.status,
      })),
    };
  }

  /** Marks every payroll run from the leaving month onward stale; notifies payroll for locked ones. */
  private async afterPayrollAffectingChange(
    ctx: Ctx,
    employee: { id: string; firstName: string; lastName: string },
    leavingDate: Date,
    lockedRuns: LockedPayrollRun[],
    verb: string,
  ): Promise<void> {
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        OR: [
          { year: { gt: leavingDate.getUTCFullYear() } },
          { year: leavingDate.getUTCFullYear(), month: { gte: leavingDate.getUTCMonth() + 1 } },
        ],
      },
      select: { month: true, year: true, createdBy: true },
    });
    for (const run of runs) {
      await markPayrollAttendanceSnapshotStale(this.prisma, ctx.companyId, run.month, run.year);
    }
    if (lockedRuns.length === 0) return;

    const roleHolders = await this.prisma.userRole.findMany({
      where: {
        deletedAt: null,
        role: { companyId: ctx.companyId, deletedAt: null, name: { in: [...PAYROLL_NOTIFY_ROLES] } },
        user: { companyId: ctx.companyId, isActive: true, deletedAt: null },
      },
      select: { userId: true },
    });
    const recipients = new Set<string>(roleHolders.map((r) => r.userId));
    for (const run of runs) recipients.add(run.createdBy);
    recipients.delete(ctx.userId);

    const name = `${employee.firstName} ${employee.lastName}`.trim();
    const runList = lockedRuns.map((r) => r.runNumber).join(', ');
    for (const recipientId of recipients) {
      try {
        await this.notifications.send(ctx, {
          recipientId,
          eventType: 'payroll.employee_separation_after_approval',
          subject: `Payroll affected: ${name} ${verb}`,
          body: `${name} was ${verb} with leaving date ${formatDateOnlyUtc(leavingDate)}, inside already approved/paid payroll (${runList}). The run is marked stale - review and recalculate if needed.`,
          link: `/payroll/runs/${lockedRuns[0].id}`,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to notify ${recipientId} about separation of ${employee.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
