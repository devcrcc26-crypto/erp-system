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
  type PayrollRunStatus,
} from '@prisma/client';
import { isTrueSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import { getTodayInTimezone } from '../../../../shared/utils/date-validation.util';
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
  ZERO_ADJUSTMENTS,
  type OvertimeHours,
  type PayrollAdjustmentTotals,
  type PayrollCalculationResult,
} from './payroll-calculation.service';
import {
  adjustmentTotalsFromLines,
  effectiveLineTreatment,
  deductionCap,
  exceedsDeductionCap,
  reconciliationRemaining,
  reconciliationStatusFor,
  type AdjustmentLineTotals,
} from '../utils/payroll-adjustment.util';
import { itemsToCarry, type PayrollRunRemittance } from '../utils/payroll-remittance.util';
import {
  employeeIdsNeedingSettlementRow,
  planSettlementOnlyRows,
} from '../utils/payroll-settlement-only.util';
import { loadRunRemittance } from '../utils/payroll-remittance.loader';
import {
  buildCorrectionLines,
  correctionComponentAmounts,
  ZERO_MANUAL_OT,
  type CorrectionEntrySnapshot,
  type ManualOtPayByCategory,
} from '../utils/payroll-correction.util';
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

/** Statuses in which a run can still change (recalculate, edit, delete). */
const EDITABLE_RUN_STATUSES: PayrollRunStatus[] = ['DRAFT', 'REVIEWED', 'SUBMITTED'];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface PayrollRunWarningEmployee {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
}

export interface PayrollRunWarnings {
  runId: string;
  /** OT for the month not yet approved (draft, submitted, in review, returned). */
  pendingOvertime: Array<
    PayrollRunWarningEmployee & {
      sheetId: string;
      sheetNumber: string;
      sheetStatus: string;
      entries: number;
      hours: number;
    }
  >;
  /** Approved, unpaid OT this run did not price (approved after it was calculated). */
  overtimeNotIncluded: Array<
    PayrollRunWarningEmployee & {
      sheetId: string;
      sheetNumber: string;
      sheetStatus: string;
      entries: number;
      hours: number;
    }
  >;
  /**
   * OT entries this run priced that changed (or were re-approved) after
   * calculation — not claimed on approve, and still flagged after approval.
   */
  overtimeChangedSinceCalculation: Array<
    PayrollRunWarningEmployee & {
      sheetId: string;
      sheetNumber: string;
      sheetStatus: string;
      entries: number;
      hours: number;
    }
  >;
  /** Open / partly settled reconciliation items for employees in this run. */
  openReconciliations: Array<
    PayrollRunWarningEmployee & {
      id: string;
      direction: 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY' | 'STATUTORY_ONLY';
      amount: number;
      remaining: number;
      forMonth: number;
      forYear: number;
      /** The employee is only in this run to settle items (no pay of their own). */
      settlementOnly: boolean;
    }
  >;
  /** Deductions above one third of the monthly wage (never for settlement-only rows). */
  deductionsOverCap: Array<PayrollRunWarningEmployee & { deductions: number; cap: number }>;
  /**
   * Negative net pay. A negative settlement-only row is money to collect from
   * the employee (`settlementOnly`), not an error in the run.
   */
  negativeNetPay: Array<
    PayrollRunWarningEmployee & { netPay: number; settlementOnly: boolean }
  >;
}

export interface PayrollRunHistoryItem {
  id: string;
  runNumber: string;
  type: string;
  version: number;
  status: string;
  createdAt: Date;
  approvedAt: Date | null;
  gmApprovedAt: Date | null;
  paidAt: Date | null;
  reopenReason: string | null;
  reopenedAt: Date | null;
  reopenedByName: string | null;
  previousVersionId: string | null;
  originalRunId: string | null;
  totalNetPay: number;
}

export interface PayrollRunHistory {
  versions: PayrollRunHistoryItem[];
  corrections: PayrollRunHistoryItem[];
  originalRun: PayrollRunHistoryItem | null;
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
    id: string;
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
    await this.assertCreatePeriodAllowed(month, year, ctx);
    // Per-run choice, else the company default for new runs.
    const attendanceOn =
      considerAttendance ?? (await this.defaultConsiderAttendance(ctx.companyId));

