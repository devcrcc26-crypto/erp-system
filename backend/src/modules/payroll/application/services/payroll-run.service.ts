import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type EmployeeContract,
  type EmployeeType,
  type Nationality,
  type PayrollEntry,
  type PayrollEntryFlag,
  type PayrollRun,
} from '@prisma/client';
import { isTrueSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import { Decimal } from '@prisma/client/runtime/library';
import { randomUUID } from 'crypto';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import { EffectiveSalaryService } from './effective-salary.service';
import {
  PAYROLL_CONSIDER_ATTENDANCE_KEY,
  parseConsiderAttendance,
} from './payroll-company-settings.service';
import {
  PayrollCalculationService,
  type OvertimeHours,
  type PayrollCalculationResult,
} from './payroll-calculation.service';
import {
  FULLY_ABSENT_NO_PAY_NOTE,
  isFullyAbsentFromStoredLogs,
} from '../../../attendance/application/utils/day-deduction.util';
import { resolveEntryAttendanceFlag } from '../utils/payroll-attendance-flag.util';
import {
  allocateContractPayrollDays,
  employedPayrollDays,
  PAYROLL_MONTH_DAYS,
  resolveEmploymentSegmentsForMonth,
} from '../utils/payroll-days.util';
import { computeContractAllowances } from '../utils/payroll-allowance.util';
import {
  effectiveContractEnd,
  employedInMonthWhere,
  loadEmploymentWindows,
  withContractHoldover,
  type EmploymentWindow,
} from '../../../../shared/employment/employment-window.util';
import {
  inactiveDaysByType,
  loadInactiveSpansForMonth,
  type InactiveSpan,
} from '../../../../shared/employment/inactive-period.util';
import {
  employmentReviewFlag,
  resolveEmploymentEntryFlag,
  type EmploymentReviewFlag,
} from '../utils/payroll-employment-flag.util';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  computeFinalSettlement,
  unusedLeaveDaysAtLeaving,
} from '../utils/payroll-final-settlement.util';
import { LeaveLedgerService } from '../../../leave-policy/application/services/leave-ledger.service';
import { getPolicy, loadPolicySnapshot } from '../../../../shared/policy/policy-reader.util';
import type { PolicyValues } from '../../../../shared/policy/policy-definitions';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import {
  assignOvertimeToSalaryPeriods,
  buildOvertimeDayContext,
  datedEntryFromExactMinutes,
  formatOvertimeTimeHhMm,
  OT_FALLBACK_MONTH_END_NOTE,
  OVERNIGHT_OT_DATE_ASSIGNMENT,
  overtimeEndTimeLabel,
  type DatedOvertimeEntry,
  type OvertimeWeekdaySlice,
} from '../utils/payroll-overtime.util';
import {
  combineManualOvertimeByContracts,
  type AppliedManualOt,
  type ManualOtAdjustmentInput,
} from '../utils/payroll-ot-adjustment.util';
import {
  unpaidLeaveDateKeysInRange,
  unpaidLeaveDaysStillToDeduct,
} from '../utils/payroll-unpaid-leave.util';

/** Documented overnight assignment rule for payroll (see payroll-overtime.util). */
export { OVERNIGHT_OT_DATE_ASSIGNMENT };

interface ServiceContext {
  userId: string;
  companyId: string;
}

interface GetRunOptions {
  maskBank?: boolean;
  /** Adds hasOverride to each entry. HR only: approvers and employees never see it. */
  includeOverrides?: boolean;
}

export interface PayrollEntryAuditRecord {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string | null;
  changedAt: Date;
  changedBy: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    chineseName: string | null;
  };
}

interface SubmitRunOptions {
  acknowledgeFlags?: boolean;
  /** Number of employment-flagged entries HR confirms having reviewed. */
  confirmEmploymentReview?: number;
}

interface ApproveRunOptions {
  /** Number of employment-flagged entries the approver confirms having reviewed. */
  confirmEmploymentReview?: number;
}

export interface EmploymentReviewEntry {
  entryId: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  flag: EmploymentReviewFlag;
  flagNote: string | null;
}

interface CapturedTopUp {
  bonusTopUp: number;
  bonusTopUpReason: string | null;
  netTopUp: number;
  netTopUpReason: string | null;
  notes: string | null;
}

interface ContractSnapshot {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date | null;
  status: EmployeeContract['status'];
  basicSalary: Decimal | null;
  transportationAllowance: Decimal | null;
  monthlyBonus: Decimal | null;
  monthlyNetBonus: Decimal;
  pensionApplicable: boolean;
  taxApplicable: boolean;
}

interface EmployeeSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  employeeType: EmployeeType | null;
  nationality: Nationality | null;
  employmentDate: Date | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  isActive: boolean;
}

interface AttendanceSnapshot {
  id: string;
  employeeId: string;
  scheduledDays: Decimal;
  presentDays: Decimal;
  absentDays: Decimal;
  paidDays: Decimal;
  unpaidLeaveDays?: Decimal | number | null;
  /** NEEDS_ENROLMENT → counted present, non-blocking note on the entry. */
  matchMethod: string;
  /** REPORT_ONLY early-departure would-deduct total (not applied to paid days). */
  earlyDepartureWouldDeductDays?: Decimal | number | null;
  /** Daily logs used to detect fully-absent duty-day months. */
  dailyLogs: Array<{
    date: Date;
    dayDeduction: Decimal;
    isHoliday: boolean;
    isWeekend: boolean;
    isHalfDay?: boolean;
    dayStatus?: string | null;
  }>;
}

interface OvertimeSnapshot {
  id: string;
  employeeId: string;
  totalRegularHours: Decimal | null;
  totalNightHours: Decimal | null;
  totalWeekendHours: Decimal | null;
  totalHolidayHours: Decimal | null;
  entries: Array<{
    date: Date;
    startTime: Date;
    endTime: Date;
    endsAtEndOfDay: boolean;
    isHoliday: boolean;
    isOvernight: boolean;
    regularHours: Decimal;
    nightHours: Decimal;
    weekendHours: Decimal;
    holidayHours: Decimal;
    /** > 0 when the entry was priced as a site-assignment day. */
    siteWithinScheduleHours: Decimal;
  }>;
}

interface SalaryPeriodDraft {
  id: string;
  entryId: string;
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  days: number;
  basicSalary: number;
  earnedSalary: number;
  normalOtHours: number;
  eveningOtHours: number;
  sundayOtHours: number;
  holidayOtHours: number;
  normalOtPay: number;
  eveningOtPay: number;
  sundayOtPay: number;
  holidayOtPay: number;
  totalOtPay: number;
}

interface EntryDraft {
  entry: Prisma.PayrollEntryCreateManyInput;
  salaryPeriods: SalaryPeriodDraft[];
  /**
   * What each manual (paper-based) OT adjustment of this employee added to the
   * entry; zero when not applied (e.g. 0 paid days). Saved on the adjustments.
   */
  manualOt?: Array<AppliedManualOt & { contractId: string }>;
}

type ManualOtWithContract = ManualOtAdjustmentInput & { contractId: string };

interface DateWindow {
  windowStart: Date;
  windowEnd: Date;
}

/** Figures an override to 0 days clears, kept so raising the days again can restore them. */
interface ZeroDaysSnapshot {
  contractNetBonus: number;
  bonusTopUp: number;
  bonusTopUpReason: string | null;
  netTopUp: number;
  netTopUpReason: string | null;
  normalOtHours: number;
  eveningOtHours: number;
  sundayOtHours: number;
  holidayOtHours: number;
  normalOtPay: number;
  eveningOtPay: number;
  sundayOtPay: number;
  holidayOtPay: number;
  /** Contract split by salary period id (stored period days are 0 at zero days). */
  allocatedDays: Record<string, number>;
}

const PAYROLL_DAYS_AUDIT_FIELD = 'payrollDays';
/** Internal audit row (oldValue = ZeroDaysSnapshot JSON); not part of the history shown to HR. */
const ZERO_DAYS_SNAPSHOT_AUDIT_FIELD = 'zeroDaysSnapshot';

const ENTRY_WRITE_CHUNK = 50;

const HR_MANAGER_ROLE = 'HR Manager';
const LOCAL_HR_MANAGER_ROLE = 'Local HR Manager';
const GENERAL_MANAGER_ROLE = 'General Manager';

@Injectable()
export class PayrollRunService {
  private readonly logger = new Logger(PayrollRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: PayrollCalculationService,
    private readonly notifications: NotificationService,
    private readonly workScheduleService: WorkScheduleService,
    private readonly leaveLedger: LeaveLedgerService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
    private readonly effectiveSalary: EffectiveSalaryService,
  ) {}