    // The live run for the period; SUPERSEDED versions are history only.
    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        companyId: ctx.companyId,
        month,
        year,
        type: 'REGULAR',
        deletedAt: null,
        status: { not: 'SUPERSEDED' },
      },
      orderBy: { createdAt: 'desc' },
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
    this.assertRunEditable(run);
    if (run.type === 'CORRECTION') {
      await this.rebuildCorrectionEntries(run, ctx);
      await this.reopenIfInApproval(run, ctx);
      return this.getRun(runId, ctx.companyId);
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
    await this.syncSettlementOnlyEntries(run, ctx);
    await this.updateRunTotals(runId, ctx);
    await this.reopenIfInApproval(run, ctx);

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

    if (run.type === 'CORRECTION') {
      await this.rebuildCorrectionEntries(run, ctx);
      await this.reopenIfInApproval(run, ctx);
      return this.getRun(runId, ctx.companyId);
    }

    const includeFreelancerIds = await this.includedFreelancerIds(runId);

    // Bonus and net top-ups are adjustment lines on the run, so they survive
    // regeneration by themselves. Only HR's entry notes need carrying over.
    const existingEntries = await this.prisma.payrollEntry.findMany({
      where: { runId, notes: { not: null } },
      select: { employeeId: true, notes: true },
    });
    const capturedNotes = new Map<string, string | null>(
      existingEntries.map((entry) => [entry.employeeId, entry.notes]),
    );

    await this.prisma.payrollSalaryPeriod.deleteMany({
      where: { entry: { runId } },
    });
    await this.prisma.payrollEntry.deleteMany({ where: { runId } });

    const drafts = await this.buildEntryDrafts(run, ctx, capturedNotes, {
      includeFreelancerIds,
    });
    await this.persistEntryDrafts(drafts, ctx);
    await this.syncSettlementOnlyEntries(run, ctx);
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
        // A settlement-only row does not count: adding the freelancer replaces it.
        payrollEntriesAsEmplyee: { none: { runId, settlementOnly: false } },
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

    if (run.type === 'CORRECTION') {
      // Newly added people were never paid in the original run: the rebuild
      // gives them paid = 0 so the whole corrected amount is the difference.
      await this.rebuildCorrectionEntries(run, ctx, ids);
      await this.reopenIfInApproval(run, ctx);
      this.logger.log(
        `[PayrollRun] Added ${ids.length} person(s) to correction ${run.runNumber}`,
      );
      return this.getRun(runId, ctx.companyId);
    }

    // A freelancer shown as "settlement only" becomes a normal row; the
    // settlement lines stay on the run and are priced into the new entry.
    await this.prisma.payrollEntry.deleteMany({
      where: { runId, companyId: ctx.companyId, settlementOnly: true, employeeId: { in: ids } },
    });
    const drafts = await this.buildEntryDrafts(run, ctx, new Map(), {
      includeFreelancerIds: new Set(ids),
      onlyEmployeeIds: ids,
    });
    await this.persistEntryDrafts(drafts, ctx);
    await this.syncSettlementOnlyEntries(run, ctx);
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
      select: {
        id: true,
        employeeId: true,
        settlementOnly: true,
        employee: { select: { employeeType: true } },
      },
    });
    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }
    if (entry.settlementOnly) {
      throw new BadRequestException(
        'A settlement-only row is removed automatically once its reconciliation items are settled or waived',
      );
    }
    if (entry.employee.employeeType !== 'FREELANCER') {
      throw new BadRequestException('Only freelancer entries can be removed from a run');
    }

    await this.prisma.payrollEntry.delete({ where: { id: entryId } });
    if (run.type === 'CORRECTION') {
      // Component lines of a person removed from the correction go with the entry.
      await this.prisma.payrollCorrectionLine.deleteMany({
        where: { correctionRunId: runId, employeeId: entry.employeeId },
      });
    }
    await this.updateRunTotals(runId, ctx);
    await this.reopenIfInApproval(run, ctx);
    return this.getRun(runId, ctx.companyId);
  }

  /**
   * Only runs that are not yet approved can change. An approved run must be
   * reopened (new version); a paid run is locked for good.
   */
  private assertRunEditable(run: Pick<PayrollRun, 'status'>): void {
    if (!EDITABLE_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException(
        run.status === 'APPROVED' || run.status === 'GM_APPROVED'
          ? `This run is ${run.status}. Reopen it to make changes`
          : `Cannot change a run in ${run.status} status`,
      );
    }
  }

  private async includedFreelancerIds(runId: string): Promise<Set<string>> {
    // A settlement-only row is not "HR added this freelancer to the run".
    const rows = await this.prisma.payrollEntry.findMany({
      where: { runId, settlementOnly: false, employee: { employeeType: 'FREELANCER' } },
      select: { employeeId: true },
    });
    return new Set(rows.map((r) => r.employeeId));
  }

  /**
   * Changed figures invalidate a submission: a SUBMITTED run goes back to DRAFT
   * and must be reviewed and submitted again. Approved runs cannot change at
   * all (see assertRunEditable / reopenRun).
   */
  private async reopenIfInApproval(run: PayrollRun, ctx: ServiceContext): Promise<void> {
    if (run.status !== 'SUBMITTED') {
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
      await this.findUserIdsByRoleNames(ctx.companyId, [HR_MANAGER_ROLE]),
    );
    recipients.delete(ctx.userId);
    await this.notifyMany(
      ctx,
      [...recipients],
      'payroll.run_reopened',
      `Payroll ${run.runNumber} changed - approval needed again`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was changed after it was submitted. It is back in draft and must be reviewed and submitted again.`,
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
    // Claim only OT still matching what this run priced. Changed or later-approved
    // entries stay unclaimed (Needs attention) — they do not block approval.
    const otPlan = await this.resolveOvertimeClaimPlan(run);

    // Approval consumes the run's inputs: OT entries are claimed, linked
    // reconciliation items are settled, and a correction run records what is
    // owed. All in one transaction with the status change.
    const updated = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      await this.claimOvertimeEntries(tx, run.id, otPlan.claimableIds);
      await this.applyReconciliationSettlements(tx, run.id, 1);
      await this.carryStatutoryDifferences(tx, run.id, ctx);
      await this.carryStatutoryOnlyItems(tx, run, ctx);
      await this.carryReceiptSettledItems(tx, run, ctx);
      if (run.type === 'CORRECTION') {
        await this.createReconciliationItems(tx, run, ctx);
      }
      return approved;
    });
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'run_approved',
        recordType: 'PayrollRun',
        recordId: run.id,
        recordReference: run.runNumber,
        afterValue: {
          claimedOvertimeEntries: otPlan.claimableIds.length,
          skippedChangedOvertimeEntries: otPlan.changedIds.length,
        },
      }),
    );

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
    if (run.type === 'CORRECTION') {
      throw new BadRequestException(
        'A correction run pays nothing itself. Settle its reconciliation items in a payroll run',
      );
    }
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
   * Approver returns a SUBMITTED run to DRAFT (reason required; shown in History).
   * Same for correction runs.
   */
  async returnToDraft(
    runId: string,
    reason: string,
    ctx: ServiceContext,
  ): Promise<PayrollRun> {
    await this.assertPayrollApprove(ctx);
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 5) {
      throw new BadRequestException('A reason (at least 5 characters) is required');
    }
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException('Only a submitted run can be returned to draft');
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'DRAFT',
        submittedAt: null,
        submittedBy: null,
        reopenReason: trimmed.slice(0, 1000),
        reopenedAt: new Date(),
        reopenedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'run_returned_to_draft',
        recordType: 'PayrollRun',
        recordId: run.id,
        recordReference: run.runNumber,
        beforeValue: { status: 'SUBMITTED' },
        afterValue: { status: 'DRAFT', reason: trimmed },
      }),
    );
    if (run.submittedBy && run.submittedBy !== ctx.userId) {
      await this.notifyMany(
        ctx,
        [run.submittedBy],
        'payroll.run_returned',
        `Payroll ${run.runNumber} returned to draft`,
        `Payroll run ${run.runNumber} was returned to draft: ${trimmed}`,
        `/payroll/runs/${runId}`,
      );
    }
    return updated;
  }

  /**
   * Submitter withdraws a SUBMITTED run back to DRAFT (payroll.create).
   * Same for correction runs.
   */
  async withdrawRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException('Only a submitted run can be withdrawn');
    }
    if (run.submittedBy !== ctx.userId) {
      const allowed = await this.permissions.hasPermission(
        ctx.userId,
        ctx.companyId,
        'payroll',
        'approve',
      );
      if (!allowed) {
        throw new ForbiddenException('Only the submitter can withdraw this run');
      }
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'DRAFT',
        submittedAt: null,
        submittedBy: null,
        reopenReason: 'Withdrawn by submitter',
        reopenedAt: new Date(),
        reopenedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'run_withdrawn',
        recordType: 'PayrollRun',
        recordId: run.id,
        recordReference: run.runNumber,
        beforeValue: { status: 'SUBMITTED' },
        afterValue: { status: 'DRAFT' },
      }),
    );
    return updated;
  }

  /**
   * Cancels a run that is not yet GM_APPROVED or PAID (no soft-delete).
   */
  async cancelRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (!EDITABLE_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException(
        run.status === 'APPROVED' || run.status === 'GM_APPROVED'
          ? 'An approved run cannot be deleted. Reopen it instead'
          : `Cannot delete a run in ${run.status} status`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Draft runs claim nothing; release defensively so inputs are never stranded.
      await tx.overtimeEntry.updateMany({
        where: { claimedByRunId: runId },
        data: { claimedByRunId: null, claimedAt: null },
      });
      return tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'CANCELLED',
          updatedBy: ctx.userId,
        },
      });
    });
  }

  /**
   * Creates a CORRECTION draft for a locked REGULAR run (GM_APPROVED / PAID).
   * It recalculates the period with current inputs and compares every payroll
   * component with what was paid (the original run, or the last approved
   * correction). It pays nothing itself: approving it creates reconciliation
   * items. Draft corrections are replaced; an approved one is SUPERSEDED.
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

    const liveCorrections = await this.prisma.payrollRun.findMany({
      where: {
        companyId: ctx.companyId,
        originalRunId,
        type: 'CORRECTION',
        deletedAt: null,
        status: { notIn: ['CANCELLED', 'SUPERSEDED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (liveCorrections.some((prior) => prior.status === 'PAID')) {
      throw new BadRequestException(
        'A paid correction already exists for this period and cannot be superseded',
      );
    }

    let superseded: PayrollRun | null = null;
    for (const prior of liveCorrections) {
      if (EDITABLE_RUN_STATUSES.includes(prior.status)) {
        await this.deleteCorrectionRunCascade(prior.id, ctx);
      } else {
        // APPROVED / GM_APPROVED: its reconciliation items and claims stay;
        // the new correction is compared with it.
        await this.prisma.payrollRun.update({
          where: { id: prior.id },
          data: { status: 'SUPERSEDED', updatedBy: ctx.userId },
        });
        superseded = superseded ?? prior;
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

    const correctionRunId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.create({
        data: {
          id: correctionRunId,
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
          version: superseded ? superseded.version + 1 : 1,
          previousVersionId: superseded?.id ?? null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
    });
    const correctionRun = await this.requireRun(correctionRunId, ctx.companyId);

    // What was paid is the starting point: same manual OT and adjustment lines
    // (settlement links are not copied - a correction settles nothing).
    const baselineId = await this.resolveCorrectionBaselineId(correctionRun);
    await this.prisma.$transaction(async (tx) => {
      await this.copyRunInputs(tx, baselineId, correctionRunId, ctx, {
        keepReconciliationLinks: false,
        skipSettlementOnly: true,
      });
    });

    await this.rebuildCorrectionEntries(correctionRun, ctx);

    this.logger.log(
      `[PayrollRun] Created correction ${runNumber} for ${original.runNumber}`,
    );
    return this.getRun(correctionRunId, ctx.companyId);
  }

  /**
   * Unlocks a locked REGULAR run (GM_APPROVED / PAID) back to DRAFT and voids
   * its payslips. Does not create a correction — for re-editing from scratch.
   */
  async unlockRun(runId: string, ctx: ServiceContext): Promise<PayrollRun> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.status === 'PAID') {
      throw new BadRequestException(
        'A paid run is locked. Create a correction run for its period instead',
      );
    }
    throw new BadRequestException(
      'Unlocking is replaced by Reopen: give a reason and a new draft version is created',
    );
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
    this.assertNotSettlementOnly(entry);

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

    // Top-ups are stored as the run's Taxable bonus / Net bonus adjustment
    // lines (one line each, replacing any existing ones for this employee).
    const bonusReason =
      dto.bonusTopUpReason !== undefined ? dto.bonusTopUpReason : entry.bonusTopUpReason;
    const netReason =
      dto.netTopUpReason !== undefined ? dto.netTopUpReason : entry.netTopUpReason;
    await this.replaceSystemAdjustmentLine(
      entry,
      'BONUS_TOP_UP',
      bonusTopUp,
      bonusReason,
      dto.bonusTopUp !== undefined || dto.bonusTopUpReason !== undefined,
      ctx,
    );
    await this.replaceSystemAdjustmentLine(
      entry,
      'NET_TOP_UP',
      netTopUp,
      netReason,
      dto.netTopUp !== undefined || dto.netTopUpReason !== undefined,
      ctx,
    );
    if (dto.notes !== undefined) {
      await this.prisma.payrollEntry.update({
        where: { id: entryId },
        data: { notes: dto.notes, updatedBy: ctx.userId },
      });
    }
    const updated = await this.applyAdjustmentLinesToEntry(entry.runId, entry.employeeId, ctx);
    await this.reopenIfInApproval(entry.run, ctx);
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
    this.assertNotSettlementOnly(entry);

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
    /** Entry notes kept across a recalculation, by employee. */
    capturedNotes: Map<string, string | null>,
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
      this.loadPayableOvertime(run, ctx.companyId, employeeIds),
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

    const overtimeByEmployee = overtimeSheets;
    const adjustmentsByEmployee = await this.loadAdjustmentTotals(
      run.id,
      ctx.companyId,
      employeeIds,
    );

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

      const lineTotals = adjustmentsByEmployee.get(employee.id);
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
          bonusTopUp: lineTotals?.totals.bonusTopUp ?? 0,
          bonusTopUpReason: lineTotals?.bonusTopUpReason ?? null,
          netTopUp: lineTotals?.totals.netTopUp ?? 0,
          netTopUpReason: lineTotals?.netTopUpReason ?? null,
          adjustments: lineTotals?.totals.adjustments ?? ZERO_ADJUSTMENTS,
          preservedNotes: capturedNotes.get(employee.id) ?? null,
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
    /** Adjustment lines other than taxable / net bonus (see PayrollAdjustmentTotals). */
    adjustments: PayrollAdjustmentTotals;
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
      adjustments,
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
      adjustments,
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
      adjustmentTaxable: new Decimal(result.adjustmentTaxable),
      adjustmentNonTaxable: new Decimal(result.adjustmentNonTaxable),
      adjustmentPensionable: new Decimal(result.adjustmentPensionable),
      adjustmentDeductions: new Decimal(result.adjustmentDeductions),
      // OT not paid (0 paid days) is not consumed: it stays available.
      includedOtEntryIds: zeroOtForUnpaidMonth
        ? []
        : (overtime?.entries ?? []).map((row) => row.id),
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
      adjustments: {
        taxableEarnings: this.toNumber(entry.adjustmentTaxable),
        nonTaxableEarnings: this.toNumber(entry.adjustmentNonTaxable),
        pensionableEarnings: this.toNumber(entry.adjustmentPensionable),
        deductions: this.toNumber(entry.adjustmentDeductions),
      },
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
      adjustmentTaxable: new Decimal(result.adjustmentTaxable),
      adjustmentNonTaxable: new Decimal(result.adjustmentNonTaxable),
      adjustmentPensionable: new Decimal(result.adjustmentPensionable),
      adjustmentDeductions: new Decimal(result.adjustmentDeductions),
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

  // ── Inputs: overtime claims and adjustment lines ─────────────────────────

  /**
   * Overtime a run may pay, as one snapshot per employee built from entries
   * (never sheet totals):
   * - REGULAR: approved entries no run has claimed yet.
   * - CORRECTION: everything claimed for the period (already paid) plus
   *   approved entries not yet claimed (e.g. approved after the run).
   */
  private async loadPayableOvertime(
    run: Pick<PayrollRun, 'type' | 'month' | 'year'>,
    companyId: string,
    employeeIds: string[],
  ): Promise<Map<string, OvertimeSnapshot>> {
    const unclaimedApproved: Prisma.OvertimeEntryWhereInput = {
      claimedByRunId: null,
      sheet: { status: 'APPROVED', deletedAt: null },
    };
    const rows = await this.prisma.overtimeEntry.findMany({
      where: {
        sheet: {
          companyId,
          employeeId: { in: employeeIds },
          month: run.month,
          year: run.year,
        },
        OR:
          run.type === 'CORRECTION'
            ? [{ claimedByRunId: { not: null } }, unclaimedApproved]
            : [unclaimedApproved],
      },
      select: {
        id: true,
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
        sheet: { select: { id: true, employeeId: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    const byEmployee = new Map<string, OvertimeSnapshot>();
    for (const row of rows) {
      const { sheet, ...entry } = row;
      let snapshot = byEmployee.get(sheet.employeeId);
      if (!snapshot) {
        snapshot = {
          id: sheet.id,
          employeeId: sheet.employeeId,
          totalRegularHours: new Decimal(0),
          totalNightHours: new Decimal(0),
          totalWeekendHours: new Decimal(0),
          totalHolidayHours: new Decimal(0),
          entries: [],
        };
        byEmployee.set(sheet.employeeId, snapshot);
      }
      snapshot.entries.push(entry);
      snapshot.totalRegularHours = new Decimal(snapshot.totalRegularHours ?? 0).add(entry.regularHours);
      snapshot.totalNightHours = new Decimal(snapshot.totalNightHours ?? 0).add(entry.nightHours);
      snapshot.totalWeekendHours = new Decimal(snapshot.totalWeekendHours ?? 0).add(entry.weekendHours);
      snapshot.totalHolidayHours = new Decimal(snapshot.totalHolidayHours ?? 0).add(entry.holidayHours);
    }
    return byEmployee;
  }

  /** Adjustment-line totals (and top-up reasons) per employee for a run. */
  private async loadAdjustmentTotals(
    runId: string,
    companyId: string,
    employeeIds?: string[],
  ): Promise<
    Map<
      string,
      {
        totals: AdjustmentLineTotals;
        bonusTopUpReason: string | null;
        netTopUpReason: string | null;
      }
    >
  > {
    const lines = await this.prisma.payrollAdjustmentLine.findMany({
      where: {
        companyId,
        payrollRunId: runId,
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      },
      select: {
        employeeId: true,
        amount: true,
        note: true,
        kindOverride: true,
        taxableOverride: true,
        adjustmentType: {
          select: { kind: true, taxable: true, pensionable: true, systemField: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const grouped = new Map<string, typeof lines>();
    for (const line of lines) {
      const list = grouped.get(line.employeeId) ?? [];
      list.push(line);
      grouped.set(line.employeeId, list);
    }
    const result = new Map<
      string,
      { totals: AdjustmentLineTotals; bonusTopUpReason: string | null; netTopUpReason: string | null }
    >();
    const reasons = (list: typeof lines, field: string): string | null => {
      const notes = list
        .filter((line) => line.adjustmentType.systemField === field)
        .map((line) => line.note.trim())
        .filter(Boolean);
      return notes.length > 0 ? notes.join('; ') : null;
    };
    for (const [employeeId, list] of grouped) {
      result.set(employeeId, {
        totals: adjustmentTotalsFromLines(
          list.map((line) => {
            // Manual correction lines pick direction and tax treatment per line.
            const treatment = effectiveLineTreatment({
              typeKind: line.adjustmentType.kind,
              typeTaxable: line.adjustmentType.taxable,
              typePensionable: line.adjustmentType.pensionable,
              systemField: line.adjustmentType.systemField,
              kindOverride: line.kindOverride ?? null,
              taxableOverride: line.taxableOverride ?? null,
            });
            return {
              amount: this.toNumber(line.amount),
              kind: treatment.kind,
              taxable: treatment.taxable,
              pensionable: treatment.pensionable,
              taxableDeduction: treatment.taxableDeduction,
              systemField: line.adjustmentType.systemField,
            };
          }),
        ),
        bonusTopUpReason: reasons(list, 'BONUS_TOP_UP'),
        netTopUpReason: reasons(list, 'NET_TOP_UP'),
      });
    }
    return result;
  }

  /**
   * Reprices one employee's entry from the run's adjustment lines (after a
   * line is added or removed). Taxable / net bonus lines go to bonusTopUp /
   * netTopUp exactly as before; the rest to the adjustment totals.
   */
  async applyAdjustmentLinesToEntry(
    runId: string,
    employeeId: string,
    ctx: ServiceContext,
  ): Promise<PayrollEntry> {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { runId, employeeId, companyId: ctx.companyId },
      include: { run: true },
    });
    if (!entry) {
      throw new NotFoundException('This employee has no entry in the payroll run');
    }
    const loaded = (await this.loadAdjustmentTotals(runId, ctx.companyId, [employeeId])).get(
      employeeId,
    );
    const totals = loaded?.totals ?? {
      bonusTopUp: 0,
      netTopUp: 0,
      adjustments: ZERO_ADJUSTMENTS,
    };
    // Same rule as generation: a month with 0 paid days pays no bonuses. A
    // settlement-only row always has 0 days and pays its settlement lines.
    const zeroDays = !entry.settlementOnly && this.toNumber(entry.payrollDays) === 0;
    const bonusTopUp = zeroDays ? 0 : totals.bonusTopUp;
    const netTopUp = zeroDays ? 0 : totals.netTopUp;
    const withAdjustments: PayrollEntry = {
      ...entry,
      adjustmentTaxable: new Decimal(totals.adjustments.taxableEarnings),
      adjustmentNonTaxable: new Decimal(totals.adjustments.nonTaxableEarnings),
      adjustmentPensionable: new Decimal(totals.adjustments.pensionableEarnings),
      adjustmentDeductions: new Decimal(totals.adjustments.deductions),
    };
    const result = await this.recalcEntryAmounts(withAdjustments, entry.run, {
      bonusTopUp,
      netTopUp,
    });
    const updated = await this.prisma.payrollEntry.update({
      where: { id: entry.id },
      data: {
        bonusTopUp: new Decimal(bonusTopUp),
        bonusTopUpReason: bonusTopUp > 0 ? (loaded?.bonusTopUpReason ?? null) : null,
        netTopUp: new Decimal(netTopUp),
        netTopUpReason: netTopUp > 0 ? (loaded?.netTopUpReason ?? null) : null,
        ...this.calculationToEntryUpdate(result),
        updatedBy: ctx.userId,
      },
    });
    if (entry.run.type === 'CORRECTION') {
      // Paid-vs-corrected lines and the net difference follow the repriced entry.
      await this.refreshCorrectionEntry(entry.run, employeeId, ctx);
    }
    await this.updateRunTotals(runId, ctx);
    return updated;
  }

  /**
   * After one employee's entry in a CORRECTION run was repriced (adjustment
   * line added / removed): updates original / corrected / delta net pay and
   * replaces that employee's component lines, as a full rebuild would.
   */
  private async refreshCorrectionEntry(
    run: PayrollRun,
    employeeId: string,
    ctx: ServiceContext,
  ): Promise<void> {
    const baselineId = await this.resolveCorrectionBaselineId(run);
    const [entry, paid, baselineManual, correctedManual] = await Promise.all([
      this.prisma.payrollEntry.findFirst({
        where: { runId: run.id, employeeId, companyId: ctx.companyId },
      }),
      this.prisma.payrollEntry.findFirst({
        where: { runId: baselineId, employeeId, companyId: ctx.companyId, settlementOnly: false },
      }),
      this.manualOtPayByEmployee(baselineId),
      this.manualOtPayByEmployee(run.id),
    ]);
    if (!entry) {
      return;
    }
    const correctedNet = this.toNumber(entry.netPay);
    const originalNet = paid ? this.toNumber(paid.netPay) : 0;
    await this.prisma.payrollEntry.update({
      where: { id: entry.id },
      data: {
        originalAmount: new Decimal(originalNet),
        correctedAmount: new Decimal(correctedNet),
        deltaAmount: new Decimal(this.round(correctedNet - originalNet)),
      },
    });
    const lines = buildCorrectionLines(
      correctionComponentAmounts(paid, baselineManual.get(employeeId) ?? ZERO_MANUAL_OT),
      correctionComponentAmounts(
        entry as unknown as CorrectionEntrySnapshot,
        correctedManual.get(employeeId) ?? ZERO_MANUAL_OT,
      ),
    );
    await this.prisma.payrollCorrectionLine.deleteMany({
      where: { correctionRunId: run.id, employeeId },
    });
    await this.prisma.payrollCorrectionLine.createMany({
      data: lines.map((line) => ({
        companyId: ctx.companyId,
        correctionRunId: run.id,
        employeeId,
        component: line.component,
        sortOrder: line.sortOrder,
        paidAmount: new Decimal(line.paidAmount),
        correctedAmount: new Decimal(line.correctedAmount),
        difference: new Decimal(line.difference),
      })),
    });
  }

  /**
   * Replaces the employee's Taxable bonus / Net bonus line (the entry drawer's
   * bonus and net top-up fields). Lines that settle a reconciliation item are kept.
   */
  private async replaceSystemAdjustmentLine(
    entry: Pick<PayrollEntry, 'runId' | 'employeeId' | 'companyId'>,
    systemField: 'BONUS_TOP_UP' | 'NET_TOP_UP',
    amount: number,
    reason: string | null,
    touched: boolean,
    ctx: ServiceContext,
  ): Promise<void> {
    if (!touched) {
      return;
    }
    const type = await this.prisma.payrollAdjustmentType.findFirst({
      where: { companyId: entry.companyId, systemField },
      select: { id: true, nameEn: true },
    });
    if (!type) {
      throw new BadRequestException(
        `Adjustment type for ${systemField} is missing. Run the payroll migrations`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollAdjustmentLine.deleteMany({
        where: {
          payrollRunId: entry.runId,
          employeeId: entry.employeeId,
          adjustmentTypeId: type.id,
          reconciliationId: null,
        },
      });
      if (amount > 0) {
        await tx.payrollAdjustmentLine.create({
          data: {
            companyId: entry.companyId,
            payrollRunId: entry.runId,
            employeeId: entry.employeeId,
            adjustmentTypeId: type.id,
            amount: new Decimal(this.round(amount)),
            note: reason?.trim() || type.nameEn,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          },
        });
      }
    });
  }

  // ── Settlement-only rows ────────────────────────────────────────────────

  /** A settlement-only row has no salary figures: only its settlement lines can change. */
  private assertNotSettlementOnly(entry: { settlementOnly?: boolean | null }): void {
    if (entry.settlementOnly) {
      throw new BadRequestException(
        'This is a settlement-only row: it has no salary to edit. Add or remove its settlement lines instead',
      );
    }
  }

  /**
   * Keeps a REGULAR run's "Settlement only" rows in step with the company's
   * reconciliation items: adds a zero-pay row for every employee / freelancer
   * who is not otherwise in the run but has OPEN / PARTIALLY_SETTLED items or
   * an undeclared STATUTORY_ONLY item, and removes a settlement-only row (with
   * its lines) once nothing is left to settle. Rows are priced from their
   * settlement lines only. Returns true when rows were added or removed.
   * The caller refreshes run totals when it changed anything else too.
   */
  async syncSettlementOnlyEntries(
    run: Pick<PayrollRun, 'id' | 'companyId' | 'type' | 'status'>,
    ctx: ServiceContext,
  ): Promise<boolean> {
    if (run.type !== 'REGULAR' || !EDITABLE_RUN_STATUSES.includes(run.status)) {
      return false;
    }
    const items = await this.prisma.payrollReconciliation.findMany({
      where: { companyId: run.companyId, status: { in: ['OPEN', 'PARTIALLY_SETTLED'] } },
      select: { employeeId: true, direction: true, status: true, statutoryRunId: true },
    });
    const entries = await this.prisma.payrollEntry.findMany({
      where: { runId: run.id },
      select: { id: true, employeeId: true, settlementOnly: true },
    });
    const plan = planSettlementOnlyRows(
      employeeIdsNeedingSettlementRow(items),
      entries.map((entry) => ({
        id: entry.id,
        employeeId: entry.employeeId,
        settlementOnly: Boolean(entry.settlementOnly),
      })),
    );
    if (plan.add.length === 0 && plan.remove.length === 0) {
      return false;
    }

    if (plan.remove.length > 0) {
      // Nothing left to settle: the row goes, and so do any lines copied onto it.
      await this.prisma.$transaction(async (tx) => {
        await tx.payrollAdjustmentLine.deleteMany({
          where: {
            payrollRunId: run.id,
            companyId: run.companyId,
            employeeId: { in: plan.remove.map((row) => row.employeeId) },
          },
        });
        await tx.payrollEntry.deleteMany({
          where: { id: { in: plan.remove.map((row) => row.id) } },
        });
      });
    }

    if (plan.add.length > 0) {
      const people = await this.prisma.user.findMany({
        where: { id: { in: plan.add }, companyId: run.companyId },
        select: {
          id: true,
          employeeType: true,
          bankName: true,
          bankAccountNumber: true,
        },
      });
      for (const person of people) {
        const data: Prisma.PayrollEntryUncheckedCreateInput = {
          id: randomUUID(),
          companyId: run.companyId,
          runId: run.id,
          employeeId: person.id,
          flag: 'NONE',
          bankName: person.bankName,
          bankAccountNumber: person.bankAccountNumber,
          employeeCategory: person.employeeType,
          settlementOnly: true,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        };
        await this.prisma.payrollEntry.create({ data });
        // Settlement lines already on the run (kept across a recalculation) price the row.
        await this.applyAdjustmentLinesToEntry(run.id, person.id, ctx);
      }
    }
    await this.updateRunTotals(run.id, ctx);
    return true;
  }

  /**
   * After a reconciliation item changes outside a run (waived, un-waived,
   * receipt recorded), brings every editable regular run's settlement-only
   * rows up to date. A submitted run that changes goes back to DRAFT.
   */
  async syncSettlementOnlyRows(ctx: ServiceContext): Promise<void> {
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        companyId: ctx.companyId,
        type: 'REGULAR',
        deletedAt: null,
        status: { in: EDITABLE_RUN_STATUSES },
      },
    });
    for (const run of runs) {
      const changed = await this.syncSettlementOnlyEntries(run, ctx);
      if (changed) {
        await this.reopenIfInApproval(run, ctx);
      }
    }
  }

  // ── Approval: claims and settlements ────────────────────────────────────

  /**
   * Splits priced OT into claimable (unchanged since this run calculated) and
   * changed (edited, deleted, sheet no longer approved, or claimed elsewhere on
   * a regular run). Approval claims only claimable ids — changed ones stay open
   * for a later recalculation or correction.
   */
  private async resolveOvertimeClaimPlan(
    run: Pick<PayrollRun, 'id' | 'type'>,
  ): Promise<{ claimableIds: string[]; changedIds: string[] }> {
    const entries = await this.prisma.payrollEntry.findMany({
      where: { runId: run.id },
      select: { includedOtEntryIds: true, createdAt: true },
    });
    const calculatedAt = new Map<string, Date>();
    for (const entry of entries) {
      for (const id of entry.includedOtEntryIds ?? []) {
        calculatedAt.set(id, entry.createdAt);
      }
    }
    if (calculatedAt.size === 0) {
      return { claimableIds: [], changedIds: [] };
    }
    const rows = await this.prisma.overtimeEntry.findMany({
      where: { id: { in: [...calculatedAt.keys()] } },
      select: {
        id: true,
        updatedAt: true,
        claimedByRunId: true,
        sheet: { select: { status: true, deletedAt: true } },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const claimableIds: string[] = [];
    const changedIds: string[] = [];
    for (const [id, at] of calculatedAt) {
      const row = byId.get(id);
      if (!row) {
        changedIds.push(id);
        continue;
      }
      if (row.claimedByRunId) {
        // Corrections re-price OT an earlier run already paid; it stays claimed by it.
        if (run.type !== 'CORRECTION') {
          changedIds.push(id);
        }
        continue;
      }
      if (
        row.sheet.status !== 'APPROVED' ||
        row.sheet.deletedAt ||
        row.updatedAt.getTime() > at.getTime()
      ) {
        changedIds.push(id);
        continue;
      }
      claimableIds.push(id);
    }
    return { claimableIds, changedIds };
  }

  private async claimOvertimeEntries(
    tx: Prisma.TransactionClient,
    runId: string,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const claimed = await tx.overtimeEntry.updateMany({
      where: { id: { in: ids }, claimedByRunId: null },
      data: { claimedByRunId: runId, claimedAt: new Date() },
    });
    if (claimed.count !== ids.length) {
      throw new BadRequestException(
        'Some overtime was claimed by another payroll run meanwhile. Recalculate the run before approving',
      );
    }
  }

  /**
   * Applies (direction 1, on approval) or reverses (-1, on reopen) the
   * settlements made by a run's adjustment lines.
   */
  private async applyReconciliationSettlements(
    tx: Prisma.TransactionClient,
    runId: string,
    direction: 1 | -1,
  ): Promise<void> {
    const lines = await tx.payrollAdjustmentLine.findMany({
      where: { payrollRunId: runId, reconciliationId: { not: null } },
      select: { reconciliationId: true, amount: true },
    });
    const sums = new Map<string, number>();
    for (const line of lines) {
      const id = line.reconciliationId as string;
      sums.set(id, this.round((sums.get(id) ?? 0) + this.toNumber(line.amount)));
    }
    for (const [id, sum] of sums) {
      const item = await tx.payrollReconciliation.findUnique({ where: { id } });
      if (!item) {
        continue;
      }
      const amount = this.toNumber(item.amount);
      const settled = this.toNumber(item.settledAmount);
      if (direction === 1) {
        if (item.status === 'WAIVED' || item.status === 'SETTLED') {
          throw new BadRequestException(
            `Reconciliation item for ${item.forMonth}/${item.forYear} is already ${item.status.toLowerCase()}. Remove its line before approving`,
          );
        }
        const remaining = reconciliationRemaining(amount, settled);
        if (sum > remaining + 0.005) {
          throw new BadRequestException(
            `Amount exceeds the remaining balance of ${remaining.toFixed(2)} ETB.`,
          );
        }
      }
      const nextSettled = this.round(Math.max(0, settled + direction * sum));
      await tx.payrollReconciliation.update({
        where: { id },
        data: {
          settledAmount: new Decimal(nextSettled),
          status:
            item.status === 'WAIVED' ? 'WAIVED' : reconciliationStatusFor(amount, nextSettled),
        },
      });
    }
  }

  /** On approval of a correction run: one item per employee whose net pay changed. */
  private async createReconciliationItems(
    tx: Prisma.TransactionClient,
    run: PayrollRun,
    ctx: ServiceContext,
  ): Promise<void> {
    const entries = await tx.payrollEntry.findMany({
      where: { runId: run.id, deltaAmount: { not: 0 } },
      select: { employeeId: true, deltaAmount: true },
    });
    // Tax and pension differences travel with the item so the run that
    // settles it can remit them (corrected - paid, from the component lines).
    const statutoryLines = await tx.payrollCorrectionLine.findMany({
      where: {
        correctionRunId: run.id,
        component: { in: ['INCOME_TAX', 'PENSION_EMPLOYEE', 'PENSION_EMPLOYER'] },
      },
      select: { employeeId: true, component: true, difference: true },
    });
    const statutory = new Map<string, { tax: number; emp: number; emr: number }>();
    for (const line of statutoryLines) {
      const current = statutory.get(line.employeeId) ?? { tax: 0, emp: 0, emr: 0 };
      const value = this.toNumber(line.difference);
      if (line.component === 'INCOME_TAX') current.tax = value;
      if (line.component === 'PENSION_EMPLOYEE') current.emp = value;
      if (line.component === 'PENSION_EMPLOYER') current.emr = value;
      statutory.set(line.employeeId, current);
    }
    const period = `${MONTH_NAMES[run.month - 1]} ${run.year}`;
    const reason = run.notes?.trim()
      ? `${run.runNumber} correction for ${period}: ${run.notes.trim()}`
      : `${run.runNumber} correction for ${period}`;
    // Net difference per employee; employees whose net pay is unchanged but
    // whose tax / pension changed get a statutory-only item (nothing to pay or
    // recover, the differences are still declared).
    const deltas = new Map<string, number>();
    for (const entry of entries) {
      deltas.set(entry.employeeId, this.round(this.toNumber(entry.deltaAmount)));
    }
    const changed = (value: { tax: number; emp: number; emr: number } | undefined): boolean =>
      Boolean(
        value &&
          (Math.abs(value.tax) >= 0.005 ||
            Math.abs(value.emp) >= 0.005 ||
            Math.abs(value.emr) >= 0.005),
      );
    const employeeIds = new Set<string>([
      ...[...deltas].filter(([, delta]) => Math.abs(delta) >= 0.005).map(([id]) => id),
      ...[...statutory].filter(([, value]) => changed(value)).map(([id]) => id),
    ]);
    for (const employeeId of employeeIds) {
      const delta = deltas.get(employeeId) ?? 0;
      const statutoryOnly = Math.abs(delta) < 0.005;
      await tx.payrollReconciliation.create({
        data: {
          companyId: run.companyId,
          employeeId,
          forMonth: run.month,
          forYear: run.year,
          correctionRunId: run.id,
          direction: statutoryOnly
            ? 'STATUTORY_ONLY'
            : delta > 0
              ? 'OWED_TO_EMPLOYEE'
              : 'OWED_TO_COMPANY',
          amount: new Decimal(statutoryOnly ? 0 : Math.abs(delta)),
          incomeTaxDifference: new Decimal(statutory.get(employeeId)?.tax ?? 0),
          employeePensionDifference: new Decimal(statutory.get(employeeId)?.emp ?? 0),
          employerPensionDifference: new Decimal(statutory.get(employeeId)?.emr ?? 0),
          reason: reason.slice(0, 500),
          createdBy: ctx.userId,
        },
      });
    }
  }

  /**
   * The first run that settles a reconciliation item remits the correction's
   * tax and pension differences in full (later instalments carry nothing).
   */
  private async carryStatutoryDifferences(
    tx: Prisma.TransactionClient,
    runId: string,
    ctx: ServiceContext,
  ): Promise<void> {
    const lines = await tx.payrollAdjustmentLine.findMany({
      where: { payrollRunId: runId, reconciliationId: { not: null } },
      select: { reconciliationId: true },
    });
    const ids = [...new Set(lines.map((line) => line.reconciliationId as string))];
    if (ids.length === 0) {
      return;
    }
    const items = await tx.payrollReconciliation.findMany({ where: { id: { in: ids } } });
    await this.writeStatutoryCarries(tx, runId, items, ctx, false);
  }

  /**
   * A regular run's approval also declares every open statutory-only item
   * (zero net difference, changed tax / pension) and marks it SETTLED.
   */
  private async carryStatutoryOnlyItems(
    tx: Prisma.TransactionClient,
    run: Pick<PayrollRun, 'id' | 'companyId' | 'type'>,
    ctx: ServiceContext,
  ): Promise<void> {
    if (run.type !== 'REGULAR') {
      return;
    }
    const items = await tx.payrollReconciliation.findMany({
      where: {
        companyId: run.companyId,
        direction: 'STATUTORY_ONLY',
        status: 'OPEN',
        statutoryRunId: null,
      },
    });
    await this.writeStatutoryCarries(tx, run.id, items, ctx, true);
  }

  /**
   * Items settled (fully or in part) by a receipt recorded outside payroll
   * have no payroll line to carry their tax / pension differences. A regular
   * run's approval declares them once, in full, like a statutory-only item;
   * the item itself keeps the status the receipt gave it.
   */
  private async carryReceiptSettledItems(
    tx: Prisma.TransactionClient,
    run: Pick<PayrollRun, 'id' | 'companyId' | 'type'>,
    ctx: ServiceContext,
  ): Promise<void> {
    if (run.type !== 'REGULAR') {
      return;
    }
    const items = await tx.payrollReconciliation.findMany({
      where: {
        companyId: run.companyId,
        direction: { not: 'STATUTORY_ONLY' },
        statutoryRunId: null,
        receipts: { some: {} },
      },
    });
    await this.writeStatutoryCarries(tx, run.id, items, ctx, false);
  }

  private async writeStatutoryCarries(
    tx: Prisma.TransactionClient,
    runId: string,
    items: Array<{
      id: string;
      companyId: string;
      employeeId: string;
      forMonth: number;
      forYear: number;
      statutoryRunId: string | null;
      incomeTaxDifference: Decimal;
      employeePensionDifference: Decimal;
      employerPensionDifference: Decimal;
    }>,
    ctx: ServiceContext,
    settle: boolean,
  ): Promise<void> {
    const toCarry = itemsToCarry(
      items.map((item) => ({
        ...item,
        incomeTaxDifference: this.toNumber(item.incomeTaxDifference),
        employeePensionDifference: this.toNumber(item.employeePensionDifference),
        employerPensionDifference: this.toNumber(item.employerPensionDifference),
      })),
    );
    for (const item of toCarry) {
      await tx.payrollStatutoryAdjustment.create({
        data: {
          companyId: item.companyId,
          payrollRunId: runId,
          employeeId: item.employeeId,
          reconciliationId: item.id,
          forMonth: item.forMonth,
          forYear: item.forYear,
          incomeTax: new Decimal(item.incomeTaxDifference),
          pensionEmployee: new Decimal(item.employeePensionDifference),
          pensionEmployer: new Decimal(item.employerPensionDifference),
          createdBy: ctx.userId,
        },
      });
      await tx.payrollReconciliation.update({
        where: { id: item.id },
        data: { statutoryRunId: runId, ...(settle ? { status: 'SETTLED' as const } : {}) },
      });
    }
  }

  /** Undoes carryStatutoryDifferences for a run being reopened. */
  private async releaseStatutoryDifferences(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<void> {
    const carried = await tx.payrollStatutoryAdjustment.findMany({
      where: { payrollRunId: runId },
      select: { reconciliationId: true },
    });
    if (carried.length === 0) {
      return;
    }
    const ids = carried.map((row) => row.reconciliationId);
    // Statutory-only items were settled by the carry itself: open them again
    // so the next approved run declares them.
    await tx.payrollReconciliation.updateMany({
      where: { id: { in: ids }, statutoryRunId: runId, direction: 'STATUTORY_ONLY' },
      data: { statutoryRunId: null, status: 'OPEN' },
    });
    await tx.payrollReconciliation.updateMany({
      where: { id: { in: ids }, statutoryRunId: runId },
      data: { statutoryRunId: null },
    });
    await tx.payrollStatutoryAdjustment.deleteMany({ where: { payrollRunId: runId } });
  }

  /**
   * Income tax and pension to declare / remit for a run: its own totals plus
   * the correction differences it carries, as labelled lines. Before approval
   * the lines are a preview of what approval will carry.
   */
  async getRunRemittance(runId: string, companyId: string): Promise<PayrollRunRemittance> {
    const run = await this.requireRun(runId, companyId);
    if (run.type === 'CORRECTION') {
      throw new BadRequestException(
        'A correction run remits nothing itself. Its differences are remitted with the run that settles them',
      );
    }
    return loadRunRemittance(this.prisma, run);
  }

  // ── Reopen ──────────────────────────────────────────────────────────────

  /**
   * Reopens an APPROVED / GM_APPROVED run: the run becomes a SUPERSEDED
   * version (kept, with the reason), what it consumed is released, and a new
   * DRAFT version of the same period is created and calculated. Paid runs are
   * locked.
   */
  async reopenRun(runId: string, reason: string, ctx: ServiceContext): Promise<PayrollRun> {
    await this.assertPayrollApprove(ctx);
    const run = await this.requireRun(runId, ctx.companyId);
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 5) {
      throw new BadRequestException('A reason (at least 5 characters) is required to reopen');
    }
    if (run.status === 'PAID') {
      throw new BadRequestException(
        'A paid run is locked. Create a correction run for its period instead',
      );
    }
    if (run.status !== 'APPROVED' && run.status !== 'GM_APPROVED') {
      throw new BadRequestException(
        `Only an approved run can be reopened (this run is ${run.status}). A draft can be recalculated directly`,
      );
    }
    if (run.type === 'REGULAR') {
      const corrections = await this.prisma.payrollRun.count({
        where: {
          originalRunId: run.id,
          type: 'CORRECTION',
          deletedAt: null,
          status: { not: 'CANCELLED' },
        },
      });
      if (corrections > 0) {
        throw new BadRequestException(
          'This run has correction runs. Correct the period with a new correction run instead of reopening',
        );
      }
    } else {
      const items = await this.prisma.payrollReconciliation.findMany({
        where: { correctionRunId: run.id },
        select: {
          id: true,
          settledAmount: true,
          status: true,
          statutoryRunId: true,
          _count: { select: { lines: true } },
        },
      });
      const inUse = items.some(
        (item) =>
          this.toNumber(item.settledAmount) > 0 ||
          item.status === 'WAIVED' ||
          item.statutoryRunId != null ||
          item._count.lines > 0,
      );
      if (inUse) {
        throw new BadRequestException(
          'Reconciliation items from this correction are already being settled, declared or were waived. It cannot be reopened',
        );
      }
    }

    const now = new Date();
    const baseNumber = run.runNumber.replace(/-V\d+$/, '');
    const newRunId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.releaseStatutoryDifferences(tx, run.id);
      await this.applyReconciliationSettlements(tx, run.id, -1);
      if (run.type === 'CORRECTION') {
        await tx.payrollReconciliation.deleteMany({ where: { correctionRunId: run.id } });
      }
      await tx.overtimeEntry.updateMany({
        where: { claimedByRunId: run.id },
        data: { claimedByRunId: null, claimedAt: null },
      });
      await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'SUPERSEDED',
          reopenReason: trimmed,
          reopenedBy: ctx.userId,
          reopenedAt: now,
          updatedBy: ctx.userId,
        },
      });
      await tx.payrollRun.create({
        data: {
          id: newRunId,
          companyId: run.companyId,
          runNumber: `${baseNumber}-V${run.version + 1}`,
          month: run.month,
          year: run.year,
          type: run.type,
          originalRunId: run.originalRunId,
          status: 'DRAFT',
          taxableThreshold: run.taxableThreshold,
          considerAttendance: run.considerAttendance,
          notes: run.notes,
          version: run.version + 1,
          previousVersionId: run.id,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      await this.copyRunInputs(tx, run.id, newRunId, ctx, { keepReconciliationLinks: true });
    });

    const fresh = await this.requireRun(newRunId, ctx.companyId);
    if (fresh.type === 'CORRECTION') {
      await this.rebuildCorrectionEntries(fresh, ctx);
    } else {
      const includeFreelancerIds = await this.includedFreelancerIds(run.id);
      const notes = await this.prisma.payrollEntry.findMany({
        where: { runId: run.id, notes: { not: null } },
        select: { employeeId: true, notes: true },
      });
      const drafts = await this.buildEntryDrafts(
        fresh,
        ctx,
        new Map(notes.map((entry) => [entry.employeeId, entry.notes])),
        { includeFreelancerIds },
      );
      await this.persistEntryDrafts(drafts, ctx);
      await this.syncSettlementOnlyEntries(fresh, ctx);
      await this.updateRunTotals(newRunId, ctx);
    }

    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action: 'run_reopened',
        recordType: 'PayrollRun',
        recordId: run.id,
        recordReference: run.runNumber,
        beforeValue: { status: run.status, version: run.version },
        afterValue: { status: 'SUPERSEDED', reason: trimmed, newRunId },
      }),
    );
    const recipients = new Set<string>(
      await this.findUserIdsByRoleNames(ctx.companyId, [HR_MANAGER_ROLE, GENERAL_MANAGER_ROLE]),
    );
    recipients.delete(ctx.userId);
    await this.notifyMany(
      ctx,
      [...recipients],
      'payroll.run_reopened',
      `Payroll ${run.runNumber} reopened`,
      `Payroll run ${run.runNumber} (${run.month}/${run.year}) was reopened: ${trimmed}. A new draft version must be reviewed and approved.`,
      `/payroll/runs/${newRunId}`,
    );
    this.logger.log(`[PayrollRun] ${run.runNumber} reopened as version ${run.version + 1}`);
    return this.getRun(newRunId, ctx.companyId);
  }

  /**
   * Copies manual OT adjustments and adjustment lines from one run to another
   * (reopened version, or the run a correction corrects). Legacy runs whose
   * top-ups were never stored as lines get lines from their entries.
   */
  private async copyRunInputs(
    tx: Prisma.TransactionClient,
    fromRunId: string,
    toRunId: string,
    ctx: ServiceContext,
    options: {
      keepReconciliationLinks: boolean;
      /**
       * Corrections compare the period's pay: settlement-only rows (and their
       * lines) are payments of earlier corrections, not part of it.
       */
      skipSettlementOnly?: boolean;
    },
  ): Promise<void> {
    const manualOt = await tx.payrollOtAdjustment.findMany({ where: { payrollRunId: fromRunId } });
    if (manualOt.length > 0) {
      await tx.payrollOtAdjustment.createMany({
        data: manualOt.map((row) => ({
          id: randomUUID(),
          companyId: row.companyId,
          payrollRunId: toRunId,
          employeeId: row.employeeId,
          contractId: row.contractId,
          otCategory: row.otCategory,
          hours: row.hours,
          appliedHours: new Decimal(0),
          amount: new Decimal(0),
          note: row.note,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })),
      });
    }

    const settlementOnlyEmployeeIds = options.skipSettlementOnly
      ? new Set(
          (
            await tx.payrollEntry.findMany({
              where: { runId: fromRunId, settlementOnly: true },
              select: { employeeId: true },
            })
          ).map((entry) => entry.employeeId),
        )
      : new Set<string>();
    const lines = (
      await tx.payrollAdjustmentLine.findMany({ where: { payrollRunId: fromRunId } })
    ).filter((line) => !settlementOnlyEmployeeIds.has(line.employeeId));
    if (lines.length > 0) {
      await tx.payrollAdjustmentLine.createMany({
        data: lines.map((line) => ({
          id: randomUUID(),
          companyId: line.companyId,
          payrollRunId: toRunId,
          employeeId: line.employeeId,
          adjustmentTypeId: line.adjustmentTypeId,
          amount: line.amount,
          note: line.note,
          reconciliationId: options.keepReconciliationLinks ? line.reconciliationId : null,
          instalmentNumber: options.keepReconciliationLinks ? line.instalmentNumber : null,
          instalmentCount: options.keepReconciliationLinks ? line.instalmentCount : null,
          capOverrideReason: line.capOverrideReason,
          sourceLineId: line.id,
          kindOverride: line.kindOverride,
          taxableOverride: line.taxableOverride,
          isCorrectionLine: line.isCorrectionLine,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })),
      });
      return;
    }

    // Legacy: top-ups stored only on entries (paid runs were not backfilled).
    const legacy = await tx.payrollEntry.findMany({
      where: { runId: fromRunId, OR: [{ bonusTopUp: { not: 0 } }, { netTopUp: { not: 0 } }] },
      select: {
        companyId: true,
        employeeId: true,
        bonusTopUp: true,
        bonusTopUpReason: true,
        netTopUp: true,
        netTopUpReason: true,
      },
    });
    if (legacy.length === 0) {
      return;
    }
    const types = await tx.payrollAdjustmentType.findMany({
      where: { companyId: ctx.companyId, systemField: { in: ['BONUS_TOP_UP', 'NET_TOP_UP'] } },
      select: { id: true, systemField: true, nameEn: true },
    });
    const bonusType = types.find((type) => type.systemField === 'BONUS_TOP_UP');
    const netType = types.find((type) => type.systemField === 'NET_TOP_UP');
    const data: Prisma.PayrollAdjustmentLineCreateManyInput[] = [];
    for (const entry of legacy) {
      if (bonusType && this.toNumber(entry.bonusTopUp) > 0) {
        data.push({
          companyId: entry.companyId,
          payrollRunId: toRunId,
          employeeId: entry.employeeId,
          adjustmentTypeId: bonusType.id,
          amount: entry.bonusTopUp,
          note: entry.bonusTopUpReason?.trim() || bonusType.nameEn,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
      }
      if (netType && this.toNumber(entry.netTopUp) > 0) {
        data.push({
          companyId: entry.companyId,
          payrollRunId: toRunId,
          employeeId: entry.employeeId,
          adjustmentTypeId: netType.id,
          amount: entry.netTopUp,
          note: entry.netTopUpReason?.trim() || netType.nameEn,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
      }
    }
    if (data.length > 0) {
      await tx.payrollAdjustmentLine.createMany({ data });
    }
  }

  // ── Corrections ─────────────────────────────────────────────────────────

  /**
   * What a correction is compared against: the latest correction of the same
   * original that was approved (and not undone by a reopen) before it, else
   * the original run.
   */
  private async resolveCorrectionBaselineId(
    run: Pick<PayrollRun, 'id' | 'originalRunId' | 'createdAt' | 'companyId'>,
  ): Promise<string> {
    if (!run.originalRunId) {
      throw new BadRequestException('Correction run has no original run');
    }
    const prior = await this.prisma.payrollRun.findFirst({
      where: {
        companyId: run.companyId,
        originalRunId: run.originalRunId,
        type: 'CORRECTION',
        id: { not: run.id },
        deletedAt: null,
        approvedAt: { not: null },
        reopenedAt: null,
        createdAt: { lt: run.createdAt },
        status: { in: ['APPROVED', 'GM_APPROVED', 'PAID', 'SUPERSEDED'] },
      },
      orderBy: { approvedAt: 'desc' },
      select: { id: true },
    });
    return prior?.id ?? run.originalRunId;
  }

  /**
   * (Re)builds a correction run: recalculates the period with current inputs,
   * stores corrected entries with original / corrected / delta net pay, and a
   * paid-vs-corrected line for every payroll component.
   */
  private async rebuildCorrectionEntries(
    run: PayrollRun,
    ctx: ServiceContext,
    addedFreelancerIds: readonly string[] = [],
  ): Promise<void> {
    const baselineId = await this.resolveCorrectionBaselineId(run);
    // Freelancers HR added to this correction (missed payment) survive a rebuild.
    const ownFreelancerIds = await this.includedFreelancerIds(run.id);

    await this.prisma.payrollCorrectionLine.deleteMany({ where: { correctionRunId: run.id } });
    await this.prisma.payrollSalaryPeriod.deleteMany({ where: { entry: { runId: run.id } } });
    await this.prisma.payrollEntry.deleteMany({ where: { runId: run.id } });

    // Settlement-only rows pay earlier corrections, not the period's salary.
    const baselineEntries = await this.prisma.payrollEntry.findMany({
      where: { runId: baselineId, companyId: ctx.companyId, settlementOnly: false },
    });
    const baselineByEmployee = new Map(baselineEntries.map((entry) => [entry.employeeId, entry]));
    const baselineManualOt = await this.manualOtPayByEmployee(baselineId);

    const includeFreelancerIds = new Set<string>([
      ...(await this.includedFreelancerIds(baselineId)),
      ...ownFreelancerIds,
      ...addedFreelancerIds,
      ...baselineEntries.map((entry) => entry.employeeId),
    ]);
    const drafts = await this.buildEntryDrafts(run, ctx, new Map(), { includeFreelancerIds });

    const correctionDrafts: EntryDraft[] = [];
    const lineRows: Prisma.PayrollCorrectionLineCreateManyInput[] = [];
    const seen = new Set<string>();

    const pushLines = (
      employeeId: string,
      paid: PayrollEntry | null,
      corrected: CorrectionEntrySnapshot | null,
      correctedManualOt: ManualOtPayByCategory,
    ): void => {
      const lines = buildCorrectionLines(
        correctionComponentAmounts(
          paid,
          baselineManualOt.get(employeeId) ?? ZERO_MANUAL_OT,
        ),
        correctionComponentAmounts(corrected, correctedManualOt),
      );
      for (const line of lines) {
        lineRows.push({
          companyId: ctx.companyId,
          correctionRunId: run.id,
          employeeId,
          component: line.component,
          sortOrder: line.sortOrder,
          paidAmount: new Decimal(line.paidAmount),
          correctedAmount: new Decimal(line.correctedAmount),
          difference: new Decimal(line.difference),
        });
      }
    };

    for (const draft of drafts) {
      const employeeId = draft.entry.employeeId as string;
      seen.add(employeeId);
      const paid = baselineByEmployee.get(employeeId) ?? null;
      const correctedNet = this.toNumber(draft.entry.netPay as Decimal | number | null);
      const originalNet = paid ? this.toNumber(paid.netPay) : 0;
      correctionDrafts.push({
        ...draft,
        entry: {
          ...draft.entry,
          originalAmount: new Decimal(originalNet),
          correctedAmount: new Decimal(correctedNet),
          deltaAmount: new Decimal(this.round(correctedNet - originalNet)),
        },
      });
      const correctedManualOt: ManualOtPayByCategory = { ...ZERO_MANUAL_OT };
      for (const applied of draft.manualOt ?? []) {
        correctedManualOt[applied.category] = this.round(
          correctedManualOt[applied.category] + applied.amount,
        );
      }
      pushLines(
        employeeId,
        paid,
        draft.entry as unknown as CorrectionEntrySnapshot,
        correctedManualOt,
      );
    }

    // Employees paid before who drop out of the recalculation: corrected to 0.
    for (const [employeeId, paid] of baselineByEmployee) {
      if (seen.has(employeeId)) {
        continue;
      }
      const originalNet = this.toNumber(paid.netPay);
      correctionDrafts.push({
        entry: {
          id: randomUUID(),
          companyId: ctx.companyId,
          runId: run.id,
          employeeId,
          contractId: paid.contractId,
          scheduledDays: paid.scheduledDays,
          presentDays: paid.presentDays,
          absentDays: paid.absentDays,
          employedDays: paid.employedDays,
          payrollDays: new Decimal(0),
          basicSalary: paid.basicSalary,
          originalAmount: new Decimal(originalNet),
          correctedAmount: new Decimal(0),
          deltaAmount: new Decimal(this.round(-originalNet)),
          flag: 'NONE',
          bankName: paid.bankName,
          bankAccountNumber: paid.bankAccountNumber,
          employeeCategory: paid.employeeCategory,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        salaryPeriods: [],
      });
      pushLines(employeeId, paid, null, ZERO_MANUAL_OT);
    }

    await this.persistEntryDrafts(correctionDrafts, ctx);
    for (let i = 0; i < lineRows.length; i += 500) {
      await this.prisma.payrollCorrectionLine.createMany({ data: lineRows.slice(i, i + 500) });
    }
    await this.updateRunTotals(run.id, ctx);
    await this.prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        attendanceSnapshotStale: false,
        policyReviewRequired: false,
        policyReviewNote: null,
        updatedBy: ctx.userId,
      } as Prisma.PayrollRunUpdateInput,
    });
  }

  /** Manual (paper) OT pay per employee and category, as applied on a run. */
  private async manualOtPayByEmployee(
    runId: string,
  ): Promise<Map<string, ManualOtPayByCategory>> {
    const rows = await this.prisma.payrollOtAdjustment.findMany({
      where: { payrollRunId: runId },
      select: { employeeId: true, otCategory: true, amount: true },
    });
    const result = new Map<string, ManualOtPayByCategory>();
    for (const row of rows) {
      const current = result.get(row.employeeId) ?? { ...ZERO_MANUAL_OT };
      current[row.otCategory] = this.round(current[row.otCategory] + this.toNumber(row.amount));
      result.set(row.employeeId, current);
    }
    return result;
  }

  /** Paid vs corrected component lines of a correction run. */
  async getCorrectionLines(
    runId: string,
    companyId: string,
    employeeId?: string,
  ): Promise<
    Array<{
      employeeId: string;
      component: string;
      sortOrder: number;
      paidAmount: number;
      correctedAmount: number;
      difference: number;
    }>
  > {
    const run = await this.requireRun(runId, companyId);
    if (run.type !== 'CORRECTION') {
      throw new BadRequestException('Only correction runs have component differences');
    }
    const rows = await this.prisma.payrollCorrectionLine.findMany({
      where: { correctionRunId: runId, ...(employeeId ? { employeeId } : {}) },
      orderBy: [{ employeeId: 'asc' }, { sortOrder: 'asc' }],
    });
    return rows.map((row) => ({
      employeeId: row.employeeId,
      component: row.component,
      sortOrder: row.sortOrder,
      paidAmount: this.toNumber(row.paidAmount),
      correctedAmount: this.toNumber(row.correctedAmount),
      difference: this.toNumber(row.difference),
    }));
  }

  // ── Warnings and history ────────────────────────────────────────────────

  /**
   * What HR should follow up before finalizing: OT not yet approved for the
   * month, OT approved after the run was calculated, open reconciliation
   * items for employees in the run, and deductions above one third of wage.
   */
  async getRunWarnings(runId: string, companyId: string): Promise<PayrollRunWarnings> {
    const run = await this.requireRun(runId, companyId);
    const entries = await this.prisma.payrollEntry.findMany({
      where: { runId },
      select: {
        employeeId: true,
        earnedSalary: true,
        adjustmentDeductions: true,
        netPay: true,
        includedOtEntryIds: true,
        settlementOnly: true,
        employee: { select: { firstName: true, lastName: true, employeeId: true } },
      },
    });
    const settlementOnlyIds = new Set(
      entries.filter((entry) => entry.settlementOnly).map((entry) => entry.employeeId),
    );
    const name = (employee: { firstName: string; lastName: string }): string =>
      `${employee.firstName} ${employee.lastName}`.trim();
    const employeeIds = entries.map((entry) => entry.employeeId);
    const included = new Set(entries.flatMap((entry) => entry.includedOtEntryIds ?? []));

    const sheets = await this.prisma.overtimeSheet.findMany({
      where: {
        companyId,
        month: run.month,
        year: run.year,
        deletedAt: null,
        status: { in: ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED', 'APPROVED'] },
      },
      select: {
        id: true,
        sheetNumber: true,
        status: true,
        employeeId: true,
        employee: { select: { firstName: true, lastName: true, employeeId: true } },
        entries: {
          where: { claimedByRunId: null },
          select: { id: true, totalHours: true },
        },
      },
    });

    const pendingOvertime: PayrollRunWarnings['pendingOvertime'] = [];
    const overtimeNotIncluded: PayrollRunWarnings['overtimeNotIncluded'] = [];
    for (const sheet of sheets) {
      if (sheet.entries.length === 0) {
        continue;
      }
      const hours = (rows: typeof sheet.entries): number =>
        this.round(rows.reduce((sum, row) => sum + this.toNumber(row.totalHours), 0));
      const base = {
        employeeId: sheet.employeeId,
        employeeName: name(sheet.employee),
        employeeCode: sheet.employee.employeeId,
        sheetId: sheet.id,
        sheetNumber: sheet.sheetNumber,
      };
      if (sheet.status !== 'APPROVED') {
        pendingOvertime.push({
          ...base,
          sheetStatus: sheet.status,
          entries: sheet.entries.length,
          hours: hours(sheet.entries),
        });
        continue;
      }
      const notIncluded = sheet.entries.filter((row) => !included.has(row.id));
      if (notIncluded.length > 0) {
        overtimeNotIncluded.push({
          ...base,
          sheetStatus: sheet.status,
          entries: notIncluded.length,
          hours: hours(notIncluded),
        });
      }
    }

    // Priced OT that no longer matches the calculation (or was not claimed).
    const otPlan = await this.resolveOvertimeClaimPlan(run);
    const changedIdSet = new Set(otPlan.changedIds);
    // After approval, also treat priced entries this run never claimed as changed.
    if (
      run.status === 'APPROVED' ||
      run.status === 'GM_APPROVED' ||
      run.status === 'PAID'
    ) {
      const claimed = await this.prisma.overtimeEntry.findMany({
        where: { claimedByRunId: run.id },
        select: { id: true },
      });
      const claimedSet = new Set(claimed.map((row) => row.id));
      for (const id of included) {
        if (!claimedSet.has(id)) {
          changedIdSet.add(id);
        }
      }
    }
    const overtimeChangedSinceCalculation: PayrollRunWarnings['overtimeChangedSinceCalculation'] =
      [];
    if (changedIdSet.size > 0) {
      const changedRows = await this.prisma.overtimeEntry.findMany({
        where: { id: { in: [...changedIdSet] } },
        select: {
          id: true,
          totalHours: true,
          sheet: {
            select: {
              id: true,
              sheetNumber: true,
              status: true,
              employeeId: true,
              employee: { select: { firstName: true, lastName: true, employeeId: true } },
            },
          },
        },
      });
      const bySheet = new Map<
        string,
        {
          sheetId: string;
          sheetNumber: string;
          sheetStatus: string;
          employeeId: string;
          employeeName: string;
          employeeCode: string | null;
          entries: number;
          hours: number;
        }
      >();
      for (const row of changedRows) {
        const sheet = row.sheet;
        const existing = bySheet.get(sheet.id);
        const hours = this.toNumber(row.totalHours);
        if (existing) {
          existing.entries += 1;
          existing.hours = this.round(existing.hours + hours);
          continue;
        }
        bySheet.set(sheet.id, {
          sheetId: sheet.id,
          sheetNumber: sheet.sheetNumber,
          sheetStatus: sheet.status,
          employeeId: sheet.employeeId,
          employeeName: name(sheet.employee),
          employeeCode: sheet.employee.employeeId,
          entries: 1,
          hours: this.round(hours),
        });
      }
      // Missing priced ids (deleted) still count toward the bar total via a synthetic row.
      const foundIds = new Set(changedRows.map((row) => row.id));
      const missing = [...changedIdSet].filter((id) => !foundIds.has(id)).length;
      overtimeChangedSinceCalculation.push(...bySheet.values());
      if (missing > 0) {
        overtimeChangedSinceCalculation.push({
          employeeId: '',
          employeeName: 'Removed overtime',
          employeeCode: null,
          sheetId: 'removed',
          sheetNumber: '-',
          sheetStatus: 'REMOVED',
          entries: missing,
          hours: 0,
        });
      }
    }

    const items =
      employeeIds.length === 0
        ? []
        : await this.prisma.payrollReconciliation.findMany({
            where: {
              companyId,
              employeeId: { in: employeeIds },
              status: { in: ['OPEN', 'PARTIALLY_SETTLED'] },
            },
            select: {
              id: true,
              employeeId: true,
              direction: true,
              amount: true,
              settledAmount: true,
              forMonth: true,
              forYear: true,
              employee: { select: { firstName: true, lastName: true, employeeId: true } },
            },
            orderBy: [{ forYear: 'asc' }, { forMonth: 'asc' }],
          });

    const deductionsOverCap: PayrollRunWarnings['deductionsOverCap'] = [];
    const negativeNetPay: PayrollRunWarnings['negativeNetPay'] = [];
    for (const entry of entries) {
      // One third of the salary earned this month (prorated basic).
      const wage = this.toNumber(entry.earnedSalary);
      const deductions = this.toNumber(entry.adjustmentDeductions);
      if (!entry.settlementOnly && deductions > 0 && exceedsDeductionCap(wage, deductions)) {
        deductionsOverCap.push({
          employeeId: entry.employeeId,
          employeeName: name(entry.employee),
          employeeCode: entry.employee.employeeId,
          deductions,
          cap: deductionCap(wage),
        });
      }
      if (this.toNumber(entry.netPay) < 0) {
        negativeNetPay.push({
          employeeId: entry.employeeId,
          employeeName: name(entry.employee),
          employeeCode: entry.employee.employeeId,
          netPay: this.toNumber(entry.netPay),
          settlementOnly: Boolean(entry.settlementOnly),
        });
      }
    }

    return {
      runId,
      pendingOvertime,
      overtimeNotIncluded,
      overtimeChangedSinceCalculation,
      openReconciliations: items.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName: name(item.employee),
        employeeCode: item.employee.employeeId,
        direction: item.direction,
        amount: this.toNumber(item.amount),
        remaining: reconciliationRemaining(
          this.toNumber(item.amount),
          this.toNumber(item.settledAmount),
        ),
        forMonth: item.forMonth,
        forYear: item.forYear,
        settlementOnly: settlementOnlyIds.has(item.employeeId),
      })),
      deductionsOverCap,
      negativeNetPay,
    };
  }

  /** Every version of the run's period (incl. superseded) and related corrections. */
  async getRunHistory(runId: string, companyId: string): Promise<PayrollRunHistory> {
    const run = await this.requireRun(runId, companyId);
    const select = {
      id: true,
      runNumber: true,
      type: true,
      version: true,
      status: true,
      createdAt: true,
      approvedAt: true,
      gmApprovedAt: true,
      paidAt: true,
      reopenReason: true,
      reopenedAt: true,
      previousVersionId: true,
      originalRunId: true,
      totalNetPay: true,
      reopener: { select: { firstName: true, lastName: true } },
    } satisfies Prisma.PayrollRunSelect;
    type Row = Prisma.PayrollRunGetPayload<{ select: typeof select }>;
    const toItem = (row: Row): PayrollRunHistoryItem => ({
      id: row.id,
      runNumber: row.runNumber,
      type: row.type,
      version: row.version,
      status: row.status,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
      gmApprovedAt: row.gmApprovedAt,
      paidAt: row.paidAt,
      reopenReason: row.reopenReason,
      reopenedAt: row.reopenedAt,
      reopenedByName: row.reopener
        ? `${row.reopener.firstName} ${row.reopener.lastName}`.trim()
        : null,
      previousVersionId: row.previousVersionId,
      originalRunId: row.originalRunId,
      totalNetPay: this.toNumber(row.totalNetPay),
    });

    const versions = await this.prisma.payrollRun.findMany({
      where: {
        companyId,
        month: run.month,
        year: run.year,
        type: run.type,
        deletedAt: null,
        ...(run.type === 'CORRECTION' ? { originalRunId: run.originalRunId } : {}),
      },
      select,
      orderBy: [{ createdAt: 'asc' }],
    });
    const regularIds =
      run.type === 'REGULAR'
        ? versions.map((version) => version.id)
        : run.originalRunId
          ? [run.originalRunId]
          : [];
    const corrections =
      regularIds.length === 0
        ? []
        : await this.prisma.payrollRun.findMany({
            where: {
              companyId,
              type: 'CORRECTION',
              originalRunId: { in: regularIds },
              deletedAt: null,
              ...(run.type === 'CORRECTION' ? { id: { notIn: versions.map((v) => v.id) } } : {}),
            },
            select,
            orderBy: [{ createdAt: 'asc' }],
          });
    const original =
      run.type === 'CORRECTION' && run.originalRunId
        ? await this.prisma.payrollRun.findFirst({ where: { id: run.originalRunId }, select })
        : null;
    return {
      versions: versions.map(toItem),
      corrections: corrections.map(toItem),
      originalRun: original ? toItem(original) : null,
    };
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
    if (await this.isLocalHrOrAbove(ctx)) {
      return;
    }
    throw new ForbiddenException(
      'Only HR Manager, Local HR Manager, or System Administrator can unlock or correct payroll',
    );
  }

  /**
   * Local HR Manager, HR Manager, or System Administrator — can open a run up
   * to two calendar months ahead (Addis Ababa); everyone else is limited to
   * the current month.
   */
  private async assertCreatePeriodAllowed(
    month: number,
    year: number,
    ctx: ServiceContext,
  ): Promise<void> {
    const [todayYear, todayMonth] = getTodayInTimezone()
      .split('-')
      .map(Number);
    const requested = year * 12 + month;
    const current = todayYear * 12 + todayMonth;
    const allowAhead = await this.isLocalHrOrAbove(ctx);
    const maxAllowed = allowAhead ? current + 2 : current;
    if (requested > maxAllowed) {
      throw new BadRequestException(
        allowAhead
          ? 'Payroll can only be created for the current month or up to two months ahead'
          : 'Payroll can only be created for the current month',
      );
    }
  }

  private async isLocalHrOrAbove(ctx: ServiceContext): Promise<boolean> {
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        role: { companyId: ctx.companyId, deletedAt: null },
      },
      select: { role: { select: { name: true } } },
    });
    const roleNames = roles.map((row) => row.role.name);
    return (
      isTrueSystemAdministrator(roleNames) ||
      roleNames.includes(HR_MANAGER_ROLE) ||
      roleNames.includes(LOCAL_HR_MANAGER_ROLE)
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