  /**
   * Entries HR must look at before the run moves on: contract ended without
   * renewal, login disabled while employed, leaver final month, inactive in month.
   */
  async employmentReviewEntries(runId: string, companyId: string): Promise<EmploymentReviewEntry[]> {
    await this.requireRun(runId, companyId);
    const entries = await this.prisma.payrollEntry.findMany({
      where: { runId, companyId },
      select: {
        id: true,
        flag: true,
        flagNote: true,
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
      orderBy: { employee: { firstName: 'asc' } },
    });
    const result: EmploymentReviewEntry[] = [];
    for (const entry of entries) {
      const flag = employmentReviewFlag(entry);
      if (!flag) continue;
      result.push({
        entryId: entry.id,
        employeeId: entry.employee.id,
        employeeCode: entry.employee.employeeId,
        employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`.trim(),
        flag,
        flagNote: entry.flagNote,
      });
    }
    return result;
  }

  /**
   * Blocks the transition until the actor confirms the current number of
   * employment-flagged entries, then records the confirmation on the run.
   */
  private async assertEmploymentReviewConfirmed(
    run: PayrollRun,
    ctx: ServiceContext,
    step: 'submit' | 'approve' | 'gm_approve',
    confirmed: number | undefined,
  ): Promise<void> {
    const entries = await this.employmentReviewEntries(run.id, ctx.companyId);
    if (entries.length === 0) return;
    if (confirmed !== entries.length) {
      throw new BadRequestException({
        message: `Review the ${entries.length} employee(s) with employment flags and confirm before continuing`,
        error: 'EMPLOYMENT_REVIEW_REQUIRED',
        details: { code: 'EMPLOYMENT_REVIEW_REQUIRED', count: entries.length, entries },
      });
    }
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'employment_review_confirmed',
        recordType: 'PayrollRun',
        recordId: run.id,
        recordReference: run.runNumber,
        afterValue: {
          step,
          count: entries.length,
          entries: entries.map((e) => ({
            employeeId: e.employeeId,
            employeeCode: e.employeeCode,
            employeeName: e.employeeName,
            flag: e.flag,
          })),
        },
      }),
    );
  }

  /**
   * Creates a DRAFT payroll run for the month/year, or reuses a CANCELLED one.
   */
  async createRun(
    month: number,
    year: number,
    ctx: ServiceContext,
    notes?: string,
    considerAttendance?: boolean,
  ): Promise<PayrollRun> {
    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }
    // Per-run choice, else the company default for new runs.
    const attendanceOn =
      considerAttendance ?? (await this.defaultConsiderAttendance(ctx.companyId));

    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        companyId: ctx.companyId,
        month,
        year,
        type: 'REGULAR',
        deletedAt: null,
      },
    });

    let runId: string;

    if (existing) {
      if (existing.status !== 'CANCELLED') {
        throw new BadRequestException(
          `Payroll run for ${month}/${year} already exists`,
        );
      }

      await this.prisma.payrollSalaryPeriod.deleteMany({
        where: { entry: { runId: existing.id } },
      });
      await this.prisma.payrollEntry.deleteMany({
        where: { runId: existing.id },
      });

      await this.prisma.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: 'DRAFT',
          notes: notes ?? existing.notes,
          considerAttendance: attendanceOn,
          totalEmployees: 0,
          totalGross: new Decimal(0),
          totalNetPay: new Decimal(0),
          totalNetBonus: new Decimal(0),
          totalPensionEmp: new Decimal(0),
          totalPensionEmr: new Decimal(0),
          totalTax: new Decimal(0),
          submittedAt: null,
          submittedBy: null,
          approvedAt: null,
          approvedBy: null,
          gmApprovedAt: null,
          gmApprovedBy: null,
          paidAt: null,
          paidBy: null,
          updatedBy: ctx.userId,
        },
      });

      runId = existing.id;
      this.logger.log(
        `[PayrollRun] Reused CANCELLED run ${existing.runNumber} for ${month}/${year}`,
      );
    } else {
      const runNumber = this.generateRunNumber(month, year);
      const run = await this.prisma.payrollRun.create({
        data: {
          id: randomUUID(),
          companyId: ctx.companyId,
          runNumber,
          month,
          year,
          type: 'REGULAR',
          status: 'DRAFT',
          notes: notes ?? null,
          considerAttendance: attendanceOn,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      runId = run.id;
      this.logger.log(
        `[PayrollRun] Created run ${runNumber} for ${month}/${year}`,
      );
    }

    await this.generateEntries(runId, ctx);
    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Bulk-generates payroll entries for a run (target &lt;10s for ~150 employees).
   */
  async generateEntries(
    runId: string,
    ctx: ServiceContext,
  ): Promise<PayrollRun> {
    const started = Date.now();
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    const includeFreelancerIds = await this.includedFreelancerIds(runId);

    await this.prisma.payrollSalaryPeriod.deleteMany({
      where: { entry: { runId } },
    });
    await this.prisma.payrollEntry.deleteMany({ where: { runId } });

    const drafts = await this.buildEntryDrafts(run, ctx, new Map(), {
      includeFreelancerIds,
    });
    await this.persistEntryDrafts(drafts, ctx);
    await this.updateRunTotals(runId, ctx);

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        attendanceSnapshotStale: false,
        policyReviewRequired: false,
        policyReviewNote: null,
        updatedBy: ctx.userId,
      } as Prisma.PayrollRunUpdateInput,
    });

    const elapsedMs = Date.now() - started;
    this.logger.log(
      `[PayrollRun] Generated ${drafts.length} entries for ${run.runNumber} in ${elapsedMs}ms`,
    );

    return this.getRun(runId, ctx.companyId);
  }

  /** Company default for new runs (company_setting, module payroll). */
  private async defaultConsiderAttendance(companyId: string): Promise<boolean> {
    const row = await this.prisma.companySetting.findFirst({
      where: {
        companyId,
        module: 'payroll',
        key: PAYROLL_CONSIDER_ATTENDANCE_KEY,
        deletedAt: null,
      },
      select: { value: true },
    });
    return parseConsiderAttendance(row?.value);
  }

  /**
   * Run settings on a DRAFT / REVIEWED run. Changing whether attendance is
   * considered recalculates the run so every entry uses the new basis.
   */
  async updateRunSettings(
    runId: string,
    dto: { considerAttendance?: boolean; notes?: string },
    ctx: ServiceContext,
  ): Promise<PayrollRun> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    if (run.status !== 'DRAFT' && run.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Run settings can only change in DRAFT or REVIEWED status (now ${run.status})`,
      );
    }
    const attendanceChanged =
      dto.considerAttendance !== undefined &&
      dto.considerAttendance !== run.considerAttendance;

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        ...(attendanceChanged ? { considerAttendance: dto.considerAttendance } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        updatedBy: ctx.userId,
      },
    });

    if (attendanceChanged) {
      await this.audit.create(
        this.audit.buildFromRequestContext({
          userId: ctx.userId,
          companyId: ctx.companyId,
          module: 'payroll',
          action: 'run_consider_attendance_changed',
          recordType: 'PayrollRun',
          recordId: runId,
          recordReference: run.runNumber,
          beforeValue: { considerAttendance: run.considerAttendance },
          afterValue: { considerAttendance: dto.considerAttendance },
        }),
      );
      return this.recalculate(runId, ctx);
    }
    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Recalculates any unpaid run, preserving bonus top-ups, notes and the
   * freelancers HR added. A run already in the approval chain goes back to DRAFT.
   */
  async recalculate(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const started = Date.now();
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    this.assertRunEditable(run);

    const includeFreelancerIds = await this.includedFreelancerIds(runId);

    const existingEntries = await this.prisma.payrollEntry.findMany({
      where: { runId },
      select: {
        id: true,
        employeeId: true,
        payrollDays: true,
        bonusTopUp: true,
        bonusTopUpReason: true,
        netTopUp: true,
        netTopUpReason: true,
        notes: true,
      },
    });

    const captured = new Map<string, CapturedTopUp>();
    for (const entry of existingEntries) {
      // A 0-day override clears top-ups from the entry; its snapshot still has them.
      const zeroSnapshot =
        this.toNumber(entry.payrollDays) === 0
          ? await this.latestZeroDaysSnapshot(entry.id, ctx.companyId)
          : null;
      const bonusTopUp = zeroSnapshot?.bonusTopUp ?? this.toNumber(entry.bonusTopUp);
      const bonusTopUpReason = zeroSnapshot
        ? zeroSnapshot.bonusTopUpReason
        : entry.bonusTopUpReason;
      const netTopUp = zeroSnapshot?.netTopUp ?? this.toNumber(entry.netTopUp);
      const netTopUpReason = zeroSnapshot ? zeroSnapshot.netTopUpReason : entry.netTopUpReason;
      if (
        bonusTopUp !== 0 ||
        bonusTopUpReason != null ||
        netTopUp !== 0 ||
        netTopUpReason != null ||
        entry.notes != null
      ) {
        captured.set(entry.employeeId, {
          bonusTopUp,
          bonusTopUpReason,
          netTopUp,
          netTopUpReason,
          notes: entry.notes,
        });
      }
    }

    await this.prisma.payrollSalaryPeriod.deleteMany({
      where: { entry: { runId } },
    });
    await this.prisma.payrollEntry.deleteMany({ where: { runId } });

    // Regenerate without top-ups, then reapply captured adjustments.
    const drafts = await this.buildEntryDrafts(run, ctx, new Map(), {
      includeFreelancerIds,
    });
    await this.persistEntryDrafts(drafts, ctx);

    if (captured.size > 0) {
      const topUpEntries = await this.prisma.payrollEntry.findMany({
        where: {
          runId,
          employeeId: { in: [...captured.keys()] },
        },
      });

      for (const entry of topUpEntries) {
        const topUp = captured.get(entry.employeeId);
        if (!topUp) {
          continue;
        }

        if (topUp.bonusTopUp === 0 && topUp.netTopUp === 0) {
          await this.prisma.payrollEntry.update({
            where: { id: entry.id },
            data: {
              bonusTopUpReason: topUp.bonusTopUpReason,
              netTopUpReason: topUp.netTopUpReason,
              notes: topUp.notes ?? entry.notes,
              updatedBy: ctx.userId,
            },
          });
          continue;
        }

        const result = await this.recalcEntryAmounts(entry, run, {
          bonusTopUp: topUp.bonusTopUp,
          netTopUp: topUp.netTopUp,
        });
        await this.prisma.payrollEntry.update({
          where: { id: entry.id },
          data: {
            bonusTopUp: new Decimal(topUp.bonusTopUp),
            bonusTopUpReason: topUp.bonusTopUpReason,
            netTopUp: new Decimal(topUp.netTopUp),
            netTopUpReason: topUp.netTopUpReason,
            notes: topUp.notes ?? entry.notes,
            ...this.calculationToEntryUpdate(result),
            updatedBy: ctx.userId,
          },
        });
      }
    }

    await this.updateRunTotals(runId, ctx);

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        attendanceSnapshotStale: false,
        policyReviewRequired: false,
        policyReviewNote: null,
        updatedBy: ctx.userId,
      } as Prisma.PayrollRunUpdateInput,
    });
    await this.reopenIfInApproval(run, ctx);

    const elapsedMs = Date.now() - started;
    this.logger.log(
      `[PayrollRun] Recalculated ${run.runNumber} (${drafts.length} entries) in ${elapsedMs}ms`,
    );

    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Freelancers HR can still add to the run (active, on the payroll roster, not yet in it).
   */
  async listAvailableFreelancers(
    runId: string,
    ctx: ServiceContext,
  ): Promise<
    Array<{
      id: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      chineseName: string | null;
      employeeId: string | null;
    }>
  > {
    await this.requireRun(runId, ctx.companyId);
    return this.prisma.user.findMany({
      where: hrProcessEmployeeWhere({
        companyId: ctx.companyId,
        isActive: true,
        includeInPayroll: true,
        deletedAt: null,
        employeeType: 'FREELANCER' as EmployeeType,
        payrollEntriesAsEmplyee: { none: { runId } },
      }),
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        chineseName: true,
        employeeId: true,
      },
      orderBy: { firstName: 'asc' },
    });
  }

  /**
   * Adds freelancers to an unpaid run. A run already in the approval chain goes back to DRAFT.
   */
  async addFreelancers(
    runId: string,
    employeeIds: string[],
    ctx: ServiceContext,
  ): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    this.assertRunEditable(run);

    const ids = [...new Set(employeeIds)];
    const available = await this.listAvailableFreelancers(runId, ctx);
    const availableIds = new Set(available.map((u) => u.id));
    const invalid = ids.filter((id) => !availableIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        'Only active freelancers on the payroll roster who are not already in this run can be added',
      );
    }

    const drafts = await this.buildEntryDrafts(run, ctx, new Map(), {
      includeFreelancerIds: new Set(ids),
      onlyEmployeeIds: ids,
    });
    await this.persistEntryDrafts(drafts, ctx);
    await this.updateRunTotals(runId, ctx);
    await this.reopenIfInApproval(run, ctx);

    this.logger.log(
      `[PayrollRun] Added ${drafts.length} freelancer(s) to ${run.runNumber}`,
    );
    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Removes a freelancer's entry from an unpaid run. Regular employees are
   * generated automatically and cannot be removed here.
   */
  async removeFreelancerEntry(
    runId: string,
    entryId: string,
    ctx: ServiceContext,
  ): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    this.assertRunEditable(run);

    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, runId, companyId: ctx.companyId },
      select: { id: true, employee: { select: { employeeType: true } } },
    });
    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }
    if (entry.employee.employeeType !== 'FREELANCER') {
      throw new BadRequestException('Only freelancer entries can be removed from a run');
    }

    await this.prisma.payrollEntry.delete({ where: { id: entryId } });
    await this.updateRunTotals(runId, ctx);
    await this.reopenIfInApproval(run, ctx);
    return this.getRun(runId, ctx.companyId);
  }

  private assertRunEditable(run: PayrollRun): void {
    if (
      run.status === 'PAID' ||
      run.status === 'CANCELLED' ||
      run.status === 'SUPERSEDED'
    ) {
      throw new BadRequestException(`Cannot change a run in ${run.status} status`);
    }
  }

  private async includedFreelancerIds(runId: string): Promise<Set<string>> {
    const rows = await this.prisma.payrollEntry.findMany({
      where: { runId, employee: { employeeType: 'FREELANCER' } },
      select: { employeeId: true },
    });
    return new Set(rows.map((r) => r.employeeId));
  }

  /**
   * Changed figures invalidate prior sign-off: SUBMITTED / APPROVED / GM_APPROVED
   * go back to DRAFT and must pass review and both approvals again.
   */
  private async reopenIfInApproval(run: PayrollRun, ctx: ServiceContext): Promise<void> {
    if (
      run.status !== 'SUBMITTED' &&
      run.status !== 'APPROVED' &&
      run.status !== 'GM_APPROVED'
    ) {
      return;
    }
    await this.prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: 'DRAFT',
        submittedAt: null,
        submittedBy: null,
        approvedAt: null,
        approvedBy: null,
        gmApprovedAt: null,
        gmApprovedBy: null,
        updatedBy: ctx.userId,
      },
    });

    const recipients = new Set<string>(
      await this.findUserIdsByRoleNames(ctx.companyId, [
        HR_MANAGER_ROLE,
        ...(run.status === 'GM_APPROVED' || run.status === 'APPROVED'
          ? [GENERAL_MANAGER_ROLE]
          : []),
      ]),
    );
    recipients.delete(ctx.userId);
    await this.notifyMany(
      ctx,
      [...recipients],
      'payroll.run_reopened',
      `Payroll ${run.runNumber} changed - approval needed again`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was changed after it was ${run.status === 'SUBMITTED' ? 'submitted' : 'approved'}. It is back in draft and must be reviewed and approved again.`,
      `/payroll/runs/${run.id}`,
    );
    this.logger.log(
      `[PayrollRun] ${run.runNumber} reopened from ${run.status} to DRAFT after a change`,
    );
  }

  /**
   * Merge per-period OT columns onto salary periods (raw read until Prisma
   * client is regenerated with the new PayrollSalaryPeriod fields).
   */
  private async hydrateSalaryPeriodOvertime<
    T extends { entries: Array<{ salaryPeriods: Array<Record<string, unknown>> }> },
  >(run: T): Promise<T> {
    const periodIds = run.entries
      .flatMap((e) => e.salaryPeriods.map((p) => p.id))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (periodIds.length === 0) {
      return run;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        normal_ot_hours: Decimal;
        evening_ot_hours: Decimal;
        sunday_ot_hours: Decimal;
        holiday_ot_hours: Decimal;
        normal_ot_pay: Decimal;
        evening_ot_pay: Decimal;
        sunday_ot_pay: Decimal;
        holiday_ot_pay: Decimal;
        total_ot_pay: Decimal;
      }>
    >`
      SELECT id,
             normal_ot_hours, evening_ot_hours, sunday_ot_hours, holiday_ot_hours,
             normal_ot_pay, evening_ot_pay, sunday_ot_pay, holiday_ot_pay, total_ot_pay
      FROM payroll_salary_period
      WHERE id IN (${Prisma.join(periodIds)})
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const entry of run.entries) {
      for (const period of entry.salaryPeriods) {
        const ot = byId.get(String(period.id));
        if (!ot) continue;
        period.normalOtHours = ot.normal_ot_hours;
        period.eveningOtHours = ot.evening_ot_hours;
        period.sundayOtHours = ot.sunday_ot_hours;
        period.holidayOtHours = ot.holiday_ot_hours;
        period.normalOtPay = ot.normal_ot_pay;
        period.eveningOtPay = ot.evening_ot_pay;
        period.sundayOtPay = ot.sunday_ot_pay;
        period.holidayOtPay = ot.holiday_ot_pay;
        period.totalOtPay = ot.total_ot_pay;
      }
    }
    return run;
  }

  /**
   * Returns a payroll run with entries, employee org fields, and salary periods.
   */
  async getRun(
    runId: string,
    companyId: string,
    options?: GetRunOptions,
  ): Promise<PayrollRun> {
    const person = {
      select: { id: true, firstName: true, lastName: true, chineseName: true },
    } as const;
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      include: {
        // Names for the approval steps (no user-directory download on the page).
        creator: person,
        submitter: person,
        approver: person,
        gmApprover: person,
        payer: person,
        originalRun: {
          select: {
            id: true,
            runNumber: true,
            month: true,
            year: true,
            status: true,
            type: true,
          },
        },
        entries: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
                chineseName: true,
                employeeId: true,
                employeeType: true,
                department: { select: { id: true, name: true } },
                engineeringDiscipline: { select: { id: true, name: true } },
              },
            },
            salaryPeriods: {
              orderBy: { periodStart: 'asc' },
              include: {
                contract: {
                  select: {
                    contractNumber: true,
                    transportationAllowance: true,
                    monthlyBonus: true,
                  },
                },
              },
            },
            payslip: {
              select: {
                id: true,
                generatedAt: true,
                releasedAt: true,
                downloadedAt: true,
              },
            },
          },
          orderBy: { employee: { firstName: 'asc' } },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    if (options?.maskBank) {
      for (const entry of run.entries) {
        entry.bankAccountNumber = this.maskBankAccount(entry.bankAccountNumber);
      }
    }

    if (options?.includeOverrides) {
      const audited = await this.prisma.payrollEntryAudit.findMany({
        where: { companyId, payrollEntry: { runId } },
        select: { payrollEntryId: true },
        distinct: ['payrollEntryId'],
      });
      const overridden = new Set(audited.map((a) => a.payrollEntryId));
      for (const entry of run.entries) {
        (entry as typeof entry & { hasOverride: boolean }).hasOverride = overridden.has(entry.id);
      }
    }

    return this.hydrateSalaryPeriodOvertime(run);
  }

  /**
   * Lists payroll runs for a company with entry counts and flagged counts.
   */
  async listRuns(companyId: string): Promise<
    Array<
      PayrollRun & {
        _count: { entries: number };
        flaggedCount: number;
      }
    >
  > {
    const runs = await this.prisma.payrollRun.findMany({
      where: { companyId, deletedAt: null },
      include: {
        _count: { select: { entries: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    if (runs.length === 0) {
      return [];
    }

    const flaggedGroups = await this.prisma.payrollEntry.groupBy({
      by: ['runId'],
      where: {
        runId: { in: runs.map((r) => r.id) },
        flag: { not: 'NONE' },
      },
      _count: { _all: true },
    });

    const flaggedByRun = new Map(
      flaggedGroups.map((g) => [g.runId, g._count._all]),
    );

    return runs.map((run) => ({
      ...run,
      flaggedCount: flaggedByRun.get(run.id) ?? 0,
    }));
  }

  /**
   * Marks a DRAFT run as REVIEWED.
   */
  async markReviewed(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'DRAFT') {
      throw new BadRequestException(
        `Run must be in DRAFT status to mark reviewed`,
      );
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'REVIEWED',
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Submits a REVIEWED run for HR approval. Requires acknowledgeFlags when flagged.
   */
  async submitRun(
    runId: string,
    ctx: ServiceContext,
    options?: SubmitRunOptions,
  ): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Run must be in REVIEWED status to submit`,
      );
    }

    const flagged = await this.prisma.payrollEntry.groupBy({
      by: ['flag'],
      where: { runId, flag: { not: 'NONE' } },
      _count: { _all: true },
    });

    if (flagged.length > 0 && !options?.acknowledgeFlags) {
      const flagCounts: Record<string, number> = {};
      for (const row of flagged) {
        flagCounts[row.flag] = row._count._all;
      }
      // The exception filter forwards `error` (as the code) and `details` only.
      throw new BadRequestException({
        message:
          'Run has flagged entries; set acknowledgeFlags=true to submit anyway',
        error: 'FLAGS_NOT_ACKNOWLEDGED',
        details: { flagCounts },
      });
    }
    await this.assertEmploymentReviewConfirmed(
      run,
      ctx,
      'submit',
      options?.confirmEmploymentReview,
    );

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        submittedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const hrManagers = await this.findUserIdsByRoleNames(ctx.companyId, [
      HR_MANAGER_ROLE,
    ]);
    await this.notifyMany(
      ctx,
      hrManagers,
      'payroll.run_submitted',
      `Payroll ${run.runNumber} submitted`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was submitted for approval.`,
      `/payroll/runs/${runId}`,
    );

    return updated;
  }

  /**
   * HR Manager / System Administrator: SUBMITTED → APPROVED.
   */
  async approveRun(
    runId: string,
    ctx: ServiceContext,
    options?: ApproveRunOptions,
  ): Promise<PayrollRun> {
    await this.assertPayrollApprove(ctx);
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Run must be in SUBMITTED status to approve`,
      );
    }
    await this.assertEmploymentReviewConfirmed(
      run,
      ctx,
      'approve',
      options?.confirmEmploymentReview,
    );

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const gms = await this.findUserIdsByRoleNames(ctx.companyId, [
      GENERAL_MANAGER_ROLE,
    ]);
    await this.notifyMany(
      ctx,
      gms,
      'payroll.run_approved',
      `Payroll ${run.runNumber} approved by HR`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was approved by HR and awaits GM approval.`,
      `/payroll/runs/${runId}`,
    );

    return updated;
  }

  /**
   * General Manager / System Administrator: APPROVED → GM_APPROVED.
   */
  async gmApproveRun(
    runId: string,
    ctx: ServiceContext,
    options?: ApproveRunOptions,
  ): Promise<PayrollRun> {
    await this.assertPayrollApprove(ctx);
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'APPROVED') {
      throw new BadRequestException(
        `Run must be in APPROVED status for GM approval`,
      );
    }
    await this.assertEmploymentReviewConfirmed(
      run,
      ctx,
      'gm_approve',
      options?.confirmEmploymentReview,
    );

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'GM_APPROVED',
        gmApprovedAt: new Date(),
        gmApprovedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const recipients = new Set<string>([run.createdBy]);
    const localHr = await this.findUserIdsByRoleNames(ctx.companyId, [
      LOCAL_HR_MANAGER_ROLE,
    ]);
    for (const id of localHr) {
      recipients.add(id);
    }

    await this.notifyMany(
      ctx,
      [...recipients],
      'payroll.run_gm_approved',
      `Payroll ${run.runNumber} GM approved`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was approved by the General Manager.`,
      `/payroll/runs/${runId}`,
    );

    return updated;
  }

  /**
   * Marks a GM_APPROVED run as PAID.
   */
  async markPaid(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'GM_APPROVED') {
      throw new BadRequestException(
        `Run must be GM_APPROVED before marking as paid`,
      );
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paidBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Cancels a run that is not yet GM_APPROVED or PAID (no soft-delete).
   */
  async cancelRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (
      run.status === 'GM_APPROVED' ||
      run.status === 'PAID' ||
      run.status === 'SUPERSEDED'
    ) {
      throw new BadRequestException(
        `Cannot cancel a run in ${run.status} status`,
      );
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'CANCELLED',
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Creates a CORRECTION draft for a locked REGULAR run (GM_APPROVED / PAID).
   * Recalculates with current inputs via the same entry builder, diffs net pay
   * against the original, and stores every employee with original/corrected/delta.
   * Prior DRAFT corrections are replaced; finalized corrections are SUPERSEDED.
   */
  async createCorrectionRun(
    originalRunId: string,
    ctx: ServiceContext,
    note?: string,
  ): Promise<PayrollRun> {
    await this.assertCanUnlockOrCorrect(ctx);

    const original = await this.requireRun(originalRunId, ctx.companyId);
    if (original.type !== 'REGULAR') {
      throw new BadRequestException(
        'Corrections can only be created from a regular payroll run',
      );
    }
    if (original.status !== 'GM_APPROVED' && original.status !== 'PAID') {
      throw new BadRequestException(
        'Original run must be GM_APPROVED or PAID before creating a correction',
      );
    }

    const priorCorrections = await this.prisma.payrollRun.findMany({
      where: {
        companyId: ctx.companyId,
        originalRunId,
        type: 'CORRECTION',
        deletedAt: null,
      },
      select: { id: true, status: true, runNumber: true },
      orderBy: { createdAt: 'desc' },
    });

    for (const prior of priorCorrections) {
      if (prior.status === 'DRAFT' || prior.status === 'REVIEWED') {
        await this.deleteCorrectionRunCascade(prior.id, ctx);
      } else if (
        prior.status === 'SUBMITTED' ||
        prior.status === 'APPROVED' ||
        prior.status === 'GM_APPROVED' ||
        prior.status === 'PAID'
      ) {
        await this.voidPayslipsForRun(prior.id, ctx);
        await this.prisma.payrollRun.update({
          where: { id: prior.id },
          data: { status: 'SUPERSEDED', updatedBy: ctx.userId },
        });
      }
    }

    const correctionCount = await this.prisma.payrollRun.count({
      where: {
        companyId: ctx.companyId,
        originalRunId,
        type: 'CORRECTION',
      },
    });
    const runNumber = this.generateCorrectionRunNumber(
      original.month,
      original.year,
      correctionCount + 1,
    );

    const correctionRun = await this.prisma.payrollRun.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        runNumber,
        month: original.month,
        year: original.year,
        type: 'CORRECTION',
        originalRunId: original.id,
        status: 'DRAFT',
        taxableThreshold: original.taxableThreshold,
        // Same basis as the run it corrects.
        considerAttendance: original.considerAttendance,
        notes: note?.trim() ? note.trim() : null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const originalEntries = await this.prisma.payrollEntry.findMany({
      where: { runId: original.id, companyId: ctx.companyId },
      select: { employeeId: true, netPay: true },
    });
    const originalNetByEmployee = new Map(
      originalEntries.map((entry) => [
        entry.employeeId,
        this.toNumber(entry.netPay),
      ]),
    );

    const includeFreelancerIds = new Set<string>([
      ...(await this.includedFreelancerIds(original.id)),
      ...originalEntries.map((entry) => entry.employeeId),
    ]);

    const drafts = await this.buildEntryDrafts(correctionRun, ctx, new Map(), {
      includeFreelancerIds,
    });

    const correctionDrafts: EntryDraft[] = [];
    const seenEmployees = new Set<string>();

    for (const draft of drafts) {
      const employeeId = draft.entry.employeeId as string;
      seenEmployees.add(employeeId);
      const correctedAmount = this.toNumber(
        draft.entry.netPay as Decimal | number | null | undefined,
      );
      const originalAmount = originalNetByEmployee.get(employeeId) ?? 0;
      const deltaAmount =
        Math.round((correctedAmount - originalAmount) * 100) / 100;
      correctionDrafts.push({
        entry: {
          ...draft.entry,
          originalAmount: new Decimal(originalAmount),
          correctedAmount: new Decimal(correctedAmount),
          deltaAmount: new Decimal(deltaAmount),
        },
        salaryPeriods: draft.salaryPeriods,
      });
    }

    // Employees on the original run who drop out of the recalculation.
    for (const [employeeId, originalAmount] of originalNetByEmployee) {
      if (seenEmployees.has(employeeId)) {
        continue;
      }
      const deltaAmount = Math.round((0 - originalAmount) * 100) / 100;
      const originalEntry = await this.prisma.payrollEntry.findFirst({
        where: {
          runId: original.id,
          employeeId,
          companyId: ctx.companyId,
        },
      });
      if (!originalEntry) {
        continue;
      }
      correctionDrafts.push({
        entry: {
          id: randomUUID(),
          companyId: ctx.companyId,
          runId: correctionRun.id,
          employeeId,
          contractId: originalEntry.contractId,
          attendanceRecordId: null,
          overtimeSheetId: null,
          scheduledDays: originalEntry.scheduledDays,
          presentDays: originalEntry.presentDays,
          absentDays: originalEntry.absentDays,
          employedDays: originalEntry.employedDays,
          payrollDays: new Decimal(0),
          basicSalary: originalEntry.basicSalary,
          transportAllowance: new Decimal(0),
          monthlyBonus: new Decimal(0),
          contractNetBonus: new Decimal(0),
          earnedSalary: new Decimal(0),
          normalOtHours: new Decimal(0),
          eveningOtHours: new Decimal(0),
          sundayOtHours: new Decimal(0),
          holidayOtHours: new Decimal(0),
          normalOtPay: new Decimal(0),
          eveningOtPay: new Decimal(0),
          sundayOtPay: new Decimal(0),
          holidayOtPay: new Decimal(0),
          totalOtPay: new Decimal(0),
          taxableTransport: new Decimal(0),
          nonTaxableTransport: new Decimal(0),
          grossIncome: new Decimal(0),
          taxableIncome: new Decimal(0),
          pensionEmployee: new Decimal(0),
          pensionEmployer: new Decimal(0),
          incomeTax: new Decimal(0),
          totalDeductions: new Decimal(0),
          netPay: new Decimal(0),
          unusedLeavePayout: new Decimal(0),
          severancePay: new Decimal(0),
          noticePay: new Decimal(0),
          bonusTopUp: new Decimal(0),
          netTopUp: new Decimal(0),
          originalAmount: new Decimal(originalAmount),
          correctedAmount: new Decimal(0),
          deltaAmount: new Decimal(deltaAmount),
          flag: 'NONE',
          bankName: originalEntry.bankName,
          bankAccountNumber: originalEntry.bankAccountNumber,
          employeeCategory: originalEntry.employeeCategory,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        salaryPeriods: [],
      });
    }

    await this.persistEntryDrafts(correctionDrafts, ctx);
    await this.updateRunTotals(correctionRun.id, ctx);

    const changedCount = correctionDrafts.filter(
      (draft) => this.toNumber(draft.entry.deltaAmount as Decimal | number | null) !== 0,
    ).length;
    this.logger.log(
      `[PayrollRun] Created correction ${runNumber} for ${original.runNumber} with ${correctionDrafts.length} entries (${changedCount} changed)`,
    );

    return this.getRun(correctionRun.id, ctx.companyId);
  }

  /**
   * Unlocks a locked REGULAR run (GM_APPROVED / PAID) back to DRAFT and voids
   * its payslips. Does not create a correction — for re-editing from scratch.
   */
  async unlockRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    await this.assertCanUnlockOrCorrect(ctx);

    const run = await this.requireRun(runId, ctx.companyId);
    if (run.type !== 'REGULAR') {
      throw new BadRequestException('Only regular payroll runs can be unlocked');
    }
    if (run.status !== 'GM_APPROVED' && run.status !== 'PAID') {
      throw new BadRequestException(
        'Only GM_APPROVED or PAID runs can be unlocked',
      );
    }

    await this.voidPayslipsForRun(runId, ctx);

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'DRAFT',
        submittedAt: null,
        submittedBy: null,
        approvedAt: null,
        approvedBy: null,
        gmApprovedAt: null,
        gmApprovedBy: null,
        paidAt: null,
        paidBy: null,
        updatedBy: ctx.userId,
      },
    });

    this.logger.log(
      `[PayrollRun] Unlocked ${run.runNumber} from ${run.status} to DRAFT`,
    );

    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Updates bonus / net top-ups and notes on an entry in a DRAFT or REVIEWED run.
   */
  async updateEntry(
    entryId: string,
    dto: {
      bonusTopUp?: number;
      bonusTopUpReason?: string;
      netTopUp?: number;
      netTopUpReason?: string;
      notes?: string;
    },
    ctx: ServiceContext,
  ): Promise<PayrollEntry> {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, companyId: ctx.companyId },
      include: { run: true },
    });
    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }
    if (entry.run.status !== 'DRAFT' && entry.run.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Cannot edit entry in run status: ${entry.run.status}`,
      );
    }

    const bonusTopUp = dto.bonusTopUp ?? this.toNumber(entry.bonusTopUp);
    if (bonusTopUp < 0) {
      throw new BadRequestException('bonusTopUp must be >= 0');
    }
    if (bonusTopUp !== 0) {
      const reason = dto.bonusTopUpReason ?? entry.bonusTopUpReason;
      if (!reason || reason.trim().length === 0) {
        throw new BadRequestException(
          'bonusTopUpReason is required when bonusTopUp is not zero',
        );
      }
    }

    const netTopUp = dto.netTopUp ?? this.toNumber(entry.netTopUp);
    if (netTopUp < 0) {
      throw new BadRequestException('netTopUp must be >= 0');
    }
    if (netTopUp !== 0) {
      const reason = dto.netTopUpReason ?? entry.netTopUpReason;
      if (!reason || reason.trim().length === 0) {
        throw new BadRequestException(
          'netTopUpReason is required when netTopUp is not zero',
        );
      }
    }

    const result = await this.recalcEntryAmounts(entry, entry.run, {
      bonusTopUp,
      netTopUp,
    });

    const updated = await this.prisma.payrollEntry.update({
      where: { id: entryId },
      data: {
        bonusTopUp: new Decimal(bonusTopUp),
        bonusTopUpReason:
          dto.bonusTopUpReason !== undefined
            ? dto.bonusTopUpReason
            : entry.bonusTopUpReason,
        netTopUp: new Decimal(netTopUp),
        netTopUpReason:
          dto.netTopUpReason !== undefined
            ? dto.netTopUpReason
            : entry.netTopUpReason,
        notes: dto.notes !== undefined ? dto.notes : entry.notes,
        ...this.calculationToEntryUpdate(result),
        updatedBy: ctx.userId,
      },
    });

    await this.updateRunTotals(entry.runId, ctx);
    return updated;
  }

  /**
   * HR override of paid days on an entry in a DRAFT or REVIEWED run. Reprices the
   * entry from its own snapshot (same formulas as generation) and records the change.
   * Overtime is left as stored: it does not depend on paid days. The exception is
   * 0 days, which pays nothing like a generated zero-day entry; raising the days
   * again restores what that cleared.
   *
   * When `periodId` is set (multi-contract month), only that salary period's paid
   * days are changed; other periods keep theirs and the entry total is their sum.
   * Omit `periodId` to scale every period from a new entry total (single-period /
   * whole-entry override).
   */
  async overrideEntryDays(
    runId: string,
    entryId: string,
    dto: { payrollDays: number; periodId?: string; reason?: string },
    ctx: ServiceContext,
  ): Promise<PayrollEntry> {
    const contractSelect = {
      startDate: true,
      contractNumber: true,
      transportationAllowance: true,
      monthlyBonus: true,
    } satisfies Prisma.EmployeeContractSelect;
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, runId, companyId: ctx.companyId, run: { deletedAt: null } },
      include: {
        run: true,
        contract: { select: contractSelect },
        salaryPeriods: {
          orderBy: { periodStart: 'asc' },
          include: { contract: { select: contractSelect } },
        },
      },
    });
    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }
    if (entry.run.status !== 'DRAFT' && entry.run.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Cannot edit entry in run status: ${entry.run.status}`,
      );
    }

    const oldTotalDays = this.toNumber(entry.payrollDays);
    const periodId = dto.periodId?.trim() || undefined;
    const targetPeriod = periodId
      ? entry.salaryPeriods.find((period) => period.id === periodId)
      : undefined;
    if (periodId && !targetPeriod) {
      throw new BadRequestException(
        'Salary period not found on this entry. Use a period from this multi-contract month',
      );
    }
    if (periodId && entry.salaryPeriods.length < 2) {
      throw new BadRequestException(
        'Per-period paid days can only be set when the entry has more than one contract period',
      );
    }

    const oldPeriodDays = targetPeriod ? this.toNumber(targetPeriod.days) : oldTotalDays;
    const requestedDays = dto.payrollDays;
    if (oldPeriodDays === requestedDays) {
      return entry;
    }

    const employedDays = this.toNumber(entry.employedDays);
    if (!entry.contract || employedDays <= 0) {
      throw new BadRequestException(
        'Paid days cannot be overridden on an entry without a contract in this month',
      );
    }
    // Generation zeroes overtime, allowances and top-ups for these entries, so the
    // snapshot cannot be repriced. Recalculating from attendance restores all of them.
    const zeroSnapshot =
      oldTotalDays === 0 ? await this.latestZeroDaysSnapshot(entryId, ctx.companyId) : null;
    const generatedAsFullyAbsent =
      (oldTotalDays === 0 && !zeroSnapshot) ||
      (Boolean(entry.notes?.includes(FULLY_ABSENT_NO_PAY_NOTE)) &&
        this.toNumber(entry.transportAllowance) === 0 &&
        this.toNumber(entry.monthlyBonus) === 0);
    if (generatedAsFullyAbsent) {
      throw new BadRequestException(
        'This entry was generated as fully absent. Correct the attendance and recalculate the run instead',
      );
    }

    type DaysSlice = {
      periodId: string | null;
      basic: number;
      contract: NonNullable<typeof entry.contract>;
      /** Employed days for this contract window (before absence). */
      allocatedDays: number;
      /** Paid days after this override. */
      paidDays: number;
      label: string | null;
    };

    const periodLabel = (
      period: (typeof entry.salaryPeriods)[number],
    ): string => {
      const number =
        period.contract.contractNumber?.trim() || period.contractId.slice(0, 8);
      if (!period.periodStart || !period.periodEnd) {
        return number;
      }
      const start = period.periodStart.toISOString().slice(0, 10);
      const end = period.periodEnd.toISOString().slice(0, 10);
      return `${number} · ${start}–${end}`;
    };

    const allocatedForPeriod = (
      period: (typeof entry.salaryPeriods)[number],
      index: number,
      allocatedSoFar: number,
      oldScale: number,
    ): number => {
      if (zeroSnapshot) {
        return zeroSnapshot.allocatedDays[period.id] ?? 0;
      }
      // Prefer the payroll-calendar window (survives non-uniform per-period edits).
      if (period.periodStart && period.periodEnd) {
        const fromDates = employedPayrollDays(
          entry.run.month,
          entry.run.year,
          period.periodStart,
          period.periodEnd,
        ).days;
        if (fromDates > 0) {
          return fromDates;
        }
      }
      // Fallback: invert the uniform absence scale from stored paid days.
      if (index === entry.salaryPeriods.length - 1) {
        return Math.max(0, employedDays - allocatedSoFar);
      }
      return oldScale > 0
        ? Math.round(this.toNumber(period.days) / oldScale)
        : 0;
    };

    let slices: DaysSlice[];
    let newTotalDays: number;
    let auditOldValue: string;
    let auditNewValue: string;
    let periodAuditLabel: string | null = null;

    if (targetPeriod) {
      // Per-period: set this period's paid days; keep the others as stored.
      let allocatedSoFar = 0;
      const oldScale = oldTotalDays > 0 ? oldTotalDays / employedDays : 0;
      slices = entry.salaryPeriods.map((period, index) => {
        const allocatedDays = allocatedForPeriod(period, index, allocatedSoFar, oldScale);
        allocatedSoFar += allocatedDays;
        const paidDays =
          period.id === targetPeriod.id
            ? requestedDays
            : oldTotalDays === 0
              ? 0
              : this.toNumber(period.days);
        return {
          periodId: period.id,
          basic: this.toNumber(period.basicSalary),
          contract: period.contract,
          allocatedDays,
          paidDays,
          label: periodLabel(period),
        };
      });
      newTotalDays = this.round(slices.reduce((sum, slice) => sum + slice.paidDays, 0));
      if (newTotalDays > PAYROLL_MONTH_DAYS) {
        throw new BadRequestException(
          `Paid days across periods cannot exceed ${PAYROLL_MONTH_DAYS}`,
        );
      }
      auditOldValue = String(oldPeriodDays);
      auditNewValue = String(requestedDays);
      periodAuditLabel = periodLabel(targetPeriod);
    } else {
      // Whole-entry: scale every period by newTotal / employed (existing behaviour).
      newTotalDays = requestedDays;
      const oldScale = oldTotalDays / employedDays;
      const newScale = newTotalDays / employedDays;
      let allocatedSoFar = 0;
      slices =
        entry.salaryPeriods.length > 0
          ? entry.salaryPeriods.map((period, index) => {
              const allocatedDays = allocatedForPeriod(
                period,
                index,
                allocatedSoFar,
                oldScale,
              );
              allocatedSoFar += allocatedDays;
              return {
                periodId: period.id as string | null,
                basic: this.toNumber(period.basicSalary),
                contract: period.contract,
                allocatedDays,
                paidDays: this.round(allocatedDays * newScale),
                label: periodLabel(period),
              };
            })
          : [
              {
                periodId: null as string | null,
                basic: this.toNumber(entry.basicSalary),
                contract: entry.contract,
                allocatedDays: employedDays,
                paidDays: newTotalDays,
                label: null,
              },
            ];
      auditOldValue = String(oldTotalDays);
      auditNewValue = String(newTotalDays);
    }

    const periodEarned = (basic: number, days: number): number =>
      this.round((basic / PAYROLL_MONTH_DAYS) * days);
    const earnedSalary = this.round(
      slices.reduce((sum, slice) => sum + periodEarned(slice.basic, slice.paidDays), 0),
    );

    const monthStart = new Date(Date.UTC(entry.run.year, entry.run.month - 1, 1));
    const policy = await loadPolicySnapshot(this.prisma, ctx.companyId, monthStart);
    const employmentStart = slices.reduce(
      (min, slice) =>
        slice.contract.startDate.getTime() < min.getTime() ? slice.contract.startDate : min,
      slices[0].contract.startDate,
    );
    // Per-period paid days: when absences reduce allowances, each contract
    // contributes amount × its own paid days / 30 (not a uniform scale).
    const allowanceSlices = slices.map((slice) => ({
      transportationAllowance: this.toNumber(slice.contract.transportationAllowance),
      monthlyBonus: this.toNumber(slice.contract.monthlyBonus),
      allocatedDays:
        policy.allowancesReducedByAbsence && targetPeriod
          ? slice.paidDays
          : slice.allocatedDays,
    }));
    const allowanceEmployed =
      policy.allowancesReducedByAbsence && targetPeriod
        ? Math.max(newTotalDays, 0.0001)
        : employedDays;
    const allowances =
      newTotalDays === 0
        ? { transport: 0, monthlyBonus: 0 }
        : computeContractAllowances(
            allowanceSlices,
            allowanceEmployed,
            newTotalDays,
            employedPayrollDays(entry.run.month, entry.run.year, employmentStart, null).days,
            policy.leaverAllowanceMode,
            // Already applied per-period paid days as allocated when editing one period.
            targetPeriod ? false : policy.allowancesReducedByAbsence,
          );

    const zeroDayFields = newTotalDays === 0 ? this.zeroDaysEntryFields() : null;
    const restoredFields = zeroSnapshot ? this.entryFieldsFromSnapshot(zeroSnapshot) : null;
    const clearedOrRestored: Partial<NonNullable<typeof zeroDayFields>> =
      zeroDayFields ?? restoredFields ?? {};

    const result = await this.recalcEntryAmounts(
      {
        ...entry,
        ...clearedOrRestored,
        payrollDays: new Decimal(newTotalDays),
        earnedSalary: new Decimal(earnedSalary),
        transportAllowance: new Decimal(allowances.transport),
        monthlyBonus: new Decimal(allowances.monthlyBonus),
      },
      entry.run,
      {
        bonusTopUp: this.toNumber(clearedOrRestored.bonusTopUp ?? entry.bonusTopUp),
        netTopUp: this.toNumber(clearedOrRestored.netTopUp ?? entry.netTopUp),
      },
    );

    const userReason = dto.reason?.trim() || null;
    const reason =
      periodAuditLabel == null
        ? userReason
        : userReason
          ? `${periodAuditLabel}: ${userReason}`
          : periodAuditLabel;

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollEntry.update({
        where: { id: entryId },
        data: {
          ...this.calculationToEntryUpdate(result),
          ...clearedOrRestored,
          transportAllowance: new Decimal(allowances.transport),
          monthlyBonus: new Decimal(allowances.monthlyBonus),
          updatedBy: ctx.userId,
        },
      });
      for (const slice of slices) {
        if (!slice.periodId) {
          continue;
        }
        await tx.payrollSalaryPeriod.update({
          where: { id: slice.periodId },
          data: {
            days: new Decimal(this.round(slice.paidDays)),
            earnedSalary: new Decimal(periodEarned(slice.basic, slice.paidDays)),
            updatedBy: ctx.userId,
          },
        });
      }
      await tx.payrollEntryAudit.create({
        data: {
          payrollEntryId: entryId,
          field: PAYROLL_DAYS_AUDIT_FIELD,
          oldValue: auditOldValue,
          newValue: auditNewValue,
          reason,
          changedById: ctx.userId,
          companyId: ctx.companyId,
        },
      });
      if (newTotalDays === 0) {
        const snapshot: ZeroDaysSnapshot = {
          contractNetBonus: this.toNumber(entry.contractNetBonus),
          bonusTopUp: this.toNumber(entry.bonusTopUp),
          bonusTopUpReason: entry.bonusTopUpReason,
          netTopUp: this.toNumber(entry.netTopUp),
          netTopUpReason: entry.netTopUpReason,
          normalOtHours: this.toNumber(entry.normalOtHours),
          eveningOtHours: this.toNumber(entry.eveningOtHours),
          sundayOtHours: this.toNumber(entry.sundayOtHours),
          holidayOtHours: this.toNumber(entry.holidayOtHours),
          normalOtPay: this.toNumber(entry.normalOtPay),
          eveningOtPay: this.toNumber(entry.eveningOtPay),
          sundayOtPay: this.toNumber(entry.sundayOtPay),
          holidayOtPay: this.toNumber(entry.holidayOtPay),
          allocatedDays: Object.fromEntries(
            slices.flatMap((slice) =>
              slice.periodId ? [[slice.periodId, slice.allocatedDays]] : [],
            ),
          ),
        };
        await tx.payrollEntryAudit.create({
          data: {
            payrollEntryId: entryId,
            field: ZERO_DAYS_SNAPSHOT_AUDIT_FIELD,
            oldValue: JSON.stringify(snapshot),
            newValue: '',
            changedById: ctx.userId,
            companyId: ctx.companyId,
          },
        });
      }
    });

    await this.updateRunTotals(runId, ctx);
    // Outlives the entry: recalculating the run deletes entries and their override rows.
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'entry_days_overridden',
        recordType: 'PayrollEntry',
        recordId: entryId,
        recordReference: entry.run.runNumber,
        beforeValue: {
          employeeId: entry.employeeId,
          payrollDays: oldTotalDays,
          ...(periodId ? { periodId, periodDays: oldPeriodDays } : {}),
        },
        afterValue: {
          employeeId: entry.employeeId,
          payrollDays: newTotalDays,
          reason,
          ...(periodId ? { periodId, periodDays: requestedDays } : {}),
        },
      }),
    );

    // Re-read with salary periods so the client can patch the run cache.
    const reloaded = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, companyId: ctx.companyId },
      include: {
        salaryPeriods: {
          orderBy: { periodStart: 'asc' },
          include: {
            contract: {
              select: {
                contractNumber: true,
                transportationAllowance: true,
                monthlyBonus: true,
              },
            },
          },
        },
      },
    });
    return reloaded ?? entry;
  }

  /**
   * Entry figures after its OT totals change (manual OT adjustments): the OT
   * hours/pay given, then the rest repriced from the entry's own snapshot with
   * its stored top-ups (same path as {@link updateEntry}). Does not write.
   */
  async entryUpdateForOvertime(
    entry: PayrollEntry,
    run: Pick<PayrollRun, 'taxableThreshold' | 'companyId' | 'month' | 'year'>,
    ot: {
      hours: { normalHours: number; eveningHours: number; sundayHours: number; holidayHours: number };
      pay: { normalOtPay: number; eveningOtPay: number; sundayOtPay: number; holidayOtPay: number };
    },
  ): Promise<Prisma.PayrollEntryUncheckedUpdateInput> {
    const hours = {
      normalOtHours: new Decimal(ot.hours.normalHours),
      eveningOtHours: new Decimal(ot.hours.eveningHours),
      sundayOtHours: new Decimal(ot.hours.sundayHours),
      holidayOtHours: new Decimal(ot.hours.holidayHours),
    };
    const result = await this.recalcEntryAmounts(
      {
        ...entry,
        ...hours,
        normalOtPay: new Decimal(ot.pay.normalOtPay),
        eveningOtPay: new Decimal(ot.pay.eveningOtPay),
        sundayOtPay: new Decimal(ot.pay.sundayOtPay),
        holidayOtPay: new Decimal(ot.pay.holidayOtPay),
      },
      run,
      {
        bonusTopUp: this.toNumber(entry.bonusTopUp),
        netTopUp: this.toNumber(entry.netTopUp),
      },
    );
    return { ...hours, ...this.calculationToEntryUpdate(result) };
  }

  /** Recomputes a run's header totals from its entries. */
  async refreshRunTotals(runId: string, ctx: ServiceContext): Promise<void> {
    await this.updateRunTotals(runId, ctx);
  }

  /**
   * Override history of an entry, newest first. HR only.
   */
  async getEntryAudit(
    runId: string,
    entryId: string,
    companyId: string,
  ): Promise<PayrollEntryAuditRecord[]> {
    return this.prisma.payrollEntryAudit.findMany({
      where: {
        payrollEntryId: entryId,
        companyId,
        field: PAYROLL_DAYS_AUDIT_FIELD,
        payrollEntry: { runId },
      },
      orderBy: { changedAt: 'desc' },
      select: {
        id: true,
        field: true,
        oldValue: true,
        newValue: true,
        reason: true,
        changedAt: true,
        changedBy: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            chineseName: true,
          },
        },
      },
    });
  }

  /** What the latest override to 0 days cleared; null when no override set this entry to 0. */
  private async latestZeroDaysSnapshot(
    entryId: string,
    companyId: string,
  ): Promise<ZeroDaysSnapshot | null> {
    const row = await this.prisma.payrollEntryAudit.findFirst({
      where: { payrollEntryId: entryId, companyId, field: ZERO_DAYS_SNAPSHOT_AUDIT_FIELD },
      orderBy: { changedAt: 'desc' },
      select: { oldValue: true },
    });
    return row ? (JSON.parse(row.oldValue) as ZeroDaysSnapshot) : null;
  }

  private zeroDaysEntryFields(): ReturnType<PayrollRunService['entryFieldsFromSnapshot']> {
    return this.entryFieldsFromSnapshot({
      contractNetBonus: 0,
      bonusTopUp: 0,
      bonusTopUpReason: null,
      netTopUp: 0,
      netTopUpReason: null,
      normalOtHours: 0,
      eveningOtHours: 0,
      sundayOtHours: 0,
      holidayOtHours: 0,
      normalOtPay: 0,
      eveningOtPay: 0,
      sundayOtPay: 0,
      holidayOtPay: 0,
      allocatedDays: {},
    });
  }

  private entryFieldsFromSnapshot(snapshot: ZeroDaysSnapshot): {
    contractNetBonus: Decimal;
    bonusTopUp: Decimal;
    bonusTopUpReason: string | null;
    netTopUp: Decimal;
    netTopUpReason: string | null;
    normalOtHours: Decimal;
    eveningOtHours: Decimal;
    sundayOtHours: Decimal;
    holidayOtHours: Decimal;
    normalOtPay: Decimal;
    eveningOtPay: Decimal;
    sundayOtPay: Decimal;
    holidayOtPay: Decimal;
  } {
    return {
      contractNetBonus: new Decimal(snapshot.contractNetBonus),
      bonusTopUp: new Decimal(snapshot.bonusTopUp),
      bonusTopUpReason: snapshot.bonusTopUpReason,
      netTopUp: new Decimal(snapshot.netTopUp),
      netTopUpReason: snapshot.netTopUpReason,
      normalOtHours: new Decimal(snapshot.normalOtHours),
      eveningOtHours: new Decimal(snapshot.eveningOtHours),
      sundayOtHours: new Decimal(snapshot.sundayOtHours),
      holidayOtHours: new Decimal(snapshot.holidayOtHours),
      normalOtPay: new Decimal(snapshot.normalOtPay),
      eveningOtPay: new Decimal(snapshot.eveningOtPay),
      sundayOtPay: new Decimal(snapshot.sundayOtPay),
      holidayOtPay: new Decimal(snapshot.holidayOtPay),
    };
  }

  // ── Bulk generation internals ───────────────────────────────────────────

  private async buildEntryDrafts(
    run: PayrollRun,
    ctx: ServiceContext,
    capturedTopUps: Map<string, CapturedTopUp>,
    options: { includeFreelancerIds?: Set<string>; onlyEmployeeIds?: string[] } = {},
  ): Promise<EntryDraft[]> {
    const { month, year } = run;
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const includeFreelancerIds = options.includeFreelancerIds ?? new Set<string>();

    // Approver-only accounts get no payroll entry (and so no flags / MISSING_CONTRACT).
    // Freelancers are only paid in months HR adds them to the run.
    // Roster = employment window overlaps the month; login (isActive) is irrelevant.
    const candidates = (
      await this.prisma.user.findMany({
        where: hrProcessEmployeeWhere({
          companyId: ctx.companyId,
          includeInPayroll: true,
          deletedAt: null,
          ...employedInMonthWhere(month, year),
          ...(options.onlyEmployeeIds ? { id: { in: options.onlyEmployeeIds } } : {}),
        }),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        employeeType: true,
        nationality: true,
        employmentDate: true,
        bankName: true,
        bankAccountNumber: true,
        isActive: true,
      },
      })
    ).filter(
      (e) => e.employeeType !== 'FREELANCER' || includeFreelancerIds.has(e.id),
    );

    if (candidates.length === 0) {
      return [];
    }

    const windowsByEmployee = await loadEmploymentWindows(
      this.prisma,
      candidates,
      month,
      year,
    );
    const employees = candidates.filter(
      (e) => windowsByEmployee.get(e.id)?.overlapsMonth !== false,
    );
    if (employees.length === 0) {
      return [];
    }

    const employeeIds = employees.map((e) => e.id);

    const contractSelect = {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      terminatedAt: true,
      status: true,
      basicSalary: true,
      transportationAllowance: true,
      monthlyBonus: true,
      monthlyNetBonus: true,
      pensionApplicable: true,
      taxApplicable: true,
    } satisfies Prisma.EmployeeContractSelect;

    const [
      contracts,
      endedContractsForEmployment,
      attendanceRecords,
      overtimeSheets,
      siteAssignments,
      missingAttendanceRows,
      latestContracts,
      inactiveSpansByEmployee,
      unpaidLeaveRows,
    ] = await Promise.all([
      this.prisma.employeeContract.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          deletedAt: null,
          startDate: { lte: monthEnd },
          status: { in: ['ACTIVE', 'SUPERSEDED', 'TERMINATED', 'EXPIRED'] },
          // Effective end = min(endDate, terminatedAt), whatever the status.
          AND: [
            { OR: [{ endDate: null }, { endDate: { gte: monthStart } }] },
            { OR: [{ terminatedAt: null }, { terminatedAt: { gte: monthStart } }] },
          ],
        },
        select: contractSelect,
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.employeeContract.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          deletedAt: null,
          OR: [{ endDate: { not: null } }, { terminatedAt: { not: null } }],
        },
        select: {
          employeeId: true,
          endDate: true,
          terminatedAt: true,
        },
        orderBy: [{ terminatedAt: 'desc' }, { endDate: 'desc' }],
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          month,
          year,
        },
        select: {
          id: true,
          employeeId: true,
          scheduledDays: true,
          presentDays: true,
          absentDays: true,
          paidDays: true,
          unpaidLeaveDays: true,
          matchMethod: true,
          earlyDepartureWouldDeductDays: true,
          dailyLogs: {
            select: {
              date: true,
              dayDeduction: true,
              isHoliday: true,
              isWeekend: true,
              isHalfDay: true,
              dayStatus: true,
            },
          },
        } as Prisma.AttendanceRecordSelect,
      }),
      this.prisma.overtimeSheet.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          month,
          year,
          status: 'APPROVED',
        },
        select: {
          id: true,
          employeeId: true,
          totalRegularHours: true,
          totalNightHours: true,
          totalWeekendHours: true,
          totalHolidayHours: true,
          entries: {
            select: {
              date: true,
              startTime: true,
              endTime: true,
              endsAtEndOfDay: true,
              isHoliday: true,
              isOvernight: true,
              regularHours: true,
              nightHours: true,
              weekendHours: true,
              holidayHours: true,
              siteWithinScheduleHours: true,
            },
            orderBy: { date: 'asc' },
          },
        },
      }),
      this.prisma.siteAssignment.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          deletedAt: null,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: {
          employeeId: true,
          siteName: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.attendanceImportMissing.findMany({
        where: {
          companyId: ctx.companyId,
          userId: { in: employeeIds },
          batch: { month, year },
        },
        select: {
          userId: true,
          resolution: true,
        },
      }),
      // Latest contract per employee (holdover when it ended without renewal).
      this.prisma.employeeContract.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: { not: 'DRAFT' },
          startDate: { lte: monthEnd },
        },
        select: contractSelect,
        orderBy: [{ employeeId: 'asc' }, { startDate: 'desc' }],
        distinct: ['employeeId'],
      }),
      loadInactiveSpansForMonth(this.prisma, employeeIds, month, year),
      this.prisma.leaveRequest.findMany({
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: 'APPROVED',
          leaveType: 'UNPAID',
          periods: {
            some: {
              startDate: { lte: monthEnd },
              endDate: { gte: monthStart },
            },
          },
        },
        select: {
          employeeId: true,
          periods: {
            select: { startDate: true, endDate: true },
          },
        },
      }),
    ]);

    const unpaidLeavePeriodsByEmployee = new Map<
      string,
      Array<{ startDate: Date; endDate: Date }>
    >();
    for (const row of unpaidLeaveRows) {
      const list = unpaidLeavePeriodsByEmployee.get(row.employeeId) ?? [];
      for (const period of row.periods) {
        list.push({ startDate: period.startDate, endDate: period.endDate });
      }
      unpaidLeavePeriodsByEmployee.set(row.employeeId, list);
    }

    const latestContractByEmployee = new Map(
      latestContracts.map((c) => [c.employeeId, c]),
    );
    const rawContractsByEmployee = new Map<string, typeof contracts>();
    for (const contract of contracts) {
      const list = rawContractsByEmployee.get(contract.employeeId) ?? [];
      list.push(contract);
      rawContractsByEmployee.set(contract.employeeId, list);
    }
    // Contract ended without a new one while employment is open: still employed
    // and paid on the ended contract's terms until HR renews, converts or separates.
    const contractEndedOnByEmployee = new Map<string, Date>();
    const monthContracts: typeof contracts = [];
    for (const employee of employees) {
      const held = withContractHoldover(
        rawContractsByEmployee.get(employee.id) ?? [],
        latestContractByEmployee.get(employee.id),
        windowsByEmployee.get(employee.id) ?? null,
        monthEnd,
      );
      if (held.endedOn) {
        contractEndedOnByEmployee.set(employee.id, held.endedOn);
      }
      monthContracts.push(...held.contracts);
    }

    const contractsByEmployee = new Map<string, ContractSnapshot[]>();
    for (const { terminatedAt, ...contract } of monthContracts) {
      // Downstream day allocation reads endDate only, so fold termination and the
      // leaving date into it here. terminatedAt / employment-period end are the
      // inclusive last paid day — never cap below terminatedAt.
      const window = windowsByEmployee.get(contract.employeeId);
      let endDate = effectiveContractEnd(contract.endDate, terminatedAt);
      if (window?.end) {
        const windowIsEarlierCap =
          !endDate || window.end.getTime() < endDate.getTime();
        if (windowIsEarlierCap) {
          const wouldDropTerminatedAt =
            terminatedAt != null &&
            window.end.getTime() < terminatedAt.getTime();
          if (!wouldDropTerminatedAt) {
            endDate = window.end;
          }
        }
      }
      if (endDate && endDate.getTime() < contract.startDate.getTime()) {
        continue;
      }
      const list = contractsByEmployee.get(contract.employeeId) ?? [];
      list.push({ ...contract, endDate });
      contractsByEmployee.set(contract.employeeId, list);
    }

    /** Latest known end/termination per employee (for no-overlapping-contract windows). */
    const employmentEndByEmployee = new Map<string, Date>();
    for (const row of endedContractsForEmployment) {
      if (employmentEndByEmployee.has(row.employeeId)) {
        continue;
      }
      const end = effectiveContractEnd(row.endDate, row.terminatedAt);
      if (end) {
        employmentEndByEmployee.set(row.employeeId, end);
      }
    }
    for (const [employeeId, window] of windowsByEmployee) {
      if (!window.end) {
        continue;
      }
      const existing = employmentEndByEmployee.get(employeeId);
      // Prefer the later end so termination (last paid day) is never shortened.
      if (!existing || window.end.getTime() > existing.getTime()) {
        employmentEndByEmployee.set(employeeId, window.end);
      }
    }

    const attendanceByEmployee = new Map<string, AttendanceSnapshot>();
    for (const record of attendanceRecords as AttendanceSnapshot[]) {
      attendanceByEmployee.set(record.employeeId, record);
    }

    const overtimeByEmployee = new Map<string, OvertimeSnapshot>();
    for (const sheet of overtimeSheets) {
      overtimeByEmployee.set(sheet.employeeId, sheet);
    }

    const siteByEmployee = new Map<
      string,
      Array<{ siteName: string; startDate: Date; endDate: Date }>
    >();
    for (const row of siteAssignments) {
      const list = siteByEmployee.get(row.employeeId) ?? [];
      list.push({
        siteName: row.siteName,
        startDate: row.startDate,
        endDate: row.endDate,
      });
      siteByEmployee.set(row.employeeId, list);
    }

    const missingResolutionByEmployee = new Map<string, string>();
    for (const row of missingAttendanceRows) {
      missingResolutionByEmployee.set(row.userId, row.resolution);
    }

    const taxableThreshold = this.toNumber(run.taxableThreshold);
    // Policies as of the payroll month - never "current".
    const policy = await loadPolicySnapshot(this.prisma, ctx.companyId, monthStart);
    const drafts: EntryDraft[] = [];

    // Manual (paper-based) OT entered by HR on this run, added on top of system OT
    // and priced on the salary-period contract they were assigned to.
    const manualOtRows = await this.prisma.payrollOtAdjustment.findMany({
      where: {
        companyId: ctx.companyId,
        payrollRunId: run.id,
        employeeId: { in: employeeIds },
      },
      select: {
        employeeId: true,
        contractId: true,
        otCategory: true,
        hours: true,
      },
    });
    const manualOtByEmployee = new Map<string, ManualOtWithContract[]>();
    for (const row of manualOtRows) {
      const list = manualOtByEmployee.get(row.employeeId) ?? [];
      list.push({
        contractId: row.contractId,
        category: row.otCategory,
        hours: this.toNumber(row.hours),
      });
      manualOtByEmployee.set(row.employeeId, list);
    }

    for (const employee of employees) {
      const overlapping = contractsByEmployee.get(employee.id) ?? [];
      const attendance = attendanceByEmployee.get(employee.id);

      if (overlapping.length === 0 && !attendance) {
        continue;
      }

      const topUp = capturedTopUps.get(employee.id);
      drafts.push(
        await this.computeEntryDraft({
          run,
          ctx,
          employee,
          contracts: overlapping,
          employmentEndDate: employmentEndByEmployee.get(employee.id) ?? null,
          employmentWindow: windowsByEmployee.get(employee.id) ?? null,
          contractEndedOn: contractEndedOnByEmployee.get(employee.id) ?? null,
          inactiveSpans: inactiveSpansByEmployee.get(employee.id) ?? [],
          attendance,
          unpaidLeavePeriods: unpaidLeavePeriodsByEmployee.get(employee.id) ?? [],
          overtime: overtimeByEmployee.get(employee.id),
          siteAssignments: siteByEmployee.get(employee.id) ?? [],
          missingAttendanceResolution:
            missingResolutionByEmployee.get(employee.id) ?? null,
          taxableThreshold,
          policy,
          bonusTopUp: topUp?.bonusTopUp ?? 0,
          bonusTopUpReason: topUp?.bonusTopUpReason ?? null,
          netTopUp: topUp?.netTopUp ?? 0,
          netTopUpReason: topUp?.netTopUpReason ?? null,
          preservedNotes: topUp?.notes ?? null,
          manualOt: manualOtByEmployee.get(employee.id) ?? [],
        }),
      );
    }

    return drafts;
  }

  /**
   * Reclassify approved OT entries from start/end times (exact minutes).
   * Stored Decimal(5,2) hour columns are display-only for payroll pricing.
   */
  private async datedOtEntriesFromTimes(
    companyId: string,
    employee: EmployeeSnapshot,
    overtime: OvertimeSnapshot | undefined,
  ): Promise<DatedOvertimeEntry[]> {
    const rows = overtime?.entries ?? [];
    if (rows.length === 0) {
      return [];
    }

    const scheduleCache = new Map<
      string,
      Awaited<ReturnType<WorkScheduleService['getActiveSchedule']>>
    >();
    const holidayCache = new Map<string, boolean>();

    const dateKey = (d: Date): string => d.toISOString().slice(0, 10);

    const loadSchedule = async (onDate: Date) => {
      const key = dateKey(onDate);
      let schedule = scheduleCache.get(key);
      if (!schedule) {
        schedule = await this.workScheduleService.getActiveSchedule(
          employee.id,
          companyId,
          onDate,
        );
        scheduleCache.set(key, schedule);
      }
      return schedule;
    };

    const loadHoliday = async (onDate: Date): Promise<boolean> => {
      const key = dateKey(onDate);
      const cached = holidayCache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const calendar = await this.workScheduleService.isHolidayForEmployee(
        companyId,
        employee.nationality as Nationality | null,
        onDate,
      );
      holidayCache.set(key, calendar.isHoliday);
      return calendar.isHoliday;
    };

    const weekdaySlice = (
      schedule: Awaited<ReturnType<WorkScheduleService['getActiveSchedule']>>,
      onDate: Date,
    ): OvertimeWeekdaySlice | undefined => {
      const row = schedule.days.find(
        (day) => day.dayOfWeek === onDate.getUTCDay(),
      );
      if (!row) {
        return undefined;
      }
      return {
        isWorkingDay: row.isWorkingDay,
        isHalfDay: row.isHalfDay,
        morningStart: row.morningStart,
        morningEnd: row.morningEnd,
        afternoonStart: row.afternoonStart,
        afternoonEnd: row.afternoonEnd,
      };
    };

    const siteDayKeys = await this.siteAssignmentDateKeysForEmployee(
      companyId,
      employee.id,
      rows.map((entry) => entry.date),
    );

    const dated: DatedOvertimeEntry[] = [];
    for (const entry of rows) {
      const onDate = new Date(
        Date.UTC(
          entry.date.getUTCFullYear(),
          entry.date.getUTCMonth(),
          entry.date.getUTCDate(),
        ),
      );
      const schedule = await loadSchedule(onDate);
      const isHoliday =
        entry.isHoliday || (await loadHoliday(onDate));
      const siteClaimable = siteDayKeys.has(dateKey(onDate));
      const context = buildOvertimeDayContext(
        weekdaySlice(schedule, onDate),
        isHoliday,
        await getPolicy(this.prisma, companyId, 'lunchCountsAsOvertime', onDate),
        siteClaimable,
      );

      let nextDayContext: ReturnType<typeof buildOvertimeDayContext> | undefined;
      if (entry.isOvernight) {
        const nextDate = new Date(onDate.getTime());
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        const nextSchedule = await loadSchedule(nextDate);
        const nextHoliday = await loadHoliday(nextDate);
        nextDayContext = buildOvertimeDayContext(
          weekdaySlice(nextSchedule, nextDate),
          nextHoliday,
          await getPolicy(this.prisma, companyId, 'lunchCountsAsOvertime', nextDate),
          siteDayKeys.has(dateKey(nextDate)),
        );
      }

      dated.push(
        datedEntryFromExactMinutes({
          date: onDate,
          startTime: formatOvertimeTimeHhMm(entry.startTime),
          endTime: overtimeEndTimeLabel(
            entry.endTime,
            entry.endsAtEndOfDay,
            entry.isOvernight,
          ),
          isOvernight: entry.isOvernight,
          context,
          nextDayContext,
        }),
      );
    }
    return dated;
  }

  /** UTC date keys (YYYY-MM-DD) covered by approved site assignments for OT repricing. */
  private async siteAssignmentDateKeysForEmployee(
    companyId: string,
    employeeId: string,
    entryDates: Date[],
  ): Promise<Set<string>> {
    if (entryDates.length === 0) {
      return new Set();
    }
    let min = entryDates[0];
    let max = entryDates[0];
    for (const d of entryDates) {
      if (d < min) {
        min = d;
      }
      if (d > max) {
        max = d;
      }
    }
    const maxInclusive = new Date(
      Date.UTC(max.getUTCFullYear(), max.getUTCMonth(), max.getUTCDate() + 1),
    );
    const minDay = new Date(
      Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), min.getUTCDate()),
    );

    const assignments = await this.prisma.siteAssignment.findMany({
      where: {
        companyId,
        employeeId,
        status: 'APPROVED',
        deletedAt: null,
        startDate: { lte: maxInclusive },
        endDate: { gte: minDay },
      },
      select: { startDate: true, endDate: true },
    });

    const keys = new Set<string>();
    for (const assignment of assignments) {
      let cursor = new Date(
        Date.UTC(
          assignment.startDate.getUTCFullYear(),
          assignment.startDate.getUTCMonth(),
          assignment.startDate.getUTCDate(),
        ),
      );
      const end = new Date(
        Date.UTC(
          assignment.endDate.getUTCFullYear(),
          assignment.endDate.getUTCMonth(),
          assignment.endDate.getUTCDate(),
        ),
      );
      while (cursor.getTime() <= end.getTime()) {
        keys.add(cursor.toISOString().slice(0, 10));
        cursor = new Date(
          Date.UTC(
            cursor.getUTCFullYear(),
            cursor.getUTCMonth(),
            cursor.getUTCDate() + 1,
          ),
        );
      }
    }
    return keys;
  }

  private async computeEntryDraft(input: {
    run: PayrollRun;
    ctx: ServiceContext;
    employee: EmployeeSnapshot;
    contracts: ContractSnapshot[];
    /** End/termination when there is no overlapping contract this month. */
    employmentEndDate?: Date | null;
    employmentWindow?: EmploymentWindow | null;
    /** Last contract ended without renewal; pay continues on its terms. */
    contractEndedOn?: Date | null;
    /** Inactive periods overlapping the month. */
    inactiveSpans?: InactiveSpan[];
    attendance: AttendanceSnapshot | undefined;
    /** Approved UNPAID leave periods overlapping the payroll month. */
    unpaidLeavePeriods?: Array<{ startDate: Date; endDate: Date }>;
    overtime: OvertimeSnapshot | undefined;
    siteAssignments: Array<{
      siteName: string;
      startDate: Date;
      endDate: Date;
    }>;
    missingAttendanceResolution?: string | null;
    taxableThreshold: number;
    /** Policies in force for the payroll month. */
    policy: PolicyValues;
    bonusTopUp: number;
    bonusTopUpReason: string | null;
    netTopUp: number;
    netTopUpReason: string | null;
    preservedNotes: string | null;
    /** Manual (paper-based) OT adjustments for this employee on this run. */
    manualOt?: ManualOtWithContract[];
  }): Promise<EntryDraft> {
    const {
      run,
      ctx,
      employee,
      contracts,
      attendance: recordedAttendance,
      overtime,
      siteAssignments,
      taxableThreshold,
      policy,
      bonusTopUp,
      bonusTopUpReason,
      netTopUp,
      netTopUpReason,
      preservedNotes,
    } = input;
    // Attendance off for this run: calculate as if there were no attendance
    // record (all employed days paid; approved unpaid leave and unpaid inactive
    // days still deducted). The recorded attendance still decides the roster.
    const attendanceIgnored = run.considerAttendance === false;
    const attendance = attendanceIgnored ? undefined : recordedAttendance;

    const monthStart = new Date(Date.UTC(run.year, run.month - 1, 1));
    const monthEnd = new Date(Date.UTC(run.year, run.month, 0));

    const sorted = [...contracts].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );

    const periodDetails: Array<{
      contract: ContractSnapshot;
      days: number;
      window: DateWindow | null;
      periodEarned: number;
      basicSalary: number;
    }> = [];

    let totalEmployedDays = 0;
    const windows: DateWindow[] = [];

    // Joiner/leaver: overlapping contracts when present; otherwise employmentDate
    // (+ optional end/termination). Never assume the whole month with no contract.
    const fallbackSegments = resolveEmploymentSegmentsForMonth({
      overlappingContracts: sorted.map((c) => ({
        startDate: c.startDate,
        endDate: c.endDate,
      })),
      employmentDate: employee.employmentDate,
      employmentEndDate: input.employmentEndDate ?? null,
    });
    const employmentStart =
      sorted.length > 0
        ? sorted.reduce(
            (min, c) =>
              c.startDate.getTime() < min.getTime() ? c.startDate : min,
            sorted[0].startDate,
          )
        : (fallbackSegments[0]?.startDate ?? null);
    const employmentEnd = (() => {
      if (sorted.length === 0) {
        return fallbackSegments[0]?.endDate ?? null;
      }
      let openEnded = false;
      let maxEnd: Date | null = null;
      for (const contract of sorted) {
        if (!contract.endDate) {
          openEnded = true;
          break;
        }
        if (!maxEnd || contract.endDate.getTime() > maxEnd.getTime()) {
          maxEnd = contract.endDate;
        }
      }
      return openEnded ? null : maxEnd;
    })();

    if (employmentStart) {
      const employmentDays = employedPayrollDays(
        run.month,
        run.year,
        employmentStart,
        employmentEnd,
      );
      totalEmployedDays = employmentDays.days;
    }

    const allocations =
      sorted.length > 0 && employmentStart
        ? allocateContractPayrollDays(
            run.month,
            run.year,
            sorted.map((c) => ({
              id: c.id,
              startDate: c.startDate,
              endDate: c.endDate,
            })),
            employmentStart,
            employmentEnd,
          )
        : [];
    const contractById = new Map(sorted.map((c) => [c.id, c]));

    const lastDayOfMonth = monthEnd.getUTCDate();
    for (const allocation of allocations) {
      const contract = contractById.get(allocation.contractId);
      if (!contract || allocation.days <= 0) {
        continue;
      }
      const calendarStartDay =
        allocation.startDay >= 31 ? lastDayOfMonth : allocation.startDay;
      const calendarEndDay =
        allocation.endDay >= 30
          ? lastDayOfMonth
          : Math.min(allocation.endDay, lastDayOfMonth);
      const resolvedWindow: DateWindow = {
        windowStart: new Date(
          Date.UTC(run.year, run.month - 1, calendarStartDay),
        ),
        windowEnd: new Date(Date.UTC(run.year, run.month - 1, calendarEndDay)),
      };
      const basic = await this.resolveBasicSalary(
        ctx.companyId,
        employee.id,
        resolvedWindow.windowEnd,
        this.toNumber(contract.basicSalary),
      );
      const periodEarned = this.round((basic / 30) * allocation.days);
      periodDetails.push({
        contract,
        days: allocation.days,
        window: resolvedWindow,
        periodEarned,
        basicSalary: basic,
      });
      windows.push(resolvedWindow);
    }
    let absentInWindow = 0;
    let payrollDays = totalEmployedDays;
    const noteParts: string[] = [];

    // Inactive periods: stays on the roster; unpaid days deducted like unpaid leave.
    const inactive = this.inactiveSummary(
      input.inactiveSpans ?? [],
      input.employmentWindow ?? null,
      monthStart,
      monthEnd,
      policy,
    );

    if (attendance) {
      const plainAbsent = this.toNumber(attendance.absentDays);
      payrollDays = this.toNumber(attendance.paidDays);
      // Prefer stored counter when Prisma client knows the field; else sum logs.
      const unpaidFromRecord = this.toNumber(attendance.unpaidLeaveDays);
      const unpaidFromLogs = attendance.dailyLogs.reduce((sum, log) => {
        if (log.dayStatus === 'UNPAID_LEAVE') {
          return sum + this.toNumber(log.dayDeduction);
        }
        return sum;
      }, 0);
      // The stored counter also holds unpaid inactive days (listed separately).
      const inactiveUnpaidFromLogs = attendance.dailyLogs.reduce(
        (sum, log) =>
          log.dayStatus === 'INACTIVE' ? sum + this.toNumber(log.dayDeduction) : sum,
        0,
      );
      const unpaidTotal =
        unpaidFromRecord > 0
          ? unpaidFromRecord
          : unpaidFromLogs + inactiveUnpaidFromLogs;
      const unpaidLeaveOnly = Math.max(
        0,
        unpaidTotal - inactiveUnpaidFromLogs,
      );
      // Unpaid leave (and unpaid inactive) reduce paid days like absence —
      // fold into absentDays so payroll UI / exports treat them the same.
      absentInWindow = this.round(plainAbsent + unpaidTotal);
      if (unpaidLeaveOnly > 0) {
        noteParts.push(`Unpaid leave: ${unpaidLeaveOnly} days`);
      }
      if (inactiveUnpaidFromLogs > 0) {
        noteParts.push(`Unpaid inactive: ${inactiveUnpaidFromLogs} days`);
      }
      const wouldDeduct = this.toNumber(
        attendance.earlyDepartureWouldDeductDays,
      );
      if (wouldDeduct > 0) {
        noteParts.push(
          `Would deduct ${wouldDeduct} day(s) for early departure (not applied)`,
        );
      }
    }

    if (!attendance && inactive.unpaidDays > 0) {
      // No attendance record to carry the deduction: apply it here.
      payrollDays = Math.max(0, payrollDays - inactive.unpaidDays);
      absentInWindow = this.round(absentInWindow + inactive.unpaidDays);
    }

    // Approved UNPAID leave: reduce payrollDays when attendance is missing or
    // unpaid leave was not reflected in paidDays (e.g. still marked LEAVE).
    const unpaidPeriods = input.unpaidLeavePeriods ?? [];
    const employedRangeStart = employmentStart
      ? new Date(
          Math.max(employmentStart.getTime(), monthStart.getTime()),
        )
      : monthStart;
    const employedRangeEnd = employmentEnd
      ? new Date(Math.min(employmentEnd.getTime(), monthEnd.getTime()))
      : monthEnd;
    const unpaidDateKeys =
      unpaidPeriods.length > 0 &&
      employedRangeStart.getTime() <= employedRangeEnd.getTime()
        ? unpaidLeaveDateKeysInRange(
            unpaidPeriods,
            employedRangeStart,
            employedRangeEnd,
          )
        : [];
    const unpaidStillToDeduct = unpaidLeaveDaysStillToDeduct({
      unpaidDateKeys,
      dailyLogs: attendance
        ? attendance.dailyLogs.map((log) => ({
            date: log.date,
            dayDeduction: this.toNumber(log.dayDeduction),
            dayStatus: log.dayStatus,
          }))
        : null,
    });
    if (unpaidStillToDeduct > 0) {
      payrollDays = Math.max(0, this.round(payrollDays - unpaidStillToDeduct));
      absentInWindow = this.round(absentInWindow + unpaidStillToDeduct);
      noteParts.push(`Unpaid leave: ${unpaidStillToDeduct} days`);
    }

    const fullyAbsentWorkingDays =
      this.isFullyAbsentWorkingMonth(attendance, windows) || payrollDays === 0;

    for (const assignment of siteAssignments) {
      const rangeStart = new Date(
        Math.max(assignment.startDate.getTime(), monthStart.getTime()),
      );
      const rangeEnd = new Date(
        Math.min(assignment.endDate.getTime(), monthEnd.getTime()),
      );
      if (rangeStart.getTime() > rangeEnd.getTime()) {
        continue;
      }
      const msPerDay = 24 * 60 * 60 * 1000;
      const days =
        Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / msPerDay) + 1;
      noteParts.push(`${days} day(s) on site at ${assignment.siteName}`);
    }
    // Absences reduce earned pay; scale multi-contract period earneds.
    const earnedScale =
      totalEmployedDays > 0 ? payrollDays / totalEmployedDays : 0;
    const sumEarned = this.round(
      periodDetails.reduce(
        (sum, p) => sum + p.periodEarned * earnedScale,
        0,
      ),
    );

    const monthEndContract =
      sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
    const monthEndBasic = await this.resolveBasicSalary(
      ctx.companyId,
      employee.id,
      monthEnd,
      this.toNumber(monthEndContract?.basicSalary),
    );
    // Fully absent / zero paid days: no transport, bonuses, net bonuses, or pension.
    // OT is also zeroed when payrollDays === 0 (full unpaid month).

    // Prorate transport and monthly bonus using the same contract-period split as
    // earned salary.  For a single full-month contract this equals the contract
    // amount; for joiners/leavers/renewals each contract contributes
    // amount × contractDays / 30.
    const noLeaverDays = employmentStart
      ? employedPayrollDays(run.month, run.year, employmentStart, null).days
      : totalEmployedDays;
    const proratedAllowances = computeContractAllowances(
      periodDetails.map((p) => ({
        transportationAllowance: this.toNumber(p.contract.transportationAllowance),
        monthlyBonus: this.toNumber(p.contract.monthlyBonus),
        allocatedDays: p.days,
      })),
      totalEmployedDays,
      payrollDays,
      noLeaverDays,
      policy.leaverAllowanceMode,
      policy.allowancesReducedByAbsence,
    );
    let transport = proratedAllowances.transport;
    let monthlyBonus = proratedAllowances.monthlyBonus;
    let contractNetBonus = this.toNumber(monthEndContract?.monthlyNetBonus);
    let effectiveBonusTopUp = bonusTopUp;
    let effectiveNetTopUp = netTopUp;
    // Freelancers always pay pension, whatever the contract flag says.
    let pensionApplicable =
      employee.employeeType === 'FREELANCER' ||
      (monthEndContract?.pensionApplicable ?? true);
    const taxApplicable = monthEndContract?.taxApplicable ?? true;
    // Full month unpaid / zero paid days: no transport, bonuses, pension, or OT.
    // TODO(HR): confirm whether any fixed contractual allowances should still pay.
    let zeroOtForUnpaidMonth = false;
    if (fullyAbsentWorkingDays) {
      transport = 0;
      monthlyBonus = 0;
      contractNetBonus = 0;
      effectiveBonusTopUp = 0;
      effectiveNetTopUp = 0;
      pensionApplicable = false;
      zeroOtForUnpaidMonth = payrollDays === 0;
      noteParts.push(FULLY_ABSENT_NO_PAY_NOTE);
    } else if (periodDetails.length > 1) {
      // Show per-contract allowance breakdown when contracts split mid-month.
      const fmt = (n: number): string =>
        n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const bonusParts = periodDetails.map((p) => {
        const b = this.toNumber(p.contract.monthlyBonus);
        const contrib = this.round((b * p.days) / 30);
        return `${fmt(contrib)} (${fmt(b)} contract, ${p.days} d)`;
      });
      noteParts.push(`Bonus: ${bonusParts.join(' + ')}`);
      const transportParts = periodDetails.map((p) => {
        const t = this.toNumber(p.contract.transportationAllowance);
        const contrib = this.round((t * p.days) / 30);
        return `${fmt(contrib)} (${fmt(t)} contract, ${p.days} d)`;
      });
      noteParts.push(`Transport: ${transportParts.join(' + ')}`);
    }

    const attendanceFlag = resolveEntryAttendanceFlag({
      hasContract: sorted.length > 0,
      attendance: recordedAttendance,
      missingResolution: input.missingAttendanceResolution,
      monthEndBasic,
      attendanceIgnored,
    });
    // Final settlement: only items enabled in the policy for this payroll month.
    const window = input.employmentWindow ?? null;
    const settlement =
      window?.leftInMonth && window.end
        ? computeFinalSettlement({
            basicSalary: monthEndBasic,
            leavingDate: window.end,
            employmentStart: window.start,
            unusedLeaveDays: policy.unusedLeavePayout.enabled
              ? await this.unusedAnnualLeaveDays(
                  employee.id,
                  ctx.companyId,
                  window.end,
                  // Values saved before the field existed count as true.
                  policy.unusedLeavePayout.prorateCurrentYear !== false,
                )
              : null,
            policy,
          })
        : null;
    const settlementApplied = settlement?.anyEnabled ? settlement : null;

    const employmentFlag = resolveEmploymentEntryFlag({
      baseFlag: attendanceFlag.flag,
      baseNote: attendanceFlag.flagNote,
      window,
      isActive: employee.isActive,
      inactiveNote: inactive.note,
      contractEndedOn: input.contractEndedOn ?? null,
      settlementNotes: settlementApplied?.notes ?? null,
    });
    const flag: PayrollEntryFlag = employmentFlag.flag;
    const flagNote = employmentFlag.flagNote;
    if (attendanceFlag.entryNote) {
      noteParts.push(attendanceFlag.entryNote);
    }

    const datedEntries: DatedOvertimeEntry[] =
      await this.datedOtEntriesFromTimes(ctx.companyId, employee, overtime);
    const sheetTotals: OvertimeHours = {
      normalHours: this.toNumber(overtime?.totalRegularHours),
      eveningHours: this.toNumber(overtime?.totalNightHours),
      sundayHours: this.toNumber(overtime?.totalWeekendHours),
      holidayHours: this.toNumber(overtime?.totalHolidayHours),
    };

    const otPeriodWindows = periodDetails
      .filter((p) => p.window != null)
      .map((p) => ({
        contractId: p.contract.id,
        periodStart: p.window!.windowStart,
        periodEnd: p.window!.windowEnd,
        basicSalary: p.basicSalary,
      }));

    const assignedOt = assignOvertimeToSalaryPeriods({
      entries: datedEntries,
      periods: otPeriodWindows,
      sheetTotals,
      monthEndBasic,
      rates: policy,
    });

    if (assignedOt.usedMonthEndFallback) {
      noteParts.push(OT_FALLBACK_MONTH_END_NOTE);
    }

    const overtimeHours: OvertimeHours = zeroOtForUnpaidMonth
      ? {
          normalHours: 0,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        }
      : {
          normalHours: assignedOt.totals.normalHours,
          eveningHours: assignedOt.totals.eveningHours,
          sundayHours: assignedOt.totals.sundayHours,
          holidayHours: assignedOt.totals.holidayHours,
        };

    const systemOtPay = zeroOtForUnpaidMonth
      ? {
          normalOtPay: 0,
          eveningOtPay: 0,
          sundayOtPay: 0,
          holidayOtPay: 0,
        }
      : {
          normalOtPay: assignedOt.totals.normalOtPay,
          eveningOtPay: assignedOt.totals.eveningOtPay,
          sundayOtPay: assignedOt.totals.sundayOtPay,
          holidayOtPay: assignedOt.totals.holidayOtPay,
        };
    // System OT (above) plus manual paper-based OT, priced per salary-period
    // contract basic. A month that pays no OT pays no manual OT either.
    const manualOtInput = zeroOtForUnpaidMonth ? [] : (input.manualOt ?? []);
    const manualByContract = new Map<string, ManualOtAdjustmentInput[]>();
    for (const row of manualOtInput) {
      const list = manualByContract.get(row.contractId) ?? [];
      list.push({ category: row.category, hours: row.hours });
      manualByContract.set(row.contractId, list);
    }
    const contractIdsForOt = new Set<string>([
      ...otPeriodWindows.map((p) => p.contractId),
      ...manualByContract.keys(),
    ]);
    if (contractIdsForOt.size === 0 && monthEndContract) {
      contractIdsForOt.add(monthEndContract.id);
    }
    const combinedOt = combineManualOvertimeByContracts(
      [...contractIdsForOt].map((contractId) => {
        const periodOt = assignedOt.periods.find((p) => p.contractId === contractId);
        const periodBasic =
          otPeriodWindows.find((p) => p.contractId === contractId)?.basicSalary ??
          monthEndBasic;
        return {
          contractId,
          basicSalary: periodBasic,
          systemHours: zeroOtForUnpaidMonth
            ? {
                normalHours: 0,
                eveningHours: 0,
                sundayHours: 0,
                holidayHours: 0,
              }
            : {
                normalHours: periodOt?.normalHours ?? 0,
                eveningHours: periodOt?.eveningHours ?? 0,
                sundayHours: periodOt?.sundayHours ?? 0,
                holidayHours: periodOt?.holidayHours ?? 0,
              },
          systemPay: zeroOtForUnpaidMonth
            ? {
                normalOtPay: 0,
                eveningOtPay: 0,
                sundayOtPay: 0,
                holidayOtPay: 0,
              }
            : {
                normalOtPay: periodOt?.normalOtPay ?? 0,
                eveningOtPay: periodOt?.eveningOtPay ?? 0,
                sundayOtPay: periodOt?.sundayOtPay ?? 0,
                holidayOtPay: periodOt?.holidayOtPay ?? 0,
              },
          adjustments: manualByContract.get(contractId) ?? [],
        };
      }),
      policy,
    );
    // Single-contract employees with no period windows: fall back to entry-level
    // system totals so undated sheet OT is not dropped.
    const useEntryLevelSystem =
      contractIdsForOt.size <= 1 &&
      assignedOt.periods.length === 0 &&
      !zeroOtForUnpaidMonth;
    const entryCombined = useEntryLevelSystem
      ? combineManualOvertimeByContracts(
          [
            {
              contractId: monthEndContract?.id ?? [...contractIdsForOt][0] ?? 'none',
              basicSalary: monthEndBasic,
              systemHours: overtimeHours,
              systemPay: systemOtPay,
              adjustments: manualOtInput.map((row) => ({
                category: row.category,
                hours: row.hours,
              })),
            },
          ],
          policy,
        )
      : combinedOt;
    const manualOt: Array<AppliedManualOt & { contractId: string }> = [];
    for (const group of entryCombined.appliedByContract) {
      for (const applied of group.applied) {
        manualOt.push({ ...applied, contractId: group.contractId });
      }
    }

    const result = this.calc.calculate({
      basicSalary: monthEndBasic,
      transportAllowance: transport,
      monthlyBonus,
      bonusTopUp: effectiveBonusTopUp,
      contractNetBonus,
      netTopUp: effectiveNetTopUp,
      payrollDays,
      earnedSalary: sumEarned,
      overtimeHours: entryCombined.hours,
      overtimePay: {
        normalOtPay: entryCombined.pay.normalOtPay,
        eveningOtPay: entryCombined.pay.eveningOtPay,
        sundayOtPay: entryCombined.pay.sundayOtPay,
        holidayOtPay: entryCombined.pay.holidayOtPay,
      },
      taxableThreshold,
      pensionApplicable,
      taxApplicable,
      policy,
      settlementTaxable: settlementApplied?.taxable ?? 0,
      settlementNonTaxable: settlementApplied?.nonTaxable ?? 0,
    });

    const entryId = randomUUID();
    const notesFromGenerate = noteParts.length > 0 ? noteParts.join('. ') : null;
    const notes = preservedNotes ?? notesFromGenerate;

    const periodTotalsByContract = new Map(
      entryCombined.periodTotals.map((p) => [p.contractId, p]),
    );

    const salaryPeriods: SalaryPeriodDraft[] = [];
    if (periodDetails.length > 1) {
      for (const period of periodDetails) {
        const window = period.window;
        if (!window) {
          continue;
        }
        const ot = periodTotalsByContract.get(period.contract.id);
        salaryPeriods.push({
          id: randomUUID(),
          entryId,
          contractId: period.contract.id,
          periodStart: window.windowStart,
          periodEnd: window.windowEnd,
          days: this.round(period.days * earnedScale),
          basicSalary: period.basicSalary,
          earnedSalary: this.round(period.periodEarned * earnedScale),
          normalOtHours: ot?.hours.normalHours ?? 0,
          eveningOtHours: ot?.hours.eveningHours ?? 0,
          sundayOtHours: ot?.hours.sundayHours ?? 0,
          holidayOtHours: ot?.hours.holidayHours ?? 0,
          normalOtPay: ot?.pay.normalOtPay ?? 0,
          eveningOtPay: ot?.pay.eveningOtPay ?? 0,
          sundayOtPay: ot?.pay.sundayOtPay ?? 0,
          holidayOtPay: ot?.pay.holidayOtPay ?? 0,
          totalOtPay: ot?.pay.totalOtPay ?? 0,
        });
      }
    }

    const entry: Prisma.PayrollEntryCreateManyInput = {
      id: entryId,
      companyId: ctx.companyId,
      runId: run.id,
      employeeId: employee.id,
      contractId: monthEndContract?.id ?? null,
      attendanceRecordId: attendance?.id ?? null,
      overtimeSheetId: overtime?.id ?? null,
      scheduledDays: new Decimal(
        attendance ? this.toNumber(attendance.scheduledDays) : 0,
      ),
      presentDays: new Decimal(
        attendance ? this.toNumber(attendance.presentDays) : 0,
      ),
      absentDays: new Decimal(absentInWindow),
      employedDays: new Decimal(totalEmployedDays),
      payrollDays: new Decimal(result.payrollDays),
      basicSalary: new Decimal(monthEndBasic),
      transportAllowance: new Decimal(transport),
      monthlyBonus: new Decimal(monthlyBonus),
      contractNetBonus: new Decimal(contractNetBonus),
      earnedSalary: new Decimal(result.earnedSalary),
      normalOtHours: new Decimal(entryCombined.hours.normalHours),
      eveningOtHours: new Decimal(entryCombined.hours.eveningHours),
      sundayOtHours: new Decimal(entryCombined.hours.sundayHours),
      holidayOtHours: new Decimal(entryCombined.hours.holidayHours),
      normalOtPay: new Decimal(result.normalOtPay),
      eveningOtPay: new Decimal(result.eveningOtPay),
      sundayOtPay: new Decimal(result.sundayOtPay),
      holidayOtPay: new Decimal(result.holidayOtPay),
      totalOtPay: new Decimal(result.totalOtPay),
      taxableTransport: new Decimal(result.taxableTransport),
      nonTaxableTransport: new Decimal(result.nonTaxableTransport),
      grossIncome: new Decimal(result.grossIncome),
      taxableIncome: new Decimal(result.taxableIncome),
      pensionEmployee: new Decimal(result.pensionEmployee),
      pensionEmployer: new Decimal(result.pensionEmployer),
      incomeTax: new Decimal(result.incomeTax),
      totalDeductions: new Decimal(result.totalDeductions),
      netPay: new Decimal(result.netPay),
      unusedLeavePayout: new Decimal(settlementApplied?.unusedLeavePayout ?? 0),
      severancePay: new Decimal(settlementApplied?.severancePay ?? 0),
      noticePay: new Decimal(settlementApplied?.noticePay ?? 0),
      bonusTopUp: new Decimal(effectiveBonusTopUp),
      bonusTopUpReason: fullyAbsentWorkingDays ? null : bonusTopUpReason,
      netTopUp: new Decimal(effectiveNetTopUp),
      netTopUpReason: fullyAbsentWorkingDays ? null : netTopUpReason,
      flag,
      flagNote: flagNote ?? null,
      bankName: employee.bankName,
      bankAccountNumber: employee.bankAccountNumber,
      employeeCategory: employee.employeeType,
      notes,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    };

    return { entry, salaryPeriods, manualOt };
  }

  /** Inactive days in the employed part of the month, by type, with paid/unpaid split. */
  private inactiveSummary(
    spans: InactiveSpan[],
    window: EmploymentWindow | null,
    monthStart: Date,
    monthEnd: Date,
    policy: PolicyValues,
  ): { note: string | null; unpaidDays: number } {
    if (spans.length === 0) {
      return { note: null, unpaidDays: 0 };
    }
    const from =
      window?.start && window.start.getTime() > monthStart.getTime()
        ? window.start
        : monthStart;
    const to =
      window?.end && window.end.getTime() < monthEnd.getTime() ? window.end : monthEnd;
    const byType = inactiveDaysByType(spans, from, to);
    if (byType.size === 0) {
      return { note: null, unpaidDays: 0 };
    }
    const label: Record<string, string> = {
      SUSPENDED: 'Suspended',
      LONG_LEAVE: 'Long leave',
      OTHER: 'Other',
    };
    let unpaidDays = 0;
    const parts: string[] = [];
    for (const [type, days] of byType) {
      const paid = policy.inactivePaid[type] === true;
      if (!paid) unpaidDays += days;
      parts.push(`Inactive (${label[type] ?? type}) ${days} day(s) - ${paid ? 'paid' : 'unpaid'}`);
    }
    return { note: parts.join('; '), unpaidDays };
  }

  /**
   * Unused annual leave on the leaving date (prorated to the leaving date unless
   * the policy says otherwise); null when the ledger cannot answer.
   */
  private async unusedAnnualLeaveDays(
    employeeId: string,
    companyId: string,
    leavingDate: Date,
    prorateCurrentYear: boolean,
  ): Promise<number | null> {
    try {
      const balance = await this.leaveLedger.getLeaveBalance(
        employeeId,
        companyId,
        'ANNUAL',
        leavingDate,
      );
      return unusedLeaveDaysAtLeaving(
        {
          entitled: balance.entitled,
          broughtForward: balance.broughtForward,
          used: balance.used,
          pending: balance.pending,
          remaining: balance.remaining,
          yearStart: balance.year.start,
          yearEnd: balance.year.end,
        },
        leavingDate,
        prorateCurrentYear,
      );
    } catch (error) {
      this.logger.warn(
        `Unused leave balance unavailable for ${employeeId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async persistEntryDrafts(
    drafts: EntryDraft[],
    ctx: ServiceContext,
  ): Promise<void> {
    if (drafts.length === 0) {
      return;
    }

    // Record what each manual OT adjustment added, so it can be removed exactly.
    for (const draft of drafts) {
      for (const applied of draft.manualOt ?? []) {
        await this.prisma.payrollOtAdjustment.updateMany({
          where: {
            companyId: ctx.companyId,
            payrollRunId: draft.entry.runId,
            employeeId: draft.entry.employeeId,
            contractId: applied.contractId,
            otCategory: applied.category,
          },
          data: {
            appliedHours: new Decimal(applied.hours),
            amount: new Decimal(applied.amount),
          },
        });
      }
    }

    for (let i = 0; i < drafts.length; i += ENTRY_WRITE_CHUNK) {
      const chunk = drafts.slice(i, i + ENTRY_WRITE_CHUNK);
      await this.prisma.payrollEntry.createMany({
        data: chunk.map((d) => d.entry),
      });

      const periods = chunk.flatMap((d) => d.salaryPeriods);
      if (periods.length > 0) {
        // Core columns via Prisma; OT columns via SQL so deploy works before
        // `prisma generate` can refresh the client (engine often locked by Nest).
        await this.prisma.payrollSalaryPeriod.createMany({
          data: periods.map((p) => ({
            id: p.id,
            entryId: p.entryId,
            contractId: p.contractId,
            periodStart: p.periodStart,
            periodEnd: p.periodEnd,
            days: new Decimal(p.days),
            basicSalary: new Decimal(p.basicSalary),
            earnedSalary: new Decimal(p.earnedSalary),
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })),
        });
        for (const p of periods) {
          // id is text (Prisma String), not uuid - do not cast ::uuid.
          await this.prisma.$executeRaw`
            UPDATE payroll_salary_period SET
              normal_ot_hours = ${p.normalOtHours},
              evening_ot_hours = ${p.eveningOtHours},
              sunday_ot_hours = ${p.sundayOtHours},
              holiday_ot_hours = ${p.holidayOtHours},
              normal_ot_pay = ${p.normalOtPay},
              evening_ot_pay = ${p.eveningOtPay},
              sunday_ot_pay = ${p.sundayOtPay},
              holiday_ot_pay = ${p.holidayOtPay},
              total_ot_pay = ${p.totalOtPay}
            WHERE id = ${p.id}
          `;
        }
      }
    }
  }

  private async recalcEntryAmounts(
    entry: PayrollEntry,
    run: Pick<PayrollRun, 'taxableThreshold' | 'companyId' | 'month' | 'year'>,
    topUps: { bonusTopUp: number; netTopUp: number },
  ): Promise<PayrollCalculationResult> {
    const policy = await loadPolicySnapshot(
      this.prisma,
      run.companyId,
      new Date(Date.UTC(run.year, run.month - 1, 1)),
    );
    let pensionApplicable = true;
    let taxApplicable = true;
    if (entry.contractId) {
      const contract = await this.prisma.employeeContract.findFirst({
        where: { id: entry.contractId, deletedAt: null },
        select: { pensionApplicable: true, taxApplicable: true },
      });
      if (contract) {
        pensionApplicable = contract.pensionApplicable;
        taxApplicable = contract.taxApplicable;
      }
    }
    // Freelancers always pay pension, whatever the contract flag says.
    if (entry.employeeCategory === 'FREELANCER') {
      pensionApplicable = true;
    }

    // Preserve stored final-settlement lines (severance may be untaxed per policy).
    const severance = this.toNumber(entry.severancePay);
    const severanceUntaxed =
      (policy.severancePay.parameters as { taxable?: unknown } | undefined)?.taxable === false;
    const settlementTaxable =
      this.toNumber(entry.unusedLeavePayout) +
      this.toNumber(entry.noticePay) +
      (severanceUntaxed ? 0 : severance);

    // Preserve stored OT pay (may be multi-contract, priced per period basic).
    return this.calc.calculate({
      basicSalary: this.toNumber(entry.basicSalary),
      transportAllowance: this.toNumber(entry.transportAllowance),
      monthlyBonus: this.toNumber(entry.monthlyBonus),
      bonusTopUp: topUps.bonusTopUp,
      contractNetBonus: this.toNumber(entry.contractNetBonus),
      netTopUp: topUps.netTopUp,
      payrollDays: this.toNumber(entry.payrollDays),
      earnedSalary: this.toNumber(entry.earnedSalary),
      overtimeHours: {
        normalHours: this.toNumber(entry.normalOtHours),
        eveningHours: this.toNumber(entry.eveningOtHours),
        sundayHours: this.toNumber(entry.sundayOtHours),
        holidayHours: this.toNumber(entry.holidayOtHours),
      },
      overtimePay: {
        normalOtPay: this.toNumber(entry.normalOtPay),
        eveningOtPay: this.toNumber(entry.eveningOtPay),
        sundayOtPay: this.toNumber(entry.sundayOtPay),
        holidayOtPay: this.toNumber(entry.holidayOtPay),
      },
      taxableThreshold: this.toNumber(run.taxableThreshold),
      pensionApplicable,
      taxApplicable,
      policy,
      settlementTaxable,
      settlementNonTaxable: severanceUntaxed ? severance : 0,
    });
  }

  private calculationToEntryUpdate(
    result: PayrollCalculationResult,
  ): Prisma.PayrollEntryUncheckedUpdateInput {
    return {
      payrollDays: new Decimal(result.payrollDays),
      earnedSalary: new Decimal(result.earnedSalary),
      normalOtPay: new Decimal(result.normalOtPay),
      eveningOtPay: new Decimal(result.eveningOtPay),
      sundayOtPay: new Decimal(result.sundayOtPay),
      holidayOtPay: new Decimal(result.holidayOtPay),
      totalOtPay: new Decimal(result.totalOtPay),
      taxableTransport: new Decimal(result.taxableTransport),
      nonTaxableTransport: new Decimal(result.nonTaxableTransport),
      grossIncome: new Decimal(result.grossIncome),
      taxableIncome: new Decimal(result.taxableIncome),
      pensionEmployee: new Decimal(result.pensionEmployee),
      pensionEmployer: new Decimal(result.pensionEmployer),
      incomeTax: new Decimal(result.incomeTax),
      totalDeductions: new Decimal(result.totalDeductions),
      netPay: new Decimal(result.netPay),
    };
  }

  /**
   * Every WORKING / HALF_DAY day in the attendance month has full absence
   * (dayDeduction = 1). Matches {@link summarizeMonthAbsence} fully-absent rule.
   */
  private isFullyAbsentWorkingMonth(
    attendance: AttendanceSnapshot | undefined,
    windows: DateWindow[],
  ): boolean {
    if (!attendance) {
      return false;
    }
    return isFullyAbsentFromStoredLogs(
      this.toNumber(attendance.paidDays),
      attendance.dailyLogs.map((log) => ({
        date: log.date,
        dayDeduction: this.toNumber(log.dayDeduction),
        isHoliday: log.isHoliday,
        isWeekend: log.isWeekend,
        isHalfDay: log.isHalfDay,
      })),
      windows,
    );
  }

  private async updateRunTotals(
    runId: string,
    ctx: ServiceContext,
  ): Promise<void> {
    // One SUM query instead of loading every entry (runs after each entry edit).
    const sums = await this.prisma.payrollEntry.aggregate({
      where: { runId },
      _count: { _all: true },
      _sum: {
        grossIncome: true,
        netPay: true,
        contractNetBonus: true,
        netTopUp: true,
        pensionEmployee: true,
        pensionEmployer: true,
        incomeTax: true,
      },
    });
    const sum = sums._sum;
    const totals = {
      totalGross: this.toNumber(sum.grossIncome),
      totalNetPay: this.toNumber(sum.netPay),
      totalNetBonus: this.toNumber(sum.contractNetBonus) + this.toNumber(sum.netTopUp),
      totalPensionEmp: this.toNumber(sum.pensionEmployee),
      totalPensionEmr: this.toNumber(sum.pensionEmployer),
      totalTax: this.toNumber(sum.incomeTax),
    };

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        totalEmployees: sums._count._all,
        totalGross: new Decimal(this.round(totals.totalGross)),
        totalNetPay: new Decimal(this.round(totals.totalNetPay)),
        totalNetBonus: new Decimal(this.round(totals.totalNetBonus)),
        totalPensionEmp: new Decimal(this.round(totals.totalPensionEmp)),
        totalPensionEmr: new Decimal(this.round(totals.totalPensionEmr)),
        totalTax: new Decimal(this.round(totals.totalTax)),
        updatedBy: ctx.userId,
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private generateCorrectionRunNumber(
    month: number,
    year: number,
    sequence: number,
  ): string {
    const m = String(month).padStart(2, '0');
    return `PR-${year}-${m}-C${sequence}`;
  }

  /**
   * Unlock / correction: HR Manager, Local HR Manager, or System Administrator.
   * Approve stays on assertPayrollApprove (Local is excluded there).
   */
  private async assertCanUnlockOrCorrect(ctx: ServiceContext): Promise<void> {
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        role: { companyId: ctx.companyId, deletedAt: null },
      },
      select: { role: { select: { name: true } } },
    });
    const roleNames = roles.map((row) => row.role.name);
    if (
      isTrueSystemAdministrator(roleNames) ||
      roleNames.includes(HR_MANAGER_ROLE) ||
      roleNames.includes(LOCAL_HR_MANAGER_ROLE)
    ) {
      return;
    }
    throw new ForbiddenException(
      'Only HR Manager, Local HR Manager, or System Administrator can unlock or correct payroll',
    );
  }

  private async voidPayslipsForRun(
    runId: string,
    ctx: ServiceContext,
  ): Promise<void> {
    await this.prisma.payrollPayslip.deleteMany({
      where: { runId, companyId: ctx.companyId },
    });
  }

  private async deleteCorrectionRunCascade(
    runId: string,
    ctx: ServiceContext,
  ): Promise<void> {
    await this.voidPayslipsForRun(runId, ctx);
    await this.prisma.payrollSalaryPeriod.deleteMany({
      where: { entry: { runId } },
    });
    await this.prisma.payrollEntryAudit.deleteMany({
      where: { payrollEntry: { runId }, companyId: ctx.companyId },
    });
    await this.prisma.payrollEntry.deleteMany({
      where: { runId, companyId: ctx.companyId },
    });
    await this.prisma.payrollRun.delete({ where: { id: runId } });
  }

  private generateRunNumber(month: number, year: number): string {
    const m = String(month).padStart(2, '0');
    return `PR-${year}-${m}`;
  }

  /**
   * Position-history salaryOverride covering the pay date wins. Otherwise
   * the contract basic already chosen for that period is kept, which is the
   * same fallback as EffectiveSalaryService.getEffectiveSalary.
   */
  private async resolveBasicSalary(
    companyId: string,
    userId: string,
    payrollDate: Date,
    contractBasic: number,
  ): Promise<number> {
    const override = await this.effectiveSalary.findSalaryOverride(
      companyId,
      userId,
      payrollDate,
    );
    return override ?? contractBasic;
  }

  private toNumber(
    value: Decimal | number | string | null | undefined,
  ): number {
    if (value == null || value === '') {
      return 0;
    }
    return Number(value);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private maskBankAccount(account: string | null): string | null {
    if (!account) {
      return account;
    }
    const digits = account.replace(/\s+/g, '');
    if (digits.length <= 4) {
      return `••••${digits}`;
    }
    return `••••${digits.slice(-4)}`;
  }

  private async requireRun(
    runId: string,
    companyId: string,
  ): Promise<PayrollRun> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return run;
  }

  private async assertPayrollApprove(ctx: ServiceContext): Promise<void> {
    const ok = await this.permissions.hasPermission(
      ctx.userId,
      ctx.companyId,
      'payroll',
      'approve',
    );
    if (!ok) {
      throw new ForbiddenException('Missing permission: payroll.approve');
    }
  }

  private async findUserIdsByRoleNames(
    companyId: string,
    roleNames: readonly string[],
  ): Promise<string[]> {
    const assignments = await this.prisma.userRole.findMany({
      where: {
        deletedAt: null,
        role: {
          companyId,
          deletedAt: null,
          name: { in: [...roleNames] },
        },
        user: {
          companyId,
          isActive: true,
          deletedAt: null,
        },
      },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))];
  }

  /**
   * Sends notifications without failing the payroll workflow.
   */
  private async notifyMany(
    ctx: ServiceContext,
    recipientIds: string[],
    eventType: string,
    subject: string,
    body: string,
    link: string,
  ): Promise<void> {
    for (const recipientId of recipientIds) {
      try {
        await this.notifications.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType,
            channel: 'IN_APP',
            subject,
            body,
            link,
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to send ${eventType} to ${recipientId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
