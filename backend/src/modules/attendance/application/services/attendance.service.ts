import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AttendanceDailyLog,
  AttendanceDayFlag,
  AttendanceDayStatus,
  AttendanceImportBatch,
  AttendanceMonthlyApproval,
  FieldMovementEntry,
  FieldMovementLog,
  FieldMovementReason,
  FieldMovementStatus,
  Prisma,
  AttendanceIdentityStatus,
  AttendanceMatchMethod,
  AttendanceMissingResolution,
  AttendanceMode,
  AttendanceScanReviewDecision,
  AttendanceUnmatchedStatus,
  HolidayNationality,
  Nationality,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  canViewThroughTeam,
  isEmployeeInTeamScope,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from '../../../../shared/org/team-scope.util';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import {
  cappedContractSegments,
  withContractHoldover,
  effectiveContractEnd,
  employedInMonthWhere,
  getEmploymentWindow,
  loadEmploymentWindows,
} from '../../../../shared/employment/employment-window.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import { BackdatingPolicyService } from '../../../hr-shared/application/services/backdating-policy.service';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  holidayAppliesToNationality,
  holidayFallsOnDate,
} from '../../../work-schedule/application/services/work-schedule.dates';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import { summarizeAttendanceDays } from '../utils/attendance-absence.util';
import {
  awaitingEnrolment,
  isCountedPresentMatchMethod,
  NOT_ENROLLED_RECORD_NOTE,
  previousNotEnrolledMonths,
  type AwaitingEnrolmentEntry,
} from '../utils/attendance-enrolment.util';
import { enrolmentGraceDateKeys } from '../utils/enrolment-grace.util';
import {
  isScanOnlySchedule,
  SCAN_AFTER_DEADLINE_FLAG,
  scanOnlyRuleFor,
  type ScanOnlyRule,
} from '../utils/scan-only.util';
import {
  buildDayDeductionContext,
  dailyLogToDeductionInput,
  loadDeductionDataForMonth,
  matchedPublicHolidayForEmployee,
} from '../utils/attendance-day-deduction.context';
import { resolveEmploymentSegmentsForMonth } from '../../../payroll/application/utils/payroll-days.util';
import {
  dayDeduction,
  employedCalendarDatesForContracts,
  summarizeMonthAbsence,
  type DayDeductionStatus,
} from '../utils/day-deduction.util';
import { DayCoverageService } from '../../../hr-shared/application/services/day-coverage.service';
import {
  dateKey as coverDateKey,
  dayCoverMessage,
} from '../../../hr-shared/application/utils/day-coverage.util';
import { summarizeMissingEmployeeCoverage } from '../utils/attendance-import-coverage.util';
import {
  clearAttendanceMonthRecalcStale,
  isAttendanceMonthApproved,
  isPayrollMonthLocked,
  markAttendanceMonthRecalcStale,
  markPayrollAttendanceSnapshotStale,
} from '../utils/attendance-recalc-policy.util';
import type { PolicyValues } from '../../../../shared/policy/policy-definitions';
import {
  getPolicy,
  loadPolicySnapshot,
} from '../../../../shared/policy/policy-reader.util';
import {
  inactiveSpanOn,
  loadInactiveSpansForMonth,
} from '../../../../shared/employment/inactive-period.util';
import {
  formatValidationMessage,
  sanitizeStorageEntry,
  validateStorageEntry,
} from '../utils/field-movement-field-rules';
import {
  compatibleReasonsForIssue,
  deriveIssueType,
  type CompatibleIssueReason,
  type FieldMovementIssueType,
} from '../utils/field-movement-issue-compatibility';
import {
  evaluateEarlyDeparture,
  isLateAfterGrace,
  lateArrivalDeduction,
} from '../utils/early-departure.util';
import {
  dateToYyyyMmDd,
  getApprovedLeaveSummariesForEmployees,
} from './attendance-leave.util';
import type { AttendanceDailyRaw } from '../../utils/attendance-excel.parser';
import { parseAttendanceExcel } from '../../utils/attendance-excel.parser';
import {
  calculateHoursBetween,
  isAfterTime,
  isBeforeTime,
  minutesBetween,
} from '../../utils/time.util';
import {
  ConfirmAttendanceImportDto,
  CorrectDailyLogDto,
  CreateFieldMovementLogDto,
  ListAttendanceDto,
  ListAttendanceMonthlyApprovalsDto,
  ListFieldMovementLogsDto,
  ListScanReviewsDto,
  RemoveFieldMovementDraftDayDto,
  ReviewScanFlagDto,
  UnlockAttendanceMonthDto,
  UpsertFieldMovementDraftEntriesDto,
} from '../dtos/attendance.dto';
import {
  AttendanceMatchResult,
  AttendanceMatchingService,
  normaliseAttendanceName,
} from './attendance-matching.service';
import { AttendancePreviewCache } from './attendance-preview.cache';

const ATTENDANCE_APPROVED_EVENT = 'attendance.month_approved';

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
] as const;

/** Active SCANNER ERP employee with no row in the uploaded attendance file. */
export interface AttendanceMissingEmployee {
  id: string;
  name: string;
  employeeId: string | null;
  departmentName: string | null;
  attendanceMode: string;
  /**
   * Set when the previous month(s) were already "Needs enrolment": this is the
   * nth consecutive month without enrolment (2 = second month).
   */
  notEnrolledMonth?: number;
  /** Pre-selected resolution in the preview. */
  suggestedResolution?: 'NEEDS_ENROLMENT' | 'COVERED';
  totalWorkingDays?: number;
  coveredWorkingDays?: number;
  fullyCovered?: boolean;
  coverageLabel?: string | null;
  coverageTag?: 'SITE' | 'WFH' | 'LEAVE' | 'MIXED' | null;
  siteCoverageDays?: number;
  wfhCoverageDays?: number;
  leaveCoverageDays?: number;
}

export interface AwaitingEnrolmentEmployee extends AwaitingEnrolmentEntry {
  name: string;
  employeeCode: string | null;
  departmentName: string | null;
}

export interface AttendancePreviewResult {
  previewToken: string;
  month: number;
  year: number;
  fileName: string;
  alreadyImported: boolean;
  totalRows: number;
  matched: AttendanceMatchResult[];
  review: AttendanceMatchResult[];
  rejected: AttendanceMatchResult[];
  ignored: AttendanceMatchResult[];
  /** Active includeInPayroll SCANNER employees not present in the file. */
  missingFromAttendance: AttendanceMissingEmployee[];
}

export interface AttendanceImportSummary {
  month: number;
  year: number;
  importedCount: number;
  autoMatchedCount: number;
  manualAssignedCount: number;
  skippedReviewCount: number;
  rejectedCount: number;
  rejectedNames: string[];
}

export interface AttendanceEmployeeSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  department: { id: string; name: string } | null;
}

export interface AttendanceDailyLogInput {
  date: Date;
  clockInMachine: string | null;
  clockOutMachine: string | null;
  clockInLocal: string | null;
  clockOutLocal: string | null;
  isHoliday: boolean;
  holidayName: string | null;
  isWeekend: boolean;
  isHalfDay: boolean;
  wasPresent: boolean;
  scheduledHours: number;
  recordedHours: number | null;
  isLate: boolean;
  lateMinutes: number;
  missingClockIn: boolean;
  missingClockOut: boolean;
  flag: AttendanceDayFlag;
  isLastExportDay: boolean;
}

export interface AttendanceDailySummary {
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
  holidayDays: number;
  lateDays: number;
  totalLateMinutes: number;
  missingClockInDays: number;
  missingClockOutDays: number;
  /** Recalculated from daily logs + paid public holidays (not machine totals). */
  payableHours: number;
  flaggedDays: number;
}

type CachedAttendancePreview = AttendancePreviewResult & {
  companyId: string;
};

type ScheduleDayLike = {
  dayOfWeek: number;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonEnd: string | null;
  totalHours: Prisma.Decimal | number;
  /** Schedule-level check mode, copied onto each weekday row. */
  checkMode?: string | null;
  latestScanTime?: string | null;
};

type HolidayRowForAttendance = {
  name: string;
  date: Date;
  isRecurring: boolean;
  appliesToNationality: HolidayNationality;
};

/** Shared reads for bulk import / month recalcs (avoid N× DB hits). */
type CalculateDailyLogsShared = {
  holidays?: HolidayRowForAttendance[];
  employeeNationality?: Nationality | null;
  policy?: PolicyValues;
};

/** Prefetched per-employee schedule resolvers keyed by employee id. */
type ScheduleResolverCache = Map<
  string,
  Promise<(date: Date) => ScheduleDayLike[]>
>;

/** Bound parallel work during import confirm / month recalc. */
const IMPORT_CONCURRENCY = 8;

/**
 * Weekday rows of a work schedule with the schedule's check mode attached.
 */
function toScheduleDayLikes(schedule: {
  checkMode?: string | null;
  latestScanTime?: string | null;
  days: Array<{
    dayOfWeek: number;
    isWorkingDay: boolean;
    isHalfDay: boolean;
    morningStart: string | null;
    morningEnd: string | null;
    afternoonEnd: string | null;
    totalHours: Prisma.Decimal | number;
  }>;
}): ScheduleDayLike[] {
  return schedule.days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    isWorkingDay: day.isWorkingDay,
    isHalfDay: day.isHalfDay,
    morningStart: day.morningStart,
    morningEnd: day.morningEnd,
    afternoonEnd: day.afternoonEnd,
    totalHours: day.totalHours,
    checkMode: schedule.checkMode ?? null,
    latestScanTime: schedule.latestScanTime ?? null,
  }));
}

type DailyLogFlagSource = {
  id: string;
  date: Date;
  isHoliday: boolean;
  isWeekend: boolean;
  isHalfDay: boolean;
  isLastExportDay: boolean;
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal: string | null;
  correctedClockOutLocal: string | null;
};

/**
 * Resolves the HR review flag for a single duty day from effective punch times.
 * Early leave uses the earlyDepartureGraceMinutes policy (default 15; flag only when earlier than end − grace).
 * Approved site / WFH / leave coverage suppresses missing-punch and early flags;
 * leave + any scan raises ON_LEAVE_BUT_SCANNED for HR (not Explain days).
 */
function resolveAttendanceDayFlag(params: {
  isHoliday: boolean;
  isWeekend: boolean;
  clockIn: string | null;
  clockOut: string | null;
  isLastExportDay: boolean;
  scheduledEnd: string | null;
  /** SCAN_ONLY schedule: no missing-punch or early-leave flags. */
  scanOnly?: boolean;
  /** Hire-to-first-scan grace: not absent and no field-movement flags. */
  enrolmentGrace?: boolean;
  /** From dayDeduction - leave stays; flag only when scans exist. */
  onLeaveButScanned?: boolean;
  /** Coverage statuses that must not raise field-movement explain flags. */
  dayStatus?: DayDeductionStatus | null;
  /** earlyDepartureGraceMinutes policy for the day's month (default: policy default). */
  earlyDepartureGraceMinutes?: number;
}): AttendanceDayFlag {
  if (params.onLeaveButScanned) {
    return AttendanceDayFlag.ON_LEAVE_BUT_SCANNED;
  }
  if (
    params.dayStatus === 'ON_SITE' ||
    params.dayStatus === 'WORK_FROM_HOME' ||
    params.dayStatus === 'LEAVE' ||
    params.dayStatus === 'UNPAID_LEAVE' ||
    params.dayStatus === 'SUNDAY' ||
    params.dayStatus === 'DAY_OFF' ||
    params.dayStatus === 'WORKED_ON_DAY_OFF' ||
    params.dayStatus === 'HOLIDAY' ||
    params.dayStatus === 'ENROLMENT_GRACE' ||
    params.dayStatus === 'INACTIVE'
  ) {
    return AttendanceDayFlag.NONE;
  }
  if (
    params.isHoliday ||
    params.isWeekend ||
    params.scanOnly ||
    params.enrolmentGrace
  ) {
    return AttendanceDayFlag.NONE;
  }
  // Exempt / manual-present days are PRESENT with no punches - not FM flags.
  if (
    params.dayStatus === 'PRESENT' &&
    !params.clockIn &&
    !params.clockOut
  ) {
    return AttendanceDayFlag.NONE;
  }
  if (!params.clockIn) {
    return AttendanceDayFlag.MISSING_CLOCK_IN;
  }
  if (!params.clockOut && !params.isLastExportDay) {
    return AttendanceDayFlag.MISSING_CLOCK_OUT;
  }
  if (params.clockIn && params.clockOut && params.scheduledEnd) {
    const early = evaluateEarlyDeparture({
      clockOut: params.clockOut,
      scheduledEnd: params.scheduledEnd,
      fieldMovement: 'NONE',
      graceMinutes: params.earlyDepartureGraceMinutes,
    });
    if (early.isEarlyLeaveFlag) {
      return AttendanceDayFlag.EARLY_LEAVE;
    }
  }
  return AttendanceDayFlag.NONE;
}

/**
 * SCAN_AFTER_DEADLINE review columns for one daily log. Keeps an HR decision
 * while the flagged scan time is unchanged; clears everything once the day is
 * no longer flagged (schedule change, correction, leave approved, …).
 */
function resolveScanReviewFields(
  log: {
    scanReviewFlag: string | null;
    scanReviewTime: string | null;
    scanReviewDecision: AttendanceScanReviewDecision | null;
  },
  scanAfterDeadlineTime: string | null,
): Prisma.AttendanceDailyLogUpdateInput {
  if (!scanAfterDeadlineTime) {
    if (!log.scanReviewFlag) {
      return {};
    }
    return {
      scanReviewFlag: null,
      scanReviewTime: null,
      needsReview: false,
      scanReviewDecision: null,
      scanReviewNote: null,
      scanReviewedBy: { disconnect: true },
      scanReviewedAt: null,
    };
  }
  const sameFlag =
    log.scanReviewFlag === SCAN_AFTER_DEADLINE_FLAG &&
    log.scanReviewTime === scanAfterDeadlineTime;
  if (sameFlag) {
    return { needsReview: log.scanReviewDecision == null };
  }
  return {
    scanReviewFlag: SCAN_AFTER_DEADLINE_FLAG,
    scanReviewTime: scanAfterDeadlineTime,
    needsReview: true,
    scanReviewDecision: null,
    scanReviewNote: null,
    scanReviewedBy: { disconnect: true },
    scanReviewedAt: null,
  };
}

/**
 * Scheduled end time for early-leave checks (half day uses morning end).
 */
function scheduledEndForDay(scheduleDay: ScheduleDayLike | undefined): string | null {
  if (!scheduleDay?.isWorkingDay) {
    return null;
  }
  if (scheduleDay.isHalfDay) {
    return scheduleDay.morningEnd ?? '12:30';
  }
  return scheduleDay.afternoonEnd ?? '17:30';
}

/**
 * Attendance rate as present/scheduled percentage, or null when scheduled is 0.
 */
function computeAttendanceRate(
  scheduledDays: Prisma.Decimal | number,
  presentDays: Prisma.Decimal | number,
): number | null {
  const scheduled = Number(scheduledDays);
  if (!(scheduled > 0)) {
    return null;
  }
  return Math.round((Number(presentDays) / scheduled) * 100);
}

/**
 * Revives Date objects after Redis JSON round-trip.
 */
function reviveMatchResultDates(rows: AttendanceMatchResult[]): void {
  for (const row of rows) {
    for (const day of row.data.dailyData) {
      if (typeof day.date === 'string') {
        day.date = new Date(day.date);
      }
    }
  }
}

/**
 * Attendance import and reporting - daily logs from Deli clock times,
 * recalculated against company work schedules and public holidays.
 */
@Injectable()
export class AttendanceService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: AttendanceMatchingService,
    @Inject(forwardRef(() => WorkScheduleService))
    private readonly workScheduleService: WorkScheduleService,
    private readonly permissionService: PermissionService,
    private readonly previewCache: AttendancePreviewCache,
    private readonly notificationService: NotificationService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly onBehalfService: OnBehalfService,
    private readonly dayCoverage: DayCoverageService,
    private readonly backdatingPolicy: BackdatingPolicyService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Parses an uploaded Deli export, matches employees, and caches the preview
   * for 10 minutes pending confirm.
   */
  async previewImport(
    file: Express.Multer.File,
    companyId: string,
    userId: string,
  ): Promise<AttendancePreviewResult> {
    let parseResult;
    try {
      parseResult = await parseAttendanceExcel(
        file.buffer,
        file.originalname,
      );
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to parse attendance file',
      );
    }

    const { month, year, fileName, rows } = parseResult;
    const matchResults = await this.matchingService.matchRows(rows, companyId, {
      month,
      year,
    });

    const existing = await this.prisma.attendanceImportBatch.findUnique({
      where: {
        companyId_month_year: { companyId, month, year },
      },
    });

    const matched = matchResults.filter(
      (row) =>
        row.confidence === 'IDENTITY' ||
        row.confidence === 'ID_MATCH' ||
        row.confidence === 'NAME_HIGH',
    );
    const review = matchResults.filter(
      (row) =>
        row.confidence === 'NAME_REVIEW' ||
        row.confidence === 'MAPPED_INACTIVE',
    );
    const rejected = matchResults.filter(
      (row) => row.confidence === 'NO_MATCH',
    );
    const ignored = matchResults.filter(
      (row) => row.confidence === 'IGNORED',
    );

    const foundEmployeeIds = new Set<string>();
    for (const row of [...matched, ...review]) {
      if (row.matchedEmployeeId) {
        foundEmployeeIds.add(row.matchedEmployeeId);
      }
    }

    const activeEmployees = await this.prisma.user.findMany({
      where: hrProcessEmployeeWhere({
        companyId,
        deletedAt: null,
        ...employedInMonthWhere(month, year),
        includeInPayroll: true,
        attendanceMode: AttendanceMode.SCANNER,
      }),
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
        attendanceMode: true,
        departmentId: true,
        nationality: true,
        employmentDate: true,
        department: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const missingEmployees = activeEmployees.filter(
      (employee) => !foundEmployeeIds.has(employee.id),
    );
    // Earlier "Needs enrolment" months (up to two years back) → nth month label.
    const enrolmentRecords =
      missingEmployees.length > 0
        ? await this.prisma.attendanceRecord.findMany({
            where: {
              companyId,
              employeeId: { in: missingEmployees.map((e) => e.id) },
              matchMethod: AttendanceMatchMethod.NEEDS_ENROLMENT,
              year: { gte: year - 2, lte: year },
            },
            select: { employeeId: true, month: true, year: true },
          })
        : [];
    const enrolmentMonthsByEmployee = new Map<
      string,
      Array<{ month: number; year: number }>
    >();
    for (const record of enrolmentRecords) {
      const list = enrolmentMonthsByEmployee.get(record.employeeId) ?? [];
      list.push({ month: record.month, year: record.year });
      enrolmentMonthsByEmployee.set(record.employeeId, list);
    }

    const coverageByEmployee =
      missingEmployees.length > 0
        ? await this.buildMissingCoverageByEmployee(
            companyId,
            missingEmployees.map((e) => ({
              id: e.id,
              departmentId: e.departmentId,
              nationality: e.nationality,
              employmentDate: e.employmentDate,
            })),
            month,
            year,
          )
        : new Map();

    const missingFromAttendance: AttendanceMissingEmployee[] =
      missingEmployees.map((employee) => {
        const previous = previousNotEnrolledMonths(
          month,
          year,
          enrolmentMonthsByEmployee.get(employee.id) ?? [],
        );
        const coverage = coverageByEmployee.get(employee.id);
        const fullyCovered = coverage?.fullyCovered === true;
        return {
          id: employee.id,
          name: [employee.firstName, employee.middleName, employee.lastName]
            .map((part) => part?.trim() ?? '')
            .filter((part) => part.length > 0)
            .join(' '),
          employeeId: employee.employeeId,
          departmentName: employee.department?.name ?? null,
          attendanceMode: employee.attendanceMode,
          ...(coverage
            ? {
                totalWorkingDays: coverage.totalWorkingDays,
                coveredWorkingDays: coverage.coveredWorkingDays,
                fullyCovered: coverage.fullyCovered,
                coverageLabel: coverage.coverageLabel,
                coverageTag: coverage.coverageTag,
                siteCoverageDays: coverage.siteDays,
                wfhCoverageDays: coverage.wfhDays,
                leaveCoverageDays: coverage.leaveDays,
              }
            : {}),
          ...(fullyCovered
            ? { suggestedResolution: 'COVERED' as const }
            : previous > 0
              ? {
                  notEnrolledMonth: previous + 1,
                  suggestedResolution: 'NEEDS_ENROLMENT' as const,
                }
              : {}),
        };
      });

    const previewToken = `attendance:preview:${companyId}:${userId}:${Date.now()}`;
    const preview: CachedAttendancePreview = {
      previewToken,
      companyId,
      month,
      year,
      fileName,
      alreadyImported: !!existing,
      totalRows: rows.length,
      matched,
      review,
      rejected,
      ignored,
      missingFromAttendance,
    };

    await this.previewCache.set(previewToken, preview);

    return {
      previewToken,
      month,
      year,
      fileName,
      alreadyImported: !!existing,
      totalRows: rows.length,
      matched,
      review,
      rejected,
      ignored,
      missingFromAttendance,
    };
  }

  /**
   * Builds daily logs and month summary from raw clock times, work schedule,
   * and public holidays (Ethiopia-local times).
   */
  async calculateDailyLogs(
    employeeId: string,
    companyId: string,
    rawDailyData: AttendanceDailyRaw[],
    month: number,
    year: number,
    lastExportDate?: Date | null,
    shared?: CalculateDailyLogsShared,
  ): Promise<{ logs: AttendanceDailyLogInput[]; summary: AttendanceDailySummary }> {
    let nationality = shared?.employeeNationality;
    if (nationality === undefined) {
      const employee = await this.prisma.user.findFirst({
        where: { id: employeeId, companyId, deletedAt: null },
        select: { nationality: true },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
      nationality = employee.nationality;
    }

    const holidays =
      shared?.holidays ??
      (await this.prisma.publicHoliday.findMany({
        where: {
          companyId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          name: true,
          date: true,
          isRecurring: true,
          appliesToNationality: true,
        },
      }));

    const applicableHolidays = holidays.filter((holiday) =>
      holidayAppliesToNationality(
        holiday.appliesToNationality,
        nationality,
      ),
    );

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const policy =
      shared?.policy ??
      (await loadPolicySnapshot(this.prisma, companyId, monthStart));
    const resolveScheduleDays = await this.buildEmployeeScheduleDayResolver(
      employeeId,
      companyId,
      monthStart,
      monthEnd,
    );

    const exportDayKey = lastExportDate
      ? lastExportDate.toISOString().slice(0, 10)
      : null;

    const logs: AttendanceDailyLogInput[] = [];
    let payableHours = 0;

    for (const day of rawDailyData) {
      const date =
        day.date instanceof Date ? day.date : new Date(String(day.date));
      const dayOfWeek = date.getUTCDay();
      const scheduleDays = resolveScheduleDays(date);
      const scheduleDay = scheduleDays.find(
        (row) => row.dayOfWeek === dayOfWeek,
      );
      const scanOnly = isScanOnlySchedule(scheduleDay);

      const matchedHoliday = applicableHolidays.find((holiday) =>
        holidayFallsOnDate(holiday.date, holiday.isRecurring, date),
      );
      const isHoliday = Boolean(matchedHoliday);
      const wouldBeWorkingDay = scheduleDay?.isWorkingDay ?? false;
      const isWeekend = !wouldBeWorkingDay;
      const isDutyDay = !isHoliday && wouldBeWorkingDay;
      const isHalfDay = isDutyDay ? (scheduleDay?.isHalfDay ?? false) : false;
      const weekdayHours = Number(scheduleDay?.totalHours ?? 0);
      // Holidays / weekends are not scheduled duty - expected hours are 0.
      const scheduledHours = isDutyDay ? weekdayHours : 0;

      // SCAN_ONLY: any scan (first or last punch) is presence.
      const wasPresent = scanOnly
        ? Boolean(day.clockInLocal || day.clockOutLocal)
        : Boolean(day.clockInLocal);
      let recordedHours: number | null = null;
      if (day.clockInLocal && day.clockOutLocal) {
        recordedHours = calculateHoursBetween(
          day.clockInLocal,
          day.clockOutLocal,
        );
      }

      let isLate = false;
      let lateMinutes = 0;
      // Late flag (policy grace). Pay effect only via lateDeductionMode at recalc. SCAN_ONLY skips it.
      if (
        !scanOnly &&
        wasPresent &&
        isDutyDay &&
        scheduleDay?.morningStart &&
        day.clockInLocal
      ) {
        const late = isLateAfterGrace(
          day.clockInLocal,
          scheduleDay.morningStart,
          policy.lateGraceMinutes,
        );
        isLate = late.isLate;
        lateMinutes = late.lateMinutes;
      }

      // Missing punches only apply on scheduled duty days (not holidays/weekends)
      // and never on SCAN_ONLY schedules (one scan is a full day).
      const missingClockIn =
        !scanOnly && isDutyDay && !wasPresent && Boolean(day.clockOutLocal);
      const isLastExportDay =
        exportDayKey != null &&
        date.toISOString().slice(0, 10) === exportDayKey;
      const missingClockOut =
        !scanOnly &&
        isDutyDay &&
        wasPresent &&
        !day.clockOutLocal &&
        !isLastExportDay;

      // Payable hours: scheduled duty hours when present, plus paid public-holiday
      // credit on weekdays. Absent / weekend days add nothing.
      if (isHoliday && wouldBeWorkingDay) {
        payableHours += weekdayHours;
      } else if (isDutyDay && wasPresent) {
        payableHours += scheduledHours;
      }

      const flag = resolveAttendanceDayFlag({
        isHoliday,
        isWeekend,
        clockIn: day.clockInLocal,
        clockOut: day.clockOutLocal,
        isLastExportDay,
        scheduledEnd: scheduledEndForDay(scheduleDay),
        scanOnly,
        earlyDepartureGraceMinutes: policy.earlyDepartureGraceMinutes,
      });

      logs.push({
        date,
        clockInMachine: day.clockInMachine,
        clockOutMachine: day.clockOutMachine,
        clockInLocal: day.clockInLocal,
        clockOutLocal: day.clockOutLocal,
        isHoliday,
        holidayName: matchedHoliday?.name ?? null,
        isWeekend,
        isHalfDay,
        wasPresent,
        scheduledHours,
        recordedHours,
        isLate,
        lateMinutes,
        missingClockIn,
        missingClockOut,
        flag,
        isLastExportDay,
      });
    }

    const workingDayLogs = logs.filter(
      (log) => !log.isHoliday && !log.isWeekend,
    );
    const holidayLogs = logs.filter((log) => log.isHoliday);
    const daySummary = summarizeAttendanceDays(logs);

    const summary: AttendanceDailySummary = {
      scheduledDays: daySummary.scheduledDays,
      presentDays: daySummary.presentDays,
      absentDays: daySummary.absentDays,
      holidayDays: holidayLogs.length,
      lateDays: workingDayLogs.filter((log) => log.isLate).length,
      totalLateMinutes: workingDayLogs.reduce(
        (sum, log) => sum + log.lateMinutes,
        0,
      ),
      missingClockInDays: workingDayLogs.filter((log) => log.missingClockIn)
        .length,
      missingClockOutDays: workingDayLogs.filter((log) => log.missingClockOut)
        .length,
      payableHours: Math.round(payableHours * 100) / 100,
      flaggedDays: logs.filter((log) => log.flag !== AttendanceDayFlag.NONE)
        .length,
    };

    return { logs, summary };
  }

  /**
   * Persists a cached preview as an import batch + attendance records + daily logs.
   */
  async confirmImport(
    dto: ConfirmAttendanceImportDto,
    companyId: string,
    userId: string,
  ): Promise<AttendanceImportSummary> {
    const cached = await this.previewCache.get<CachedAttendancePreview>(
      dto.previewToken,
    );
    if (!cached) {
      throw new BadRequestException(
        'Import session expired. Please upload the file again.',
      );
    }
    if (cached.companyId !== companyId) {
      throw new ForbiddenException(
        'Preview does not belong to the current company',
      );
    }

    reviveMatchResultDates(cached.matched);
    reviveMatchResultDates(cached.review);
    reviveMatchResultDates(cached.rejected);
    reviveMatchResultDates(cached.ignored ?? []);

    const {
      month,
      year,
      fileName,
      matched,
      review,
      rejected,
      ignored = [],
      totalRows,
      missingFromAttendance = [],
    } = cached;

    const existing = await this.prisma.attendanceImportBatch.findUnique({
      where: {
        companyId_month_year: { companyId, month, year },
      },
    });

    if (existing && !dto.overwrite) {
      const monthName = MONTH_NAMES[month - 1] ?? String(month);
      throw new ConflictException(
        `Attendance data for ${monthName} ${year} has already been imported. Set overwrite to true to replace it.`,
      );
    }

    const assignments = dto.manualAssignments ?? [];
    const reviewAssignmentByIndex = new Map<number, string>();
    const rejectedAssignmentByIndex = new Map<number, string>();

    for (const assignment of assignments) {
      if (assignment.bucket === 'review') {
        if (
          assignment.rowIndex < 0 ||
          assignment.rowIndex >= review.length
        ) {
          throw new BadRequestException(
            `Invalid review row index: ${assignment.rowIndex}`,
          );
        }
        if (reviewAssignmentByIndex.has(assignment.rowIndex)) {
          throw new BadRequestException(
            `Duplicate manual assignment for review row ${assignment.rowIndex}`,
          );
        }
        reviewAssignmentByIndex.set(assignment.rowIndex, assignment.employeeId);
      } else {
        if (
          assignment.rowIndex < 0 ||
          assignment.rowIndex >= rejected.length
        ) {
          throw new BadRequestException(
            `Invalid rejected row index: ${assignment.rowIndex}`,
          );
        }
        if (rejectedAssignmentByIndex.has(assignment.rowIndex)) {
          throw new BadRequestException(
            `Duplicate manual assignment for rejected row ${assignment.rowIndex}`,
          );
        }
        rejectedAssignmentByIndex.set(
          assignment.rowIndex,
          assignment.employeeId,
        );
      }
    }

    const assignmentEmployeeIds = assignments.map((item) => item.employeeId);
    if (new Set(assignmentEmployeeIds).size !== assignmentEmployeeIds.length) {
      throw new BadRequestException(
        'Each ERP employee can only be matched once in an import',
      );
    }

    const employeeById = new Map<
      string,
      {
        id: string;
        firstName: string;
        lastName: string;
        employeeId: string | null;
      }
    >();

    if (assignmentEmployeeIds.length > 0) {
      // Approver-only accounts cannot receive attendance (reported as not found).
      const employees = await this.prisma.user.findMany({
        where: hrProcessEmployeeWhere({
          companyId,
          deletedAt: null,
          ...employedInMonthWhere(month, year),
          id: { in: [...new Set(assignmentEmployeeIds)] },
        }),
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
        },
      });
      if (employees.length !== new Set(assignmentEmployeeIds).size) {
        throw new BadRequestException(
          'One or more selected employees were not found in this company',
        );
      }
      for (const employee of employees) {
        employeeById.set(employee.id, employee);
      }
    }

    const confirmedIndices = new Set(dto.confirmedReviewIndices ?? []);
    for (const rowIndex of reviewAssignmentByIndex.keys()) {
      confirmedIndices.add(rowIndex);
    }

    const skippedReviewCount = review.filter(
      (_, index) => !confirmedIndices.has(index),
    ).length;

    type ImportRow = AttendanceMatchResult & {
      matchedEmployeeId: string;
      matchMethod: AttendanceMatchMethod;
    };
    const rowsToImport: ImportRow[] = [];
    const takenEmployeeIds = new Set<string>();
    const identitiesToUpsert: Array<{
      attendanceId: string;
      attendanceName: string;
      userId: string;
    }> = [];

    const claimEmployee = (id: string): void => {
      if (takenEmployeeIds.has(id)) {
        throw new BadRequestException(
          'Each ERP employee can only be matched once in an import',
        );
      }
      takenEmployeeIds.add(id);
    };

    const confidenceToMatchMethod = (
      confidence: AttendanceMatchResult['confidence'],
    ): AttendanceMatchMethod => {
      switch (confidence) {
        case 'IDENTITY':
          return AttendanceMatchMethod.IDENTITY;
        case 'ID_MATCH':
          return AttendanceMatchMethod.EMPLOYEE_ID;
        case 'NAME_HIGH':
          return AttendanceMatchMethod.NAME_HIGH;
        case 'NAME_REVIEW':
          return AttendanceMatchMethod.NAME_REVIEW;
        case 'MANUAL':
          return AttendanceMatchMethod.MANUAL;
        default:
          return AttendanceMatchMethod.MANUAL;
      }
    };

    let autoMatchedCount = 0;
    let manualAssignedCount = 0;

    for (const row of matched) {
      if (!row.matchedEmployeeId) {
        continue;
      }
      claimEmployee(row.matchedEmployeeId);
      rowsToImport.push({
        ...row,
        matchedEmployeeId: row.matchedEmployeeId,
        matchMethod: confidenceToMatchMethod(row.confidence),
      });
      autoMatchedCount += 1;
      if (!row.identityId) {
        identitiesToUpsert.push({
          attendanceId: row.attendanceId,
          attendanceName: row.attendanceName,
          userId: row.matchedEmployeeId,
        });
      }
    }

    for (let index = 0; index < review.length; index += 1) {
      if (!confirmedIndices.has(index)) {
        continue;
      }
      const row = review[index];
      if (row.confidence === 'MAPPED_INACTIVE' && !reviewAssignmentByIndex.has(index)) {
        // Inactive mapped identity must be reassigned manually.
        continue;
      }
      const overrideId = reviewAssignmentByIndex.get(index);
      if (overrideId) {
        const employee = employeeById.get(overrideId);
        if (!employee) {
          throw new BadRequestException(
            'One or more selected employees were not found in this company',
          );
        }
        claimEmployee(overrideId);
        rowsToImport.push({
          ...row,
          matchedEmployeeId: employee.id,
          matchedEmployeeName: formatUserDisplayName(employee),
          matchedEmployeeErpId: employee.employeeId,
          confidence: 'MANUAL',
          score: 100,
          matchMethod: AttendanceMatchMethod.MANUAL,
        });
        manualAssignedCount += 1;
        identitiesToUpsert.push({
          attendanceId: row.attendanceId,
          attendanceName: row.attendanceName,
          userId: employee.id,
        });
      } else if (row.matchedEmployeeId) {
        claimEmployee(row.matchedEmployeeId);
        rowsToImport.push({
          ...row,
          matchedEmployeeId: row.matchedEmployeeId,
          matchMethod: confidenceToMatchMethod(row.confidence),
        });
        autoMatchedCount += 1;
        if (!row.identityId) {
          identitiesToUpsert.push({
            attendanceId: row.attendanceId,
            attendanceName: row.attendanceName,
            userId: row.matchedEmployeeId,
          });
        }
      }
    }

    const ignoredByIndex = new Map(
      (dto.ignoredRows ?? []).map((row) => [row.rowIndex, row.reason.trim()]),
    );
    const stillRejected: AttendanceMatchResult[] = [];
    const ignoredThisImport: Array<{
      attendanceId: string;
      attendanceName: string;
      reason: string;
    }> = [];

    for (let index = 0; index < rejected.length; index += 1) {
      const row = rejected[index];
      const assignedId = rejectedAssignmentByIndex.get(index);
      const ignoreReason = ignoredByIndex.get(index);
      if (assignedId) {
        const employee = employeeById.get(assignedId);
        if (!employee) {
          throw new BadRequestException(
            'One or more selected employees were not found in this company',
          );
        }
        claimEmployee(assignedId);
        rowsToImport.push({
          ...row,
          matchedEmployeeId: employee.id,
          matchedEmployeeName: formatUserDisplayName(employee),
          matchedEmployeeErpId: employee.employeeId,
          confidence: 'MANUAL',
          score: 100,
          matchMethod: AttendanceMatchMethod.MANUAL,
        });
        manualAssignedCount += 1;
        identitiesToUpsert.push({
          attendanceId: row.attendanceId,
          attendanceName: row.attendanceName,
          userId: employee.id,
        });
      } else if (ignoreReason) {
        ignoredThisImport.push({
          attendanceId: row.attendanceId,
          attendanceName: row.attendanceName,
          reason: ignoreReason,
        });
      } else {
        stillRejected.push(row);
      }
    }

    const missingById = new Map(
      missingFromAttendance.map((row) => [row.id, row]),
    );
    const missingActions = dto.missingEmployeeActions ?? [];
    const seenMissingActionIds = new Set<string>();
    for (const action of missingActions) {
      if (seenMissingActionIds.has(action.employeeId)) {
        throw new BadRequestException(
          'Each missing employee can only have one resolution',
        );
      }
      seenMissingActionIds.add(action.employeeId);
      if (!missingById.has(action.employeeId)) {
        throw new BadRequestException(
          'Resolution refers to an employee who is not in the missing list',
        );
      }
      if (
        action.resolution === 'MANUAL_PRESENT' &&
        (!action.note || action.note.trim().length < 3)
      ) {
        throw new BadRequestException(
          'A reason is required for "Present this month"',
        );
      }
    }

    // EXEMPT employees (include freelancers) get full-presence records.
    const exemptEmployees = await this.prisma.user.findMany({
      where: hrProcessEmployeeWhere({
        companyId,
        deletedAt: null,
        ...employedInMonthWhere(month, year),
        includeInPayroll: true,
        attendanceMode: AttendanceMode.EXEMPT,
      }),
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
      },
    });

    for (const employee of exemptEmployees) {
      if (takenEmployeeIds.has(employee.id)) {
        continue;
      }
      claimEmployee(employee.id);
      const name = [employee.firstName, employee.middleName, employee.lastName]
        .map((part) => part?.trim() ?? '')
        .filter((part) => part.length > 0)
        .join(' ');
      rowsToImport.push({
        attendanceName: name,
        attendanceId: employee.employeeId ?? '-',
        matchedEmployeeId: employee.id,
        matchedEmployeeName: name,
        matchedEmployeeErpId: employee.employeeId,
        confidence: 'MANUAL',
        score: 100,
        identityId: null,
        matchNote: null,
        matchMethod: AttendanceMatchMethod.EXEMPT,
        data: { payableHours: 0, dailyData: [] },
      });
    }

    for (const missing of missingFromAttendance) {
      if (!missing.fullyCovered || takenEmployeeIds.has(missing.id)) {
        continue;
      }
      claimEmployee(missing.id);
      rowsToImport.push({
        attendanceName: missing.name,
        attendanceId: missing.employeeId ?? '-',
        matchedEmployeeId: missing.id,
        matchedEmployeeName: missing.name,
        matchedEmployeeErpId: missing.employeeId,
        confidence: 'MANUAL',
        score: 100,
        identityId: null,
        matchNote: null,
        matchMethod: AttendanceMatchMethod.COVERED,
        data: { payableHours: 0, dailyData: [] },
      });
    }

    for (const action of missingActions) {
      if (takenEmployeeIds.has(action.employeeId)) {
        continue;
      }
      const missing = missingById.get(action.employeeId);
      claimEmployee(action.employeeId);
      if (action.resolution === 'MARKED_EXEMPT') {
        await this.prisma.user.update({
          where: { id: action.employeeId },
          data: {
            attendanceMode: AttendanceMode.EXEMPT,
            updatedBy: userId,
          },
        });
      }
      rowsToImport.push({
        attendanceName: missing?.name ?? 'System employee',
        attendanceId: missing?.employeeId ?? '-',
        matchedEmployeeId: action.employeeId,
        matchedEmployeeName: missing?.name ?? null,
        matchedEmployeeErpId: missing?.employeeId ?? null,
        confidence: 'MANUAL',
        score: 100,
        identityId: null,
        matchNote: null,
        matchMethod:
          action.resolution === 'MARKED_EXEMPT'
            ? AttendanceMatchMethod.EXEMPT
            : action.resolution === 'NEEDS_ENROLMENT'
              ? AttendanceMatchMethod.NEEDS_ENROLMENT
              : AttendanceMatchMethod.MANUAL_PRESENT,
        data: { payableHours: 0, dailyData: [] },
      });
      manualAssignedCount += 1;
    }

    const confirmedReviewCount = [...confirmedIndices].filter(
      (index) => index >= 0 && index < review.length,
    ).length;

    let lastExportDate: Date | null = null;
    for (const row of rowsToImport) {
      for (const day of row.data.dailyData ?? []) {
        const date =
          day.date instanceof Date ? day.date : new Date(String(day.date));
        if (!lastExportDate || date.getTime() > lastExportDate.getTime()) {
          lastExportDate = date;
        }
      }
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const importEmployeeIds = [
      ...new Set(rowsToImport.map((row) => row.matchedEmployeeId)),
    ];
    const [companyHolidays, importPolicy, nationalityRows] = await Promise.all([
      this.prisma.publicHoliday.findMany({
        where: {
          companyId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          name: true,
          date: true,
          isRecurring: true,
          appliesToNationality: true,
        },
      }),
      loadPolicySnapshot(this.prisma, companyId, monthStart),
      importEmployeeIds.length > 0
        ? this.prisma.user.findMany({
            where: {
              companyId,
              deletedAt: null,
              id: { in: importEmployeeIds },
            },
            select: { id: true, nationality: true },
          })
        : Promise.resolve([] as Array<{ id: string; nationality: Nationality | null }>),
    ]);
    const nationalityByEmployeeId = new Map(
      nationalityRows.map((row) => [row.id, row.nationality]),
    );

    const prepared = await this.mapWithConcurrency(
      rowsToImport,
      IMPORT_CONCURRENCY,
      async (row) => {
        const { logs, summary } = await this.calculateDailyLogs(
          row.matchedEmployeeId,
          companyId,
          row.data.dailyData ?? [],
          month,
          year,
          lastExportDate,
          {
            holidays: companyHolidays,
            policy: importPolicy,
            employeeNationality:
              nationalityByEmployeeId.get(row.matchedEmployeeId) ?? null,
          },
        );
        return {
          row,
          logs,
          summary,
          recordId: randomUUID(),
        };
      },
    );

    let batchId = '';

    await this.prisma.$transaction(
      async (tx) => {
        if (existing && dto.overwrite) {
          // Cascade from AttendanceImportBatch cannot remove FieldMovementEntry
          // (onDelete: NoAction on dailyLog). Clear dependents first.
          const records = await tx.attendanceRecord.findMany({
            where: { importBatchId: existing.id },
            select: { id: true },
          });
          const recordIds = records.map((r) => r.id);

          const dailyLogs =
            recordIds.length > 0
              ? await tx.attendanceDailyLog.findMany({
                  where: { attendanceRecordId: { in: recordIds } },
                  select: { id: true },
                })
              : [];
          const dailyLogIds = dailyLogs.map((l) => l.id);

          if (dailyLogIds.length > 0) {
            await tx.fieldMovementEntry.deleteMany({
              where: { dailyLogId: { in: dailyLogIds } },
            });

            await tx.attendanceDailyLogCorrection.deleteMany({
              where: { dailyLogId: { in: dailyLogIds } },
            });
          }

          await tx.fieldMovementLog.deleteMany({
            where: {
              companyId,
              entries: { none: {} },
            },
          });

          await tx.attendanceMonthlyApproval.deleteMany({
            where: {
              OR: [
                { importBatchId: existing.id },
                { companyId, month, year },
              ],
            },
          });

          await tx.attendanceImportBatch.delete({
            where: { id: existing.id },
          });
        }

        const batch = await tx.attendanceImportBatch.create({
          data: {
            id: randomUUID(),
            companyId,
            month,
            year,
            fileName,
            importedBy: userId,
            totalRows,
            matchedRows: prepared.length,
            reviewRows: confirmedReviewCount,
            rejectedRows: stillRejected.length,
            importedAt: new Date(),
          },
        });
        batchId = batch.id;

        if (prepared.length > 0) {
          await tx.attendanceRecord.createMany({
            data: prepared.map((item) => ({
              id: item.recordId,
              companyId,
              employeeId: item.row.matchedEmployeeId,
              importBatchId: batch.id,
              month,
              year,
              matchMethod: item.row.matchMethod,
              scheduledDays: item.summary.scheduledDays,
              presentDays: item.summary.presentDays,
              absentDays: item.summary.absentDays,
              holidayDays: item.summary.holidayDays,
              lateDays: item.summary.lateDays,
              totalLateMinutes: item.summary.totalLateMinutes,
              missingClockInDays: item.summary.missingClockInDays,
              missingClockOutDays: item.summary.missingClockOutDays,
              payableHours: item.summary.payableHours,
              flaggedDays: item.summary.flaggedDays,
              resolvedDays: 0,
              importedAt: new Date(),
            })),
          });

          const dailyRows = prepared.flatMap((item) =>
            item.logs.map((log) => ({
              id: randomUUID(),
              attendanceRecordId: item.recordId,
              date:
                log.date instanceof Date
                  ? log.date
                  : new Date(String(log.date)),
              clockInMachine: log.clockInMachine,
              clockOutMachine: log.clockOutMachine,
              clockInLocal: log.clockInLocal,
              clockOutLocal: log.clockOutLocal,
              isHoliday: log.isHoliday,
              holidayName: log.holidayName,
              isWeekend: log.isWeekend,
              isHalfDay: log.isHalfDay,
              wasPresent: log.wasPresent,
              scheduledHours: log.scheduledHours,
              recordedHours: log.recordedHours,
              isLate: log.isLate,
              lateMinutes: log.lateMinutes,
              missingClockIn: log.missingClockIn,
              missingClockOut: log.missingClockOut,
              flag: log.flag,
              isLastExportDay: log.isLastExportDay,
            })),
          );

          const CHUNK = 400;
          for (let offset = 0; offset < dailyRows.length; offset += CHUNK) {
            await tx.attendanceDailyLog.createMany({
              data: dailyRows.slice(offset, offset + CHUNK),
            });
          }
        }

        const now = new Date();

        // Build upsert factories (not promises) so work starts only when awaited.
        const identityUpsertFns: Array<() => Promise<unknown>> = [
          ...identitiesToUpsert.map((identity) => {
            const attendanceName = normaliseAttendanceName(
              identity.attendanceName,
            );
            return () =>
              tx.attendanceIdentity.upsert({
                where: {
                  companyId_attendanceId_attendanceName: {
                    companyId,
                    attendanceId: identity.attendanceId,
                    attendanceName,
                  },
                },
                create: {
                  id: randomUUID(),
                  companyId,
                  attendanceId: identity.attendanceId,
                  attendanceName,
                  status: AttendanceIdentityStatus.MAPPED,
                  userId: identity.userId,
                  reason: null,
                  decidedBy: userId,
                  decidedAt: now,
                  createdBy: userId,
                  updatedBy: userId,
                },
                update: {
                  status: AttendanceIdentityStatus.MAPPED,
                  userId: identity.userId,
                  reason: null,
                  decidedBy: userId,
                  decidedAt: now,
                  updatedBy: userId,
                  deletedAt: null,
                  deletedBy: null,
                },
              });
          }),
          ...ignoredThisImport.map((ignoredRow) => {
            const attendanceName = normaliseAttendanceName(
              ignoredRow.attendanceName,
            );
            return () =>
              tx.attendanceIdentity.upsert({
                where: {
                  companyId_attendanceId_attendanceName: {
                    companyId,
                    attendanceId: ignoredRow.attendanceId,
                    attendanceName,
                  },
                },
                create: {
                  id: randomUUID(),
                  companyId,
                  attendanceId: ignoredRow.attendanceId,
                  attendanceName,
                  status: AttendanceIdentityStatus.IGNORED,
                  userId: null,
                  reason: ignoredRow.reason,
                  decidedBy: userId,
                  decidedAt: now,
                  createdBy: userId,
                  updatedBy: userId,
                },
                update: {
                  status: AttendanceIdentityStatus.IGNORED,
                  userId: null,
                  reason: ignoredRow.reason,
                  decidedBy: userId,
                  decidedAt: now,
                  updatedBy: userId,
                  deletedAt: null,
                  deletedBy: null,
                },
              });
          }),
        ];
        const IDENTITY_CHUNK = 20;
        for (
          let offset = 0;
          offset < identityUpsertFns.length;
          offset += IDENTITY_CHUNK
        ) {
          await Promise.all(
            identityUpsertFns
              .slice(offset, offset + IDENTITY_CHUNK)
              .map((run) => run()),
          );
        }

        const unmatchedRows: Array<{
          id: string;
          companyId: string;
          batchId: string;
          attendanceId: string;
          attendanceName: string;
          status: AttendanceUnmatchedStatus;
        }> = [
          ...stillRejected.map((row) => ({
            id: randomUUID(),
            companyId,
            batchId: batch.id,
            attendanceId: row.attendanceId,
            attendanceName: row.attendanceName,
            status: AttendanceUnmatchedStatus.UNMATCHED,
          })),
          ...ignoredThisImport.map((row) => ({
            id: randomUUID(),
            companyId,
            batchId: batch.id,
            attendanceId: row.attendanceId,
            attendanceName: row.attendanceName,
            status: AttendanceUnmatchedStatus.IGNORED,
          })),
          ...ignored.map((row) => ({
            id: randomUUID(),
            companyId,
            batchId: batch.id,
            attendanceId: row.attendanceId,
            attendanceName: row.attendanceName,
            status: AttendanceUnmatchedStatus.IGNORED,
          })),
        ];

        if (unmatchedRows.length > 0) {
          await tx.attendanceImportUnmatched.createMany({ data: unmatchedRows });
        }

        const missingActionByUser = new Map(
          missingActions.map((action) => [action.employeeId, action]),
        );
        const missingRows = missingFromAttendance
          .filter((employee) => !takenEmployeeIds.has(employee.id))
          .map((employee) => {
            const action = missingActionByUser.get(employee.id);
            const resolution =
              employee.fullyCovered
                ? AttendanceMissingResolution.COVERED
                : action?.resolution === 'NEEDS_ENROLMENT'
                  ? AttendanceMissingResolution.NEEDS_ENROLMENT
                  : action?.resolution === 'MARKED_EXEMPT'
                    ? AttendanceMissingResolution.MARKED_EXEMPT
                    : action?.resolution === 'MANUAL_PRESENT'
                      ? AttendanceMissingResolution.MANUAL_PRESENT
                      : AttendanceMissingResolution.PENDING;
            const isResolved =
              resolution !== AttendanceMissingResolution.PENDING;
            return {
              id: randomUUID(),
              companyId,
              batchId: batch.id,
              userId: employee.id,
              resolution,
              note:
                employee.fullyCovered
                  ? (employee.coverageLabel ?? 'Fully covered by schedule')
                  : action?.note?.trim() ||
                    (resolution === AttendanceMissingResolution.NEEDS_ENROLMENT
                      ? NOT_ENROLLED_RECORD_NOTE
                      : null),
              resolvedBy: isResolved ? userId : null,
              resolvedAt: isResolved ? now : null,
            };
          });

        // Also persist resolved missing employees who received a record this
        // import (Exempt / Present this month / Needs enrolment) so the review
        // page shows the outcome.
        for (const missing of missingFromAttendance) {
          if (!missing.fullyCovered) {
            continue;
          }
          if (missingRows.some((row) => row.userId === missing.id)) {
            continue;
          }
          missingRows.push({
            id: randomUUID(),
            companyId,
            batchId: batch.id,
            userId: missing.id,
            resolution: AttendanceMissingResolution.COVERED,
            note: missing.coverageLabel ?? 'Fully covered by schedule',
            resolvedBy: userId,
            resolvedAt: now,
          });
        }

        for (const action of missingActions) {
          if (missingRows.some((row) => row.userId === action.employeeId)) {
            continue;
          }
          missingRows.push({
            id: randomUUID(),
            companyId,
            batchId: batch.id,
            userId: action.employeeId,
            resolution:
              action.resolution === 'MARKED_EXEMPT'
                ? AttendanceMissingResolution.MARKED_EXEMPT
                : action.resolution === 'NEEDS_ENROLMENT'
                  ? AttendanceMissingResolution.NEEDS_ENROLMENT
                  : AttendanceMissingResolution.MANUAL_PRESENT,
            note:
              action.note?.trim() ||
              (action.resolution === 'NEEDS_ENROLMENT'
                ? NOT_ENROLLED_RECORD_NOTE
                : null),
            resolvedBy: userId,
            resolvedAt: now,
          });
        }

        if (missingRows.length > 0) {
          await tx.attendanceImportMissing.createMany({ data: missingRows });
        }
      },
      {
        maxWait: 20_000,
        timeout: 120_000,
      },
    );

    await this.createMonthlyApproval(batchId, companyId, userId);
    await this.recalculateCompanyAttendanceMonth(companyId, month, year);
    await this.previewCache.del(dto.previewToken);

    return {
      month,
      year,
      importedCount: prepared.length,
      autoMatchedCount,
      manualAssignedCount,
      skippedReviewCount,
      rejectedCount: stillRejected.length,
      rejectedNames: stillRejected.map((row) => row.attendanceName),
    };
  }

  /**
   * Searches active company employees for manual attendance assignment.
   */
  async searchEmployees(
    query: string,
    companyId: string,
  ): Promise<AttendanceEmployeeSearchResult[]> {
    const trimmed = query?.trim() ?? '';
    if (trimmed.length < 2) {
      return [];
    }

    return this.prisma.user.findMany({
      where: hrProcessEmployeeWhere({
        companyId,
        deletedAt: null,
        isActive: true,
        OR: [
          { firstName: { contains: trimmed, mode: 'insensitive' as const } },
          { lastName: { contains: trimmed, mode: 'insensitive' as const } },
          { employeeId: { contains: trimmed, mode: 'insensitive' as const } },
        ],
      }),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        department: { select: { id: true, name: true } },
      },
      take: 10,
      orderBy: { firstName: 'asc' },
    });
  }

  /**
   * Paginated attendance records. HR viewers see company-wide data; others
   * are scoped to their own employee id. Search applies to HR only.
   */
  async listRecords(
    filters: ListAttendanceDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const now = new Date();
    const month = filters.month ?? now.getMonth() + 1;
    const year = filters.year ?? now.getFullYear();

    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );

    // Supervisors (anyone with reports) see their team's attendance too.
    const teamIds = isHrViewer
      ? null
      : await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId);
    const scopedEmployee =
      filters.employeeId && (teamIds === null || teamIds.includes(filters.employeeId))
        ? filters.employeeId
        : null;

    const where: Prisma.AttendanceRecordWhereInput = {
      companyId,
      month,
      year,
      ...(scopedEmployee
        ? { employeeId: scopedEmployee }
        : teamIds
          ? { employeeId: { in: teamIds } }
          : {}),
      ...((isHrViewer || (teamIds?.length ?? 0) > 1) && filters.search?.trim()
        ? {
            employee: hrProcessEmployeeWhere({
              OR: [
                {
                  firstName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  middleName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  lastName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  chineseName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }),
          }
        : { employee: hrProcessEmployeeWhere() }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        skip,
        take,
        orderBy: [{ employee: { lastName: 'asc' } }],
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              chineseName: true,
              employeeId: true,
              departmentId: true,
              department: {
                select: { id: true, name: true },
              },
            },
          },
          importBatch: {
            select: {
              id: true,
              fileName: true,
              importedAt: true,
            },
          },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    const recordIds = rows.map((row) => row.id);
    const leaveGroups =
      recordIds.length > 0
        ? await this.prisma.attendanceDailyLog.groupBy({
            by: ['attendanceRecordId'],
            where: {
              attendanceRecordId: { in: recordIds },
              dayStatus: 'LEAVE',
            },
            _count: { _all: true },
          })
        : [];
    const leaveDaysByRecord = new Map(
      leaveGroups.map((g) => [g.attendanceRecordId, g._count._all]),
    );

    const siteLogRows =
      recordIds.length > 0
        ? await this.prisma.attendanceDailyLog.findMany({
            where: {
              attendanceRecordId: { in: recordIds },
              siteAssignmentName: { not: null },
            },
            select: {
              attendanceRecordId: true,
              siteAssignmentName: true,
            },
          })
        : [];
    const siteSummaryByRecord = new Map<
      string,
      Array<{ siteName: string; days: number }>
    >();
    for (const log of siteLogRows) {
      const name = log.siteAssignmentName?.trim();
      if (!name) {
        continue;
      }
      const list = siteSummaryByRecord.get(log.attendanceRecordId) ?? [];
      const existing = list.find((entry) => entry.siteName === name);
      if (existing) {
        existing.days += 1;
      } else {
        list.push({ siteName: name, days: 1 });
      }
      siteSummaryByRecord.set(log.attendanceRecordId, list);
    }

    const wfhGroups =
      recordIds.length > 0
        ? await this.prisma.attendanceDailyLog.groupBy({
            by: ['attendanceRecordId'],
            where: {
              attendanceRecordId: { in: recordIds },
              dayStatus: 'WORK_FROM_HOME',
            },
            _count: { _all: true },
          })
        : [];
    const wfhDaysByRecord = new Map(
      wfhGroups.map((g) => [g.attendanceRecordId, g._count._all]),
    );

    const employeeIds = rows.map((row) => row.employeeId);
    const approvedLeaveByEmployee =
      employeeIds.length > 0
        ? await getApprovedLeaveSummariesForEmployees(
            this.prisma,
            companyId,
            employeeIds,
            month,
            year,
          )
        : new Map();

    const policy = await loadPolicySnapshot(
      this.prisma,
      companyId,
      new Date(Date.UTC(year, month - 1, 1)),
    );
    const enriched = rows.map((row) => {
      // Fields added in 20261009160000; cast until prisma generate refreshes the client.
      const earlyFields = row as typeof row & {
        earlyDepartureWouldDeductDays?: Prisma.Decimal | number | null;
      };
      const wouldDays = Number(earlyFields.earlyDepartureWouldDeductDays ?? 0);
      return {
        ...row,
        leaveDaysThisMonth: leaveDaysByRecord.get(row.id) ?? 0,
        approvedLeave: approvedLeaveByEmployee.get(row.employeeId) ?? [],
        siteDaysThisMonth: siteSummaryByRecord.get(row.id) ?? [],
        workFromHomeDaysThisMonth: wfhDaysByRecord.get(row.id) ?? 0,
        forgotToClockFlagThreshold: policy.forgotToClockFlagThreshold,
        earlyDepartureWouldDeductNote:
          wouldDays > 0
            ? `Would deduct ${wouldDays} day(s) (not applied)`
            : null,
      };
    });

    return buildPaginatedResult(enriched, total, page, limit);
  }

  /**
   * Year profile for one employee: month rows with rates, daily logs, summary.
   */
  /**
   * Another employee's attendance: HR (hr.view), or a supervisor whose team
   * includes the employee. Own attendance is always allowed.
   */
  async assertCanViewEmployeeAttendance(
    viewerId: string,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    if (viewerId === employeeId) {
      return;
    }
    if (await this.permissionService.hasPermission(viewerId, companyId, 'hr', 'view')) {
      return;
    }
    if (await isEmployeeInTeamScope(this.prisma, viewerId, companyId, employeeId)) {
      return;
    }
    throw new ForbiddenException(
      "You do not have access to this employee's attendance",
    );
  }

  async getMyAttendance(
    employeeId: string,
    companyId: string,
    year: number,
  ): Promise<unknown> {
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId, employeeId, year },
      orderBy: { month: 'asc' },
      include: {
        importBatch: {
          select: { fileName: true, importedAt: true },
        },
        dailyLogs: {
          orderBy: { date: 'asc' },
        },
      },
    });

    const data = records.map((record) => ({
      ...record,
      monthName: MONTH_NAMES[record.month - 1],
      attendanceRate: computeAttendanceRate(
        record.scheduledDays,
        record.presentDays,
      ),
    }));

    const rates = data
      .map((row) => row.attendanceRate)
      .filter((rate): rate is number => rate !== null);

    const summary = {
      totalScheduledDays: data.reduce(
        (sum, row) => sum + Number(row.scheduledDays),
        0,
      ),
      totalPresentDays: data.reduce(
        (sum, row) => sum + Number(row.presentDays),
        0,
      ),
      totalAbsentDays: data.reduce(
        (sum, row) => sum + Number(row.absentDays),
        0,
      ),
      totalLateDays: data.reduce((sum, row) => sum + row.lateDays, 0),
      totalLateMinutes: data.reduce(
        (sum, row) => sum + row.totalLateMinutes,
        0,
      ),
      totalMissingClockOutDays: data.reduce(
        (sum, row) => sum + row.missingClockOutDays,
        0,
      ),
      totalPayableHours: Math.round(
        data.reduce((sum, row) => sum + Number(row.payableHours), 0) * 100,
      ) / 100,
      averageAttendanceRate:
        rates.length > 0
          ? Math.round(
              rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
            )
          : null,
    };

    return {
      employee,
      year,
      records: data,
      summary,
    };
  }

  /**
   * Import batch history for HR - which months were imported and by whom.
   */
  async getImportHistory(companyId: string): Promise<unknown> {
    return this.prisma.attendanceImportBatch.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        importer: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { records: true } },
        unmatchedRows: true,
        missingRows: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
                employeeId: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Unmatched and missing rows for a single import batch (review page).
   */
  async getImportBatchDetails(
    batchId: string,
    companyId: string,
  ): Promise<{
    unmatched: unknown[];
    missing: unknown[];
  }> {
    const batch = await this.prisma.attendanceImportBatch.findFirst({
      where: { id: batchId, companyId },
      select: { id: true },
    });
    if (!batch) {
      throw new NotFoundException('Import batch not found');
    }

    const [unmatched, missing] = await Promise.all([
      this.prisma.attendanceImportUnmatched.findMany({
        where: { batchId, companyId },
        orderBy: { attendanceName: 'asc' },
      }),
      this.prisma.attendanceImportMissing.findMany({
        where: { batchId, companyId },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              employeeId: true,
              department: { select: { name: true } },
              attendanceMode: true,
            },
          },
        },
      }),
    ]);

    return { unmatched, missing };
  }

  /**
   * Lists attendance device identities for HR mapping maintenance.
   */
  async listIdentities(
    companyId: string,
    status?: 'MAPPED' | 'IGNORED',
  ): Promise<unknown[]> {
    return this.prisma.attendanceIdentity.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(status
          ? { status: status as AttendanceIdentityStatus }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { attendanceName: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            employeeId: true,
            isActive: true,
          },
        },
        decider: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Removes a previously ignored identity from the current import preview so
   * HR can assign it. Soft-deletes the IGNORED identity (it will not auto-ignore
   * on future imports) and moves the row from ignored → rejected in the cache.
   */
  async unignorePreviewRow(
    dto: { previewToken: string; ignoredIndex: number },
    companyId: string,
    userId: string,
  ): Promise<{
    previewToken: string;
    ignored: AttendanceMatchResult[];
    rejected: AttendanceMatchResult[];
  }> {
    const cached = await this.previewCache.get<CachedAttendancePreview>(
      dto.previewToken,
    );
    if (!cached) {
      throw new BadRequestException(
        'Import session expired. Please upload the file again.',
      );
    }
    if (cached.companyId !== companyId) {
      throw new ForbiddenException(
        'Preview does not belong to the current company',
      );
    }

    reviveMatchResultDates(cached.ignored ?? []);
    reviveMatchResultDates(cached.rejected);

    const ignored = [...(cached.ignored ?? [])];
    if (
      !Number.isInteger(dto.ignoredIndex) ||
      dto.ignoredIndex < 0 ||
      dto.ignoredIndex >= ignored.length
    ) {
      throw new BadRequestException('Ignored row index is out of range');
    }

    const [row] = ignored.splice(dto.ignoredIndex, 1);
    if (row.identityId) {
      const identity = await this.prisma.attendanceIdentity.findFirst({
        where: {
          id: row.identityId,
          companyId,
          deletedAt: null,
          status: AttendanceIdentityStatus.IGNORED,
        },
      });
      if (identity) {
        await this.prisma.attendanceIdentity.update({
          where: { id: identity.id },
          data: {
            deletedAt: new Date(),
            deletedBy: userId,
            updatedBy: userId,
          },
        });
      }
    }

    const restored: AttendanceMatchResult = {
      ...row,
      confidence: 'NO_MATCH',
      identityId: null,
      matchNote: null,
      matchedEmployeeId: null,
      matchedEmployeeName: null,
      matchedEmployeeErpId: null,
      score: null,
    };
    const rejected = [...cached.rejected, restored];

    const next: CachedAttendancePreview = {
      ...cached,
      ignored,
      rejected,
    };
    await this.previewCache.set(dto.previewToken, next);

    return {
      previewToken: dto.previewToken,
      ignored,
      rejected,
    };
  }

  /**
   * Updates an attendance identity mapping or restores an ignored row.
   */
  async updateIdentity(
    id: string,
    dto: {
      status?: 'MAPPED' | 'IGNORED';
      userId?: string | null;
      reason?: string | null;
    },
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const identity = await this.prisma.attendanceIdentity.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!identity) {
      throw new NotFoundException('Attendance identity not found');
    }

    const nextStatus =
      dto.status ??
      (dto.userId
        ? AttendanceIdentityStatus.MAPPED
        : identity.status);

    if (nextStatus === AttendanceIdentityStatus.MAPPED) {
      const mappedUserId = dto.userId ?? identity.userId;
      if (!mappedUserId) {
        throw new BadRequestException(
          'A mapped identity requires an ERP employee',
        );
      }
      const employee = await this.prisma.user.findFirst({
        where: { id: mappedUserId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!employee) {
        throw new BadRequestException('Employee not found in this company');
      }

      return this.prisma.attendanceIdentity.update({
        where: { id },
        data: {
          status: AttendanceIdentityStatus.MAPPED,
          userId: mappedUserId,
          reason: null,
          decidedBy: userId,
          decidedAt: new Date(),
          updatedBy: userId,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              isActive: true,
            },
          },
        },
      });
    }

    if (!dto.reason?.trim() && !identity.reason) {
      throw new BadRequestException('A reason is required to ignore an identity');
    }

    return this.prisma.attendanceIdentity.update({
      where: { id },
      data: {
        status: AttendanceIdentityStatus.IGNORED,
        userId: null,
        reason: dto.reason?.trim() || identity.reason,
        decidedBy: userId,
        decidedAt: new Date(),
        updatedBy: userId,
      },
    });
  }

  /**
   * Resolves a missing-from-file employee on an existing import batch.
   */
  async resolveImportMissing(
    batchId: string,
    missingId: string,
    dto: {
      resolution: 'MARKED_EXEMPT' | 'MANUAL_PRESENT' | 'NEEDS_ENROLMENT';
      note?: string;
    },
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const missing = await this.prisma.attendanceImportMissing.findFirst({
      where: { id: missingId, batchId, companyId },
      include: {
        batch: { select: { month: true, year: true, id: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            employeeId: true,
          },
        },
      },
    });
    if (!missing) {
      throw new NotFoundException('Missing employee row not found');
    }

    if (
      dto.resolution === 'MANUAL_PRESENT' &&
      (!dto.note || dto.note.trim().length < 3)
    ) {
      throw new BadRequestException(
        'A reason is required for "Present this month"',
      );
    }

    const now = new Date();
    const { month, year } = missing.batch;

    const matchMethod =
      dto.resolution === 'MARKED_EXEMPT'
        ? AttendanceMatchMethod.EXEMPT
        : dto.resolution === 'NEEDS_ENROLMENT'
          ? AttendanceMatchMethod.NEEDS_ENROLMENT
          : AttendanceMatchMethod.MANUAL_PRESENT;

    if (dto.resolution === 'MARKED_EXEMPT') {
      await this.prisma.user.update({
        where: { id: missing.userId },
        data: {
          attendanceMode: AttendanceMode.EXEMPT,
          updatedBy: userId,
        },
      });
    }

    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: {
        companyId_employeeId_month_year: {
          companyId,
          employeeId: missing.userId,
          month,
          year,
        },
      },
      select: { id: true },
    });

    if (existingRecord) {
      await this.prisma.attendanceRecord.update({
        where: { id: existingRecord.id },
        data: { matchMethod },
      });
    } else {
      const name = [
        missing.user.firstName,
        missing.user.middleName,
        missing.user.lastName,
      ]
        .map((part) => part?.trim() ?? '')
        .filter((part) => part.length > 0)
        .join(' ');

      const { logs, summary } = await this.calculateDailyLogs(
        missing.userId,
        companyId,
        [],
        month,
        year,
        null,
      );

      const recordId = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        await tx.attendanceRecord.create({
          data: {
            id: recordId,
            companyId,
            employeeId: missing.userId,
            importBatchId: batchId,
            month,
            year,
            matchMethod,
            scheduledDays: summary.scheduledDays,
            presentDays: summary.presentDays,
            absentDays: summary.absentDays,
            holidayDays: summary.holidayDays,
            lateDays: summary.lateDays,
            totalLateMinutes: summary.totalLateMinutes,
            missingClockInDays: summary.missingClockInDays,
            missingClockOutDays: summary.missingClockOutDays,
            payableHours: summary.payableHours,
            flaggedDays: summary.flaggedDays,
            resolvedDays: 0,
            importedAt: now,
          },
        });
        if (logs.length > 0) {
          await tx.attendanceDailyLog.createMany({
            data: logs.map((log) => ({
              id: randomUUID(),
              attendanceRecordId: recordId,
              date:
                log.date instanceof Date
                  ? log.date
                  : new Date(String(log.date)),
              clockInMachine: log.clockInMachine,
              clockOutMachine: log.clockOutMachine,
              clockInLocal: log.clockInLocal,
              clockOutLocal: log.clockOutLocal,
              isHoliday: log.isHoliday,
              holidayName: log.holidayName,
              isWeekend: log.isWeekend,
              isHalfDay: log.isHalfDay,
              wasPresent: log.wasPresent,
              scheduledHours: log.scheduledHours,
              recordedHours: log.recordedHours,
              isLate: log.isLate,
              lateMinutes: log.lateMinutes,
              missingClockIn: log.missingClockIn,
              missingClockOut: log.missingClockOut,
              flag: log.flag,
              isLastExportDay: log.isLastExportDay,
            })),
          });
        }
        void name;
      });
    }

    // Present / paid / absent days must reflect the decision straight away.
    await this.recalculateAttendanceRecord(
      missing.userId,
      companyId,
      month,
      year,
    );

    return this.prisma.attendanceImportMissing.update({
      where: { id: missing.id },
      data: {
        resolution:
          dto.resolution === 'MARKED_EXEMPT'
            ? AttendanceMissingResolution.MARKED_EXEMPT
            : dto.resolution === 'NEEDS_ENROLMENT'
              ? AttendanceMissingResolution.NEEDS_ENROLMENT
              : AttendanceMissingResolution.MANUAL_PRESENT,
        note:
          dto.note?.trim() ||
          (dto.resolution === 'NEEDS_ENROLMENT'
            ? NOT_ENROLLED_RECORD_NOTE
            : null),
        resolvedBy: userId,
        resolvedAt: now,
      },
    });
  }

  /**
   * Employees on the open enrolment list: a Needs-enrolment month with no later
   * month that contains a scan. Derived from current records, so overwrite /
   * re-import keeps it correct.
   */
  async listAwaitingEnrolment(
    companyId: string,
  ): Promise<AwaitingEnrolmentEmployee[]> {
    const enrolment = await this.prisma.attendanceRecord.findMany({
      where: {
        companyId,
        matchMethod: AttendanceMatchMethod.NEEDS_ENROLMENT,
        employee: hrProcessEmployeeWhere({
          deletedAt: null,
          isActive: true,
          employmentStatus: { not: 'SEPARATED' as const },
        }),
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });
    const employeeIds = enrolment.map((row) => row.employeeId);
    if (employeeIds.length === 0) {
      return [];
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId, employeeId: { in: employeeIds } },
      select: {
        employeeId: true,
        month: true,
        year: true,
        matchMethod: true,
        _count: {
          select: {
            dailyLogs: {
              where: {
                OR: [
                  { clockInLocal: { not: null } },
                  { clockOutLocal: { not: null } },
                ],
              },
            },
          },
        },
        employee: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            chineseName: true,
            employeeId: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const entries = awaitingEnrolment(
      records.map((record) => ({
        employeeId: record.employeeId,
        month: record.month,
        year: record.year,
        matchMethod: record.matchMethod,
        hasScan: record._count.dailyLogs > 0,
      })),
    );
    const employeeById = new Map(
      records.map((record) => [record.employeeId, record.employee]),
    );
    return entries
      .map((entry) => {
        const employee = employeeById.get(entry.employeeId);
        const english = [
          employee?.firstName,
          employee?.middleName,
          employee?.lastName,
        ]
          .map((part) => part?.trim() ?? '')
          .filter((part) => part.length > 0)
          .join(' ');
        const chinese = employee?.chineseName?.trim();
        return {
          ...entry,
          name: chinese ? `${english} (${chinese})` : english,
          employeeCode: employee?.employeeId ?? null,
          departmentName: employee?.department?.name ?? null,
        };
      })
      .sort((a, b) => b.months - a.months || a.name.localeCompare(b.name));
  }

  /**
   * Creates or resets the monthly approval after a successful import confirm.
   * Also refreshes flaggedDays on each attendance record for the batch.
   */
  async createMonthlyApproval(
    importBatchId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    void userId;
    const batch = await this.prisma.attendanceImportBatch.findFirst({
      where: { id: importBatchId, companyId },
    });
    if (!batch) {
      throw new NotFoundException('Import batch not found');
    }

    await this.prisma.attendanceMonthlyApproval.upsert({
      where: { importBatchId },
      create: {
        id: randomUUID(),
        companyId,
        importBatchId,
        month: batch.month,
        year: batch.year,
        status: 'PENDING_REVIEW',
      },
      update: {
        status: 'PENDING_REVIEW',
        reviewedAt: null,
        reviewedBy: null,
        approvedAt: null,
        approvedBy: null,
        unlockedAt: null,
        unlockedBy: null,
        unlockReason: null,
        notificationsSentAt: null,
      },
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: { importBatchId, companyId },
      select: { id: true },
    });

    for (const record of records) {
      const flaggedCount = await this.prisma.attendanceDailyLog.count({
        where: {
          attendanceRecordId: record.id,
          flag: { not: AttendanceDayFlag.NONE },
        },
      });
      await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { flaggedDays: flaggedCount, resolvedDays: 0 },
      });
    }
  }

  /**
   * Returns the monthly approval for one company month/year.
   */
  async getMonthlyApproval(
    month: number,
    year: number,
    companyId: string,
  ): Promise<unknown> {
    return this.prisma.attendanceMonthlyApproval.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
      include: {
        importBatch: {
          select: {
            id: true,
            fileName: true,
            importedAt: true,
            totalRows: true,
            matchedRows: true,
            rejectedRows: true,
            importer: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        reviewer: {
          select: { id: true, firstName: true, lastName: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Lists monthly approvals for the company, newest first.
   */
  async listMonthlyApprovals(
    filters: ListAttendanceMonthlyApprovalsDto,
    companyId: string,
  ): Promise<unknown> {
    return this.prisma.attendanceMonthlyApproval.findMany({
      where: {
        companyId,
        ...(filters.year ? { year: filters.year } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        importBatch: {
          select: {
            fileName: true,
            importedAt: true,
            totalRows: true,
            matchedRows: true,
            _count: { select: { records: true } },
          },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Marks a pending month as reviewed by HR.
   */
  async markAsReviewed(
    monthlyApprovalId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const approval = await this.prisma.attendanceMonthlyApproval.findFirst({
      where: { id: monthlyApprovalId, companyId },
    });
    if (!approval) {
      throw new NotFoundException('Monthly approval not found');
    }
    if (approval.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'Only pending review attendance can be marked as reviewed',
      );
    }

    return this.prisma.attendanceMonthlyApproval.update({
      where: { id: monthlyApprovalId },
      data: {
        status: 'REVIEWED',
        reviewedAt: new Date(),
        reviewedBy: userId,
      },
    });
  }

  /**
   * Approves and locks a month, then notifies employees with unresolved flags.
   */
  async approveMonth(
    monthlyApprovalId: string,
    companyId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const approval = await this.prisma.attendanceMonthlyApproval.findFirst({
      where: { id: monthlyApprovalId, companyId },
      include: { importBatch: true },
    });
    if (!approval) {
      throw new NotFoundException('Monthly approval not found');
    }
    if (
      approval.status !== 'PENDING_REVIEW' &&
      approval.status !== 'REVIEWED'
    ) {
      throw new BadRequestException(
        'Only pending or reviewed attendance can be approved',
      );
    }

    const updated = await this.prisma.attendanceMonthlyApproval.update({
      where: { id: monthlyApprovalId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: userId,
      },
      include: { importBatch: true },
    });

    await this.sendAttendanceApprovalNotifications(updated, companyId, userId);

    return {
      message: `Attendance for ${approval.month}/${approval.year} approved and locked`,
    };
  }

  /**
   * Unlocks a previously approved month so HR can correct daily logs.
   */
  async unlockMonth(
    dto: UnlockAttendanceMonthDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    if (!dto.monthlyApprovalId) {
      throw new BadRequestException('monthlyApprovalId is required');
    }

    const approval = await this.prisma.attendanceMonthlyApproval.findFirst({
      where: { id: dto.monthlyApprovalId, companyId },
    });
    if (!approval) {
      throw new NotFoundException('Monthly approval not found');
    }
    if (approval.status !== 'APPROVED') {
      throw new BadRequestException(
        'Only approved attendance months can be unlocked',
      );
    }

    const unlocked = await this.prisma.attendanceMonthlyApproval.update({
      where: { id: dto.monthlyApprovalId },
      data: {
        status: 'UNLOCKED',
        unlockedAt: new Date(),
        unlockedBy: userId,
        unlockReason: dto.unlockReason,
        attendanceRecalcStale: false,
      } as Prisma.AttendanceMonthlyApprovalUpdateInput,
    });

    // Apply any site/WFH/leave approvals that could not run while locked.
    await this.recalculateCompanyAttendanceMonth(
      companyId,
      approval.month,
      approval.year,
    );
    await clearAttendanceMonthRecalcStale(
      this.prisma,
      companyId,
      approval.month,
      approval.year,
    );

    return unlocked;
  }

  /**
   * Applies an HR clock-in/out correction to a daily log while the month is open.
   */
  async correctDailyLog(
    dto: CorrectDailyLogDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    if (
      dto.correctedClockInLocal === undefined &&
      dto.correctedClockOutLocal === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one corrected clock-in or clock-out time',
      );
    }

    const dailyLog = await this.prisma.attendanceDailyLog.findFirst({
      where: { id: dto.dailyLogId },
      include: {
        record: {
          include: {
            importBatch: {
              include: { monthlyApproval: true },
            },
          },
        },
      },
    });

    if (!dailyLog || dailyLog.record.companyId !== companyId) {
      throw new NotFoundException('Daily log not found');
    }

    const approval = dailyLog.record.importBatch.monthlyApproval;
    if (!approval) {
      throw new BadRequestException(
        'No monthly approval found for this record',
      );
    }

    if (
      !['PENDING_REVIEW', 'REVIEWED', 'UNLOCKED'].includes(approval.status)
    ) {
      throw new BadRequestException(
        'Attendance is locked. Unlock the month before making corrections.',
      );
    }

    await this.prisma.attendanceDailyLogCorrection.create({
      data: {
        id: randomUUID(),
        dailyLogId: dto.dailyLogId,
        correctedBy: userId,
        originalClockInLocal: dailyLog.clockInLocal,
        originalClockOutLocal: dailyLog.clockOutLocal,
        correctedClockInLocal: dto.correctedClockInLocal ?? null,
        correctedClockOutLocal: dto.correctedClockOutLocal ?? null,
        correctionNote: dto.correctionNote,
      },
    });

    const updatedLog = await this.prisma.attendanceDailyLog.update({
      where: { id: dto.dailyLogId },
      data: {
        ...(dto.correctedClockInLocal !== undefined
          ? { correctedClockInLocal: dto.correctedClockInLocal }
          : {}),
        ...(dto.correctedClockOutLocal !== undefined
          ? { correctedClockOutLocal: dto.correctedClockOutLocal }
          : {}),
      },
    });

    await this.recalculateDailyLogFlag(updatedLog, {
      employeeId: dailyLog.record.employeeId,
      companyId: dailyLog.record.companyId,
    });

    const flaggedCount = await this.prisma.attendanceDailyLog.count({
      where: {
        attendanceRecordId: dailyLog.attendanceRecordId,
        flag: { not: AttendanceDayFlag.NONE },
      },
    });
    const resolvedCount = await this.prisma.attendanceDailyLog.count({
      where: {
        attendanceRecordId: dailyLog.attendanceRecordId,
        flag: { not: AttendanceDayFlag.NONE },
        flagResolved: true,
      },
    });
    await this.prisma.attendanceRecord.update({
      where: { id: dailyLog.attendanceRecordId },
      data: { flaggedDays: flaggedCount, resolvedDays: resolvedCount },
    });

    return updatedLog;
  }

  /**
   * SCAN_ONLY schedules: SCAN_AFTER_DEADLINE flags for a month (employee, date,
   * earliest scan) plus per-employee counts. Lateness here never affects pay.
   */
  async listScanReviews(
    dto: ListScanReviewsDto,
    companyId: string,
  ): Promise<{
    month: number;
    year: number;
    items: Array<{
      dailyLogId: string;
      employeeId: string;
      employeeName: string;
      employeeCode: string | null;
      departmentName: string | null;
      date: string;
      scanTime: string | null;
      needsReview: boolean;
      decision: AttendanceScanReviewDecision | null;
      note: string | null;
      reviewedBy: { id: string; name: string } | null;
      reviewedAt: Date | null;
    }>;
    employees: Array<{
      employeeId: string;
      employeeName: string;
      employeeCode: string | null;
      total: number;
      pending: number;
      excused: number;
      markedLate: number;
    }>;
  }> {
    const status = dto.status ?? 'ALL';
    const rows = await this.prisma.attendanceDailyLog.findMany({
      where: {
        scanReviewFlag: SCAN_AFTER_DEADLINE_FLAG,
        record: { companyId, month: dto.month, year: dto.year },
      },
      orderBy: [{ date: 'asc' }],
      include: {
        record: {
          select: {
            employeeId: true,
            employee: {
              select: {
                firstName: true,
                middleName: true,
                lastName: true,
                chineseName: true,
                employeeId: true,
                department: { select: { name: true } },
              },
            },
          },
        },
        scanReviewedBy: {
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

    const counts = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        employeeCode: string | null;
        total: number;
        pending: number;
        excused: number;
        markedLate: number;
      }
    >();
    for (const row of rows) {
      const employeeId = row.record.employeeId;
      const entry = counts.get(employeeId) ?? {
        employeeId,
        employeeName: formatUserDisplayName(row.record.employee),
        employeeCode: row.record.employee.employeeId,
        total: 0,
        pending: 0,
        excused: 0,
        markedLate: 0,
      };
      entry.total += 1;
      if (row.scanReviewDecision === AttendanceScanReviewDecision.EXCUSED) {
        entry.excused += 1;
      } else if (
        row.scanReviewDecision === AttendanceScanReviewDecision.MARKED_LATE
      ) {
        entry.markedLate += 1;
      } else {
        entry.pending += 1;
      }
      counts.set(employeeId, entry);
    }

    const items = rows
      .filter((row) => {
        if (status === 'PENDING') {
          return row.scanReviewDecision == null;
        }
        if (status === 'REVIEWED') {
          return row.scanReviewDecision != null;
        }
        return true;
      })
      .map((row) => ({
        dailyLogId: row.id,
        employeeId: row.record.employeeId,
        employeeName: formatUserDisplayName(row.record.employee),
        employeeCode: row.record.employee.employeeId,
        departmentName: row.record.employee.department?.name ?? null,
        date: dateToYyyyMmDd(row.date),
        scanTime: row.scanReviewTime,
        needsReview: row.needsReview,
        decision: row.scanReviewDecision,
        note: row.scanReviewNote,
        reviewedBy: row.scanReviewedBy
          ? {
              id: row.scanReviewedBy.id,
              name: formatUserDisplayName(row.scanReviewedBy),
            }
          : null,
        reviewedAt: row.scanReviewedAt,
      }));

    return {
      month: dto.month,
      year: dto.year,
      items,
      employees: [...counts.values()].sort(
        (a, b) => b.total - a.total || a.employeeName.localeCompare(b.employeeName),
      ),
    };
  }

  /**
   * HR decision on a SCAN_AFTER_DEADLINE flag (Excuse / Mark late + note).
   * Status and pay are unchanged either way, so locked months may be reviewed.
   */
  async reviewScanFlag(
    dailyLogId: string,
    dto: ReviewScanFlagDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const log = await this.prisma.attendanceDailyLog.findFirst({
      where: { id: dailyLogId, record: { companyId } },
      select: { id: true, scanReviewFlag: true },
    });
    if (!log) {
      throw new NotFoundException('Daily log not found');
    }
    if (log.scanReviewFlag !== SCAN_AFTER_DEADLINE_FLAG) {
      throw new BadRequestException(
        'This day has no scan-after-deadline flag to review',
      );
    }
    return this.prisma.attendanceDailyLog.update({
      where: { id: dailyLogId },
      data: {
        scanReviewDecision: dto.decision,
        scanReviewNote: dto.note?.trim() || null,
        scanReviewedById: userId,
        scanReviewedAt: new Date(),
        needsReview: false,
      },
      select: {
        id: true,
        scanReviewFlag: true,
        scanReviewTime: true,
        scanReviewDecision: true,
        scanReviewNote: true,
        scanReviewedById: true,
        scanReviewedAt: true,
        needsReview: true,
      },
    });
  }

  /**
   * Day-by-day breakdown for one employee in one month (HR review drawer).
   */
  async getEmployeeDailyLogs(
    employeeId: string,
    month: number,
    year: number,
    companyId: string,
  ): Promise<unknown> {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        companyId_employeeId_month_year: {
          companyId,
          employeeId,
          month,
          year,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            chineseName: true,
            employeeId: true,
          },
        },
        dailyLogs: {
          orderBy: { date: 'asc' },
          include: {
            corrections: {
              orderBy: { correctedAt: 'desc' },
              take: 1,
              include: {
                corrector: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
            fieldMovementEntries: {
              include: {
                log: {
                  select: {
                    id: true,
                    status: true,
                    requestNumber: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Attendance record not found');
    }

    return record;
  }

  /**
   * Recalculates the review flag after an HR correction using effective times.
   */
  private async recalculateDailyLogFlag(
    dailyLog: DailyLogFlagSource,
    record: { employeeId: string; companyId: string },
  ): Promise<void> {
    const effectiveClockIn =
      dailyLog.correctedClockInLocal ?? dailyLog.clockInLocal;
    const effectiveClockOut =
      dailyLog.correctedClockOutLocal ?? dailyLog.clockOutLocal;

    let scheduledEnd: string | null = '17:30';
    let scanOnly = false;
    try {
      const schedule = await this.workScheduleService.getActiveSchedule(
        record.employeeId,
        record.companyId,
        dailyLog.date,
      );
      const dayOfWeek = dailyLog.date.getUTCDay();
      const scheduleDay = toScheduleDayLikes(schedule).find(
        (row) => row.dayOfWeek === dayOfWeek,
      );
      scheduledEnd = scheduledEndForDay(scheduleDay);
      scanOnly = isScanOnlySchedule(scheduleDay);
    } catch {
      scheduledEnd = '17:30';
    }

    const flag = resolveAttendanceDayFlag({
      isHoliday: dailyLog.isHoliday,
      isWeekend: dailyLog.isWeekend,
      clockIn: effectiveClockIn,
      clockOut: effectiveClockOut,
      isLastExportDay: dailyLog.isLastExportDay,
      scheduledEnd,
      scanOnly,
      earlyDepartureGraceMinutes: await getPolicy(
        this.prisma,
        record.companyId,
        'earlyDepartureGraceMinutes',
        dailyLog.date,
      ),
    });

    await this.prisma.attendanceDailyLog.update({
      where: { id: dailyLog.id },
      data: {
        flag,
        missingClockIn:
          !scanOnly &&
          !dailyLog.isHoliday &&
          !dailyLog.isWeekend &&
          !effectiveClockIn &&
          Boolean(effectiveClockOut),
        missingClockOut:
          !scanOnly &&
          !dailyLog.isHoliday &&
          !dailyLog.isWeekend &&
          Boolean(effectiveClockIn) &&
          !effectiveClockOut &&
          !dailyLog.isLastExportDay,
      },
    });
  }

  private fallbackWeekdaySchedule(): ScheduleDayLike[] {
    return [
      {
        dayOfWeek: 0,
        isWorkingDay: false,
        isHalfDay: false,
        morningStart: null,
        morningEnd: null,
        afternoonEnd: null,
        totalHours: 0,
      },
      {
        dayOfWeek: 1,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        morningEnd: '12:30',
        afternoonEnd: '17:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 2,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        morningEnd: '12:30',
        afternoonEnd: '17:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 3,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        morningEnd: '12:30',
        afternoonEnd: '17:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 4,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        morningEnd: '12:30',
        afternoonEnd: '17:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 5,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        morningEnd: '12:30',
        afternoonEnd: '17:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 6,
        isWorkingDay: true,
        isHalfDay: true,
        morningStart: '08:30',
        morningEnd: '12:30',
        afternoonEnd: null,
        totalHours: 4,
      },
    ];
  }

  /**
   * Notifies each employee with unresolved flagged days after month approval.
   */
  private async sendAttendanceApprovalNotifications(
    approval: AttendanceMonthlyApproval & {
      importBatch: AttendanceImportBatch;
    },
    companyId: string,
    approvedBy: string,
  ): Promise<void> {
    void approvedBy;
    const monthName = MONTH_NAMES[approval.month - 1] ?? String(approval.month);

    const flaggedRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        importBatchId: approval.importBatchId,
        flaggedDays: { gt: 0 },
        employee: hrProcessEmployeeWhere(),
      },
      include: {
        employee: {
          select: { id: true, firstName: true },
        },
        dailyLogs: {
          where: { flag: { not: 'NONE' } },
          select: {
            id: true,
            date: true,
            flag: true,
            flagResolved: true,
          },
        },
      },
    });

    for (const record of flaggedRecords) {
      const unresolvedFlags = record.dailyLogs.filter((log) => !log.flagResolved);
      if (unresolvedFlags.length === 0) {
        continue;
      }

      const flagSummary = this.buildFlagSummary(unresolvedFlags);

      try {
        await this.notificationService.send(
          { companyId, userId: approvedBy },
          {
            recipientId: record.employee.id,
            eventType: ATTENDANCE_APPROVED_EVENT,
            channel: 'IN_APP',
            subject: `Your ${monthName} ${approval.year} attendance has been processed`,
            body: `Your attendance for ${monthName} ${approval.year} has been reviewed and approved by HR. You have ${unresolvedFlags.length} day(s) requiring explanation:\n\n${flagSummary}\n\nPlease submit a Field Movement / Early Departure log to explain these days.`,
            link: `/profile?tab=attendance&month=${approval.month}&year=${approval.year}`,
          },
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed attendance approval notification for ${record.employee.id}: ${message}`,
        );
      }
    }

    await this.prisma.attendanceMonthlyApproval.update({
      where: { id: approval.id },
      data: { notificationsSentAt: new Date() },
    });
  }

  /**
   * Formats unresolved daily-log flags into a bullet list for notifications.
   */
  private buildFlagSummary(
    flags: Array<{ date: Date; flag: string }>,
  ): string {
    return flags
      .map((flag) => {
        const dateStr = flag.date.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          weekday: 'short',
        });
        const flagLabel: Record<string, string> = {
          MISSING_CLOCK_IN: 'Missing clock-in',
          MISSING_CLOCK_OUT: 'Missing clock-out',
          EARLY_LEAVE: 'Early departure detected',
        };
        return `• ${dateStr}: ${flagLabel[flag.flag] ?? flag.flag}`;
      })
      .join('\n');
  }

  /**
   * First calendar day the employee counts as in the company for attendance
   * explanations: employmentDate when set, otherwise the earliest contract's
   * later of signedAt / startDate (must be on or after both).
   */
  private async resolveEmployeeCompanyStartDate(
    employeeId: string,
    companyId: string,
  ): Promise<Date | null> {
    const [employee, contracts] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: employeeId, companyId, deletedAt: null },
        select: { employmentDate: true },
      }),
      this.prisma.employeeContract.findMany({
        where: { companyId, employeeId, deletedAt: null },
        select: { startDate: true, signedAt: true },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    if (employee?.employmentDate) {
      return new Date(
        Date.UTC(
          employee.employmentDate.getUTCFullYear(),
          employee.employmentDate.getUTCMonth(),
          employee.employmentDate.getUTCDate(),
        ),
      );
    }

    if (contracts.length === 0) {
      return null;
    }

    let earliest: Date | null = null;
    for (const contract of contracts) {
      const signed = contract.signedAt.getTime();
      const start = contract.startDate.getTime();
      const join = new Date(Math.max(signed, start));
      if (!earliest || join.getTime() < earliest.getTime()) {
        earliest = join;
      }
    }
    return earliest;
  }

  /**
   * Returns unresolved flagged days for an employee month (form dropdown source).
   */
  async getFlaggedDaysForEmployee(
    employeeId: string,
    month: number,
    year: number,
    companyId: string,
  ): Promise<{
    flaggedDays: Array<{
      id: string;
      date: Date;
      flag: AttendanceDayFlag;
      clockInLocal: string | null;
      clockOutLocal: string | null;
      correctedClockInLocal: string | null;
      correctedClockOutLocal: string | null;
      isHalfDay: boolean;
      availableReasons: FieldMovementReason[];
      alreadySubmitted: boolean;
      submittedLog: {
        id: string;
        requestNumber: string;
        status: string;
        approvalRequestId: string | null;
        pendingTierLabel: string | null;
        pendingApproverName: string | null;
      } | null;
      /** Set when a pending leave / site assignment / WFH request covers the day. */
      coverMessage: string | null;
      issueType: FieldMovementIssueType | null;
      explanationStatus:
        | 'NOT_EXPLAINED'
        | 'DRAFT'
        | 'SUBMITTED'
        | 'APPROVED'
        | 'REJECTED'
        | 'RETURNED';
      draftEntries: Array<{
        dailyLogId: string;
        reason: FieldMovementReason;
        destination?: string | null;
        departureTime?: string | null;
        returnTime?: string | null;
        notes?: string | null;
      }>;
      draftLogId: string | null;
      /** Late-entry reason from the month draft log (same for all draft days). */
      lateReason: string | null;
      scheduledStartTime: string;
      scheduledEndTime: string;
      selectable: boolean;
    }>;
    month: number;
    year: number;
    draftLogId: string | null;
    draftLateReason: string | null;
  }> {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        companyId_employeeId_month_year: {
          companyId,
          employeeId,
          month,
          year,
        },
      },
    });

    if (!record) {
      return {
        flaggedDays: [],
        month,
        year,
        draftLogId: null,
        draftLateReason: null,
      };
    }

    const companyStartDate = await this.resolveEmployeeCompanyStartDate(
      employeeId,
      companyId,
    );

    const flaggedDays = await this.prisma.attendanceDailyLog.findMany({
      where: {
        attendanceRecordId: record.id,
        // Field-movement Explain days only - leave+scan is an HR review flag.
        flag: {
          notIn: [
            AttendanceDayFlag.NONE,
            AttendanceDayFlag.ON_LEAVE_BUT_SCANNED,
          ],
        },
        flagResolved: false,
        // Enrolment grace / covered statuses need no field-movement explanation.
        dayStatus: {
          notIn: [
            'ENROLMENT_GRACE',
            'ON_SITE',
            'WORK_FROM_HOME',
            'LEAVE',
          ],
        },
        // Not employed yet - ignore flags before signed / start date.
        ...(companyStartDate ? { date: { gte: companyStartDate } } : {}),
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        flag: true,
        clockInLocal: true,
        clockOutLocal: true,
        correctedClockInLocal: true,
        correctedClockOutLocal: true,
        isHalfDay: true,
        fieldMovementEntries: {
          include: {
            log: {
              select: {
                id: true,
                requestNumber: true,
                status: true,
                approvalRequestId: true,
                approvalRequest: {
                  select: {
                    id: true,
                    currentTier: true,
                    tiers: {
                      where: { decision: 'PENDING' },
                      orderBy: { tierOrder: 'asc' },
                      take: 1,
                      select: {
                        label: true,
                        approver: {
                          select: {
                            firstName: true,
                            lastName: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Days covered by approved leave, a site assignment or work from home need
    // no explanation - leave them out. Days with such a request still pending
    // stay in the list, locked, with the reason.
    const covers = await this.dayCoverage.findCovers(
      companyId,
      employeeId,
      flaggedDays.map((day) => ({ date: day.date })),
      ['LEAVE', 'SITE_ASSIGNMENT', 'WORK_FROM_HOME'],
    );
    const coverByDate = new Map(covers.map((cover) => [cover.date, cover]));
    const uncoveredDays = flaggedDays.filter(
      (day) => coverByDate.get(coverDateKey(day.date))?.state !== 'APPROVED',
    );

    const monthDraftLog = await this.prisma.fieldMovementLog.findFirst({
      where: {
        companyId,
        employeeId,
        month,
        year,
        status: FieldMovementStatus.DRAFT,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, lateReason: true },
    });
    const draftLogId = monthDraftLog?.id ?? null;
    const draftLateReason = monthDraftLog?.lateReason?.trim() || null;

    const flaggedDaysWithOptions = uncoveredDays.map((day) => {
      const issueType = deriveIssueType({
        flag: day.flag,
        clockInLocal: day.clockInLocal,
        clockOutLocal: day.clockOutLocal,
        correctedClockInLocal: day.correctedClockInLocal,
        correctedClockOutLocal: day.correctedClockOutLocal,
      });
      const availableReasons = this.storageReasonsForIssue(issueType);

      const statusRank: Record<string, number> = {
        APPROVED: 6,
        IN_REVIEW: 5,
        SUBMITTED: 5,
        RETURNED: 4,
        DRAFT: 3,
        REJECTED: 2,
        CANCELLED: 1,
      };
      const ranked = [...day.fieldMovementEntries].sort(
        (a, b) =>
          (statusRank[b.log.status] ?? 0) - (statusRank[a.log.status] ?? 0),
      );
      const primaryEntry = ranked[0] ?? null;
      const primaryLog = primaryEntry?.log ?? null;

      let explanationStatus:
        | 'NOT_EXPLAINED'
        | 'DRAFT'
        | 'SUBMITTED'
        | 'APPROVED'
        | 'REJECTED'
        | 'RETURNED' = 'NOT_EXPLAINED';
      if (primaryLog?.status === FieldMovementStatus.APPROVED) {
        explanationStatus = 'APPROVED';
      } else if (
        primaryLog?.status === FieldMovementStatus.SUBMITTED ||
        primaryLog?.status === FieldMovementStatus.IN_REVIEW
      ) {
        explanationStatus = 'SUBMITTED';
      } else if (primaryLog?.status === FieldMovementStatus.RETURNED) {
        explanationStatus = 'RETURNED';
      } else if (primaryLog?.status === FieldMovementStatus.DRAFT) {
        explanationStatus = 'DRAFT';
      } else if (primaryLog?.status === FieldMovementStatus.REJECTED) {
        explanationStatus = 'REJECTED';
      }

      const draftEntries = day.fieldMovementEntries
        .filter((entry) => entry.log.status === FieldMovementStatus.DRAFT)
        .map((entry) => ({
          dailyLogId: entry.dailyLogId,
          reason: entry.reason,
          destination: entry.destination,
          departureTime: entry.departureTime,
          returnTime: entry.returnTime,
          notes: entry.notes,
        }));

      const pendingTier = primaryLog?.approvalRequest?.tiers[0];
      const pendingApprover = pendingTier?.approver
        ? `${pendingTier.approver.firstName} ${pendingTier.approver.lastName}`.trim()
        : null;

      const pendingCover = coverByDate.get(coverDateKey(day.date));
      const coverMessage = pendingCover ? dayCoverMessage(pendingCover) : null;

      const lockedByPipeline =
        explanationStatus === 'SUBMITTED' ||
        explanationStatus === 'APPROVED' ||
        explanationStatus === 'RETURNED';
      const selectable = coverMessage === null && !lockedByPipeline;

      // Legacy flag: anything not free for a brand-new explanation without overwrite.
      const alreadySubmitted = !selectable;

      const { start, end } = this.defaultScheduleTimes(day.date, day.isHalfDay);

      return {
        ...day,
        availableReasons,
        alreadySubmitted,
        coverMessage,
        issueType,
        explanationStatus,
        draftEntries,
        draftLogId:
          explanationStatus === 'DRAFT'
            ? (primaryLog?.id ?? draftLogId)
            : draftLogId,
        lateReason:
          explanationStatus === 'DRAFT' ? draftLateReason : null,
        scheduledStartTime: start,
        scheduledEndTime: end,
        selectable,
        submittedLog: primaryLog
          ? {
              id: primaryLog.id,
              requestNumber: primaryLog.requestNumber,
              status: primaryLog.status,
              approvalRequestId: primaryLog.approvalRequestId,
              pendingTierLabel: pendingTier?.label ?? null,
              pendingApproverName: pendingApprover,
            }
          : null,
      };
    });

    return {
      flaggedDays: flaggedDaysWithOptions,
      month,
      year,
      draftLogId,
      draftLateReason,
    };
  }

  private storageReasonsForIssue(
    issueType: FieldMovementIssueType | null,
  ): FieldMovementReason[] {
    if (!issueType) {
      return [];
    }
    const reasons: FieldMovementReason[] = [];
    for (const reason of compatibleReasonsForIssue(issueType)) {
      for (const storage of this.expandCompatibleReason(reason)) {
        if (!reasons.includes(storage)) {
          reasons.push(storage);
        }
      }
    }
    return reasons;
  }

  private expandCompatibleReason(
    reason: CompatibleIssueReason,
  ): FieldMovementReason[] {
    switch (reason) {
      case 'FIELD_VISIT':
        return [FieldMovementReason.FIELD_VISIT];
      case 'EARLY_LEAVE':
        return [FieldMovementReason.EARLY_LEAVE];
      case 'FORGOT_CLOCK_IN':
        return [FieldMovementReason.FORGOT_CLOCK_IN];
      case 'FORGOT_CLOCK_OUT':
        return [FieldMovementReason.FORGOT_CLOCK_OUT];
      case 'FORGOT_BOTH':
        return [
          FieldMovementReason.FORGOT_CLOCK_IN,
          FieldMovementReason.FORGOT_CLOCK_OUT,
        ];
      default:
        return [];
    }
  }

  private defaultScheduleTimes(
    date: Date,
    isHalfDay: boolean,
  ): { start: string; end: string } {
    const start = '08:00';
    if (isHalfDay || date.getUTCDay() === 6) {
      return { start, end: '12:30' };
    }
    return { start, end: '17:30' };
  }

  /**
   * Creates a draft field movement / early departure log for the actor or
   * an on-behalf employee (HR / lead with on-behalf permission).
   */
  async createFieldMovementLog(
    dto: CreateFieldMovementLogDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    // Self-submissions skip the on-behalf checks; approver-only accounts have
    // no attendance of their own to explain either way.
    await this.onBehalfService.assertTakesPartInHrProcesses(employeeId, companyId);

    const dailyLogIds = dto.entries.map((entry) => entry.dailyLogId);
    const entriesByDailyLog = new Map<string, typeof dto.entries>();
    for (const entry of dto.entries) {
      const list = entriesByDailyLog.get(entry.dailyLogId) ?? [];
      list.push(entry);
      entriesByDailyLog.set(entry.dailyLogId, list);
    }
    for (const [dailyLogId, list] of entriesByDailyLog.entries()) {
      if (list.length === 1) {
        continue;
      }
      if (list.length > 2) {
        throw new BadRequestException(
          'At most two explanations are allowed for the same day',
        );
      }
      const reasons = new Set(list.map((e) => e.reason));
      const complementaryForgot =
        reasons.has(FieldMovementReason.FORGOT_CLOCK_IN) &&
        reasons.has(FieldMovementReason.FORGOT_CLOCK_OUT);
      if (!complementaryForgot || reasons.size !== 2) {
        throw new BadRequestException(
          `Duplicate entries for daily log ${dailyLogId} are only allowed as FORGOT_CLOCK_IN + FORGOT_CLOCK_OUT`,
        );
      }
    }
    const uniqueIds = [...entriesByDailyLog.keys()];

    const dailyLogs = await this.prisma.attendanceDailyLog.findMany({
      where: { id: { in: dailyLogIds } },
      include: {
        record: {
          select: {
            employeeId: true,
            companyId: true,
            month: true,
            year: true,
          },
        },
      },
    });

    // Compare with distinct days: "forgot both" sends two entries for one day.
    if (dailyLogs.length !== uniqueIds.length) {
      throw new BadRequestException('One or more daily logs were not found');
    }

    for (const log of dailyLogs) {
      if (log.record.companyId !== companyId) {
        throw new ForbiddenException('Daily log does not belong to this company');
      }
      if (log.record.employeeId !== employeeId) {
        throw new ForbiddenException(
          'Daily logs must belong to the target employee',
        );
      }
      if (log.dayStatus === 'ENROLMENT_GRACE') {
        throw new BadRequestException(
          `Day ${log.date.toISOString().split('T')[0]} is within enrolment grace - no explanation needed`,
        );
      }
      if (log.flag === 'NONE') {
        throw new BadRequestException(
          `Day ${log.date.toISOString().split('T')[0]} has no flag - no explanation needed`,
        );
      }
    }

    const companyStartDate = await this.resolveEmployeeCompanyStartDate(
      employeeId,
      companyId,
    );
    if (companyStartDate) {
      const startMs = companyStartDate.getTime();
      for (const log of dailyLogs) {
        if (log.date.getTime() < startMs) {
          throw new BadRequestException(
            `Day ${log.date.toISOString().split('T')[0]} is before the employee's signed/start date - no explanation needed`,
          );
        }
      }
    }

    // "Forgot both" (FORGOT_CLOCK_IN + FORGOT_CLOCK_OUT on one day): only when
    // neither scan exists, with a stated clock-in before the stated clock-out.
    for (const [dailyLogId, list] of entriesByDailyLog.entries()) {
      if (list.length !== 2) {
        continue;
      }
      const log = dailyLogs.find((row) => row.id === dailyLogId);
      const dateLabel = log ? log.date.toISOString().split('T')[0] : dailyLogId;
      const clockIn = list.find((e) => e.reason === FieldMovementReason.FORGOT_CLOCK_IN);
      const clockOut = list.find((e) => e.reason === FieldMovementReason.FORGOT_CLOCK_OUT);
      if (
        log &&
        ((log.correctedClockInLocal ?? log.clockInLocal) ||
          (log.correctedClockOutLocal ?? log.clockOutLocal))
      ) {
        throw new BadRequestException(
          `"Forgot both" is only for days with neither scan - ${dateLabel} already has a recorded scan`,
        );
      }
      if (!clockIn?.returnTime) {
        throw new BadRequestException(
          `Stated clock-in time is required for "forgot both" on ${dateLabel}`,
        );
      }
      if (clockOut?.departureTime && clockIn.returnTime >= clockOut.departureTime) {
        throw new BadRequestException(
          `Stated clock-in must be before the stated clock-out on ${dateLabel}`,
        );
      }
    }

    // Not for days covered by leave, a site assignment or work from home
    // (approved or requested).
    await this.dayCoverage.assertUncovered(
      companyId,
      employeeId,
      dailyLogs.map((log) => ({ date: log.date })),
      ['LEAVE', 'SITE_ASSIGNMENT', 'WORK_FROM_HOME'],
    );

    const backdating = await this.backdatingPolicy.validateSubmissionDates({
      companyId,
      actorUserId: userId,
      targetEmployeeId: employeeId,
      dates: dailyLogs.map((log) => log.date),
      lateReason: dto.lateReason,
    });

    const existingBlockingEntries = await this.prisma.fieldMovementEntry.findMany({
      where: {
        dailyLogId: { in: dailyLogIds },
        log: {
          status: {
            in: [
              FieldMovementStatus.DRAFT,
              FieldMovementStatus.SUBMITTED,
              FieldMovementStatus.IN_REVIEW,
              FieldMovementStatus.RETURNED,
              FieldMovementStatus.APPROVED,
            ],
          },
          deletedAt: null,
        },
      },
      include: {
        log: { select: { requestNumber: true, status: true } },
        dailyLog: { select: { date: true } },
      },
    });
    if (existingBlockingEntries.length > 0) {
      const sample = existingBlockingEntries[0]!;
      const dateLabel = sample.dailyLog.date.toISOString().split('T')[0];
      throw new BadRequestException(
        `Day ${dateLabel} is already covered by ${sample.log.requestNumber} (${sample.log.status}). Wait for that request to finish, or cancel/reject it before submitting again.`,
      );
    }

    // Field matrix validation (same rules as the frontend form).
    // Parent log notes satisfy reasonNote when an entry omits its own notes.
    const parentNotes = dto.notes?.trim() || null;
    const entryNotes = (
      notes: string | null | undefined,
    ): string | null => notes?.trim() || parentNotes;

    const validatedPairKeys = new Set<string>();
    for (const entry of dto.entries) {
      const dailyLog = dailyLogs.find((log) => log.id === entry.dailyLogId);
      const dateLabel = dailyLog
        ? dailyLog.date.toISOString().split('T')[0]
        : entry.dailyLogId;
      const siblings = entriesByDailyLog.get(entry.dailyLogId) ?? [entry];
      const pairedForgot =
        siblings.length === 2
          ? siblings.find((sibling) => sibling !== entry) ?? null
          : null;
      const pairKey = `${entry.dailyLogId}:forgot-both`;
      if (
        pairedForgot &&
        ((entry.reason === FieldMovementReason.FORGOT_CLOCK_IN &&
          pairedForgot.reason === FieldMovementReason.FORGOT_CLOCK_OUT) ||
          (entry.reason === FieldMovementReason.FORGOT_CLOCK_OUT &&
            pairedForgot.reason === FieldMovementReason.FORGOT_CLOCK_IN))
      ) {
        if (validatedPairKeys.has(pairKey)) {
          continue;
        }
        validatedPairKeys.add(pairKey);
        const issues = validateStorageEntry(
          {
            reason: entry.reason,
            destination: entry.destination,
            departureTime: entry.departureTime,
            returnTime: entry.returnTime,
            notes: entryNotes(entry.notes),
          },
          {
            dateLabel,
            pairedForgot: {
              reason: pairedForgot.reason,
              destination: pairedForgot.destination,
              departureTime: pairedForgot.departureTime,
              returnTime: pairedForgot.returnTime,
              notes: entryNotes(pairedForgot.notes),
            },
          },
        );
        if (issues.length > 0) {
          throw new BadRequestException(
            formatValidationMessage(issues, dateLabel),
          );
        }
        continue;
      }

      const issues = validateStorageEntry(
        {
          reason: entry.reason,
          destination: entry.destination,
          departureTime: entry.departureTime,
          returnTime: entry.returnTime,
          notes: entryNotes(entry.notes),
        },
        { dateLabel },
      );
      if (issues.length > 0) {
        throw new BadRequestException(
          formatValidationMessage(issues, dateLabel),
        );
      }
    }

    const firstLog = dailyLogs[0];
    if (!firstLog) {
      throw new BadRequestException('At least one entry is required');
    }
    const month = firstLog.record.month;
    const year = firstLog.record.year;

    const samePeriod = dailyLogs.every(
      (log) =>
        log.record.month === month && log.record.year === year,
    );
    if (!samePeriod) {
      throw new BadRequestException(
        'All entries must belong to the same attendance month',
      );
    }

    const requestNumber = await this.nextFieldMovementNumber();

    const created = await this.prisma.fieldMovementLog.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId,
        month,
        year,
        status: FieldMovementStatus.DRAFT,
        notes: dto.notes ?? null,
        isLateSubmission: backdating.isLateSubmission,
        lateReason: backdating.lateReason,
        createdBy: userId,
        updatedBy: userId,
        entries: {
          create: dto.entries.map((entry) => {
            const dailyLog = dailyLogs.find((log) => log.id === entry.dailyLogId);
            if (!dailyLog) {
              throw new BadRequestException('Daily log not found for entry');
            }
            const sanitized = sanitizeStorageEntry({
              reason: entry.reason,
              destination: entry.destination,
              departureTime: entry.departureTime,
              returnTime: entry.returnTime,
              notes: entry.notes?.trim() || parentNotes,
            });
            return {
              id: randomUUID(),
              dailyLogId: entry.dailyLogId,
              date: dailyLog.date,
              reason: entry.reason,
              destination: sanitized.destination,
              departureTime: sanitized.departureTime,
              returnTime: sanitized.returnTime,
              notes: sanitized.notes,
            };
          }),
        },
      },
      include: {
        entries: {
          include: { dailyLog: { select: { date: true, flag: true } } },
        },
      },
    });

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'FIELD_MOVEMENT_LOG',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: created.id,
      recordReference: requestNumber,
      // Field movement filed on behalf goes through the employee's normal chain;
      // the creator never approves it (see approvals: on-behalf creator block).
      autoApproveTier: false,
    });

    return created;
  }

  /**
   * Upserts entries into the employee's month DRAFT field-movement log.
   * Only the given days are replaced; other draft days stay untouched.
   */
  async upsertFieldMovementDraftEntries(
    dto: UpsertFieldMovementDraftEntriesDto,
    companyId: string,
    userId: string,
  ): Promise<{ draftLogId: string; entryCount: number }> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    await this.onBehalfService.assertTakesPartInHrProcesses(employeeId, companyId);

    const dailyLogIds = [...new Set(dto.entries.map((entry) => entry.dailyLogId))];
    const entriesByDailyLog = new Map<string, typeof dto.entries>();
    for (const entry of dto.entries) {
      const list = entriesByDailyLog.get(entry.dailyLogId) ?? [];
      list.push(entry);
      entriesByDailyLog.set(entry.dailyLogId, list);
    }
    for (const [dailyLogId, list] of entriesByDailyLog.entries()) {
      if (list.length === 1) {
        continue;
      }
      if (list.length > 2) {
        throw new BadRequestException(
          'At most two explanations are allowed for the same day',
        );
      }
      const reasons = new Set(list.map((e) => e.reason));
      const complementaryForgot =
        reasons.has(FieldMovementReason.FORGOT_CLOCK_IN) &&
        reasons.has(FieldMovementReason.FORGOT_CLOCK_OUT);
      if (!complementaryForgot || reasons.size !== 2) {
        throw new BadRequestException(
          `Duplicate entries for daily log ${dailyLogId} are only allowed as FORGOT_CLOCK_IN + FORGOT_CLOCK_OUT`,
        );
      }
    }

    const dailyLogs = await this.prisma.attendanceDailyLog.findMany({
      where: { id: { in: dailyLogIds } },
      include: {
        record: {
          select: {
            employeeId: true,
            companyId: true,
            month: true,
            year: true,
          },
        },
      },
    });
    if (dailyLogs.length !== dailyLogIds.length) {
      throw new BadRequestException('One or more daily logs were not found');
    }
    for (const log of dailyLogs) {
      if (log.record.companyId !== companyId) {
        throw new ForbiddenException('Daily log does not belong to this company');
      }
      if (log.record.employeeId !== employeeId) {
        throw new ForbiddenException(
          'Daily logs must belong to the target employee',
        );
      }
      if (log.record.month !== dto.month || log.record.year !== dto.year) {
        throw new BadRequestException(
          'All entries must belong to the requested attendance month',
        );
      }
      if (log.dayStatus === 'ENROLMENT_GRACE') {
        throw new BadRequestException(
          `Day ${log.date.toISOString().split('T')[0]} is within enrolment grace - no explanation needed`,
        );
      }
      if (log.flag === 'NONE') {
        throw new BadRequestException(
          `Day ${log.date.toISOString().split('T')[0]} has no flag - no explanation needed`,
        );
      }
    }

    await this.dayCoverage.assertUncovered(
      companyId,
      employeeId,
      dailyLogs.map((log) => ({ date: log.date })),
      ['LEAVE', 'SITE_ASSIGNMENT', 'WORK_FROM_HOME'],
    );

    const backdating = await this.backdatingPolicy.validateSubmissionDates({
      companyId,
      actorUserId: userId,
      targetEmployeeId: employeeId,
      dates: dailyLogs.map((log) => log.date),
      lateReason: dto.lateReason,
    });

    const pipelineBlocking = await this.prisma.fieldMovementEntry.findMany({
      where: {
        dailyLogId: { in: dailyLogIds },
        log: {
          status: {
            in: [
              FieldMovementStatus.SUBMITTED,
              FieldMovementStatus.IN_REVIEW,
              FieldMovementStatus.RETURNED,
              FieldMovementStatus.APPROVED,
            ],
          },
          deletedAt: null,
        },
      },
      include: {
        log: { select: { requestNumber: true, status: true } },
        dailyLog: { select: { date: true } },
      },
    });
    if (pipelineBlocking.length > 0) {
      const sample = pipelineBlocking[0]!;
      const dateLabel = sample.dailyLog.date.toISOString().split('T')[0];
      throw new BadRequestException(
        `Day ${dateLabel} is already covered by ${sample.log.requestNumber} (${sample.log.status}). Wait for that request to finish, or cancel/reject it before submitting again.`,
      );
    }

    const parentNotes = dto.notes?.trim() || null;
    const entryNotes = (
      notes: string | null | undefined,
    ): string | null => notes?.trim() || parentNotes;
    const validatedPairKeys = new Set<string>();
    for (const entry of dto.entries) {
      const dailyLog = dailyLogs.find((log) => log.id === entry.dailyLogId);
      const dateLabel = dailyLog
        ? dailyLog.date.toISOString().split('T')[0]
        : entry.dailyLogId;
      const siblings = entriesByDailyLog.get(entry.dailyLogId) ?? [entry];
      const pairedForgot =
        siblings.length === 2
          ? siblings.find((sibling) => sibling !== entry) ?? null
          : null;
      const pairKey = `${entry.dailyLogId}:forgot-both`;
      if (
        pairedForgot &&
        ((entry.reason === FieldMovementReason.FORGOT_CLOCK_IN &&
          pairedForgot.reason === FieldMovementReason.FORGOT_CLOCK_OUT) ||
          (entry.reason === FieldMovementReason.FORGOT_CLOCK_OUT &&
            pairedForgot.reason === FieldMovementReason.FORGOT_CLOCK_IN))
      ) {
        if (validatedPairKeys.has(pairKey)) {
          continue;
        }
        validatedPairKeys.add(pairKey);
        const issues = validateStorageEntry(
          {
            reason: entry.reason,
            destination: entry.destination,
            departureTime: entry.departureTime,
            returnTime: entry.returnTime,
            notes: entryNotes(entry.notes),
          },
          {
            dateLabel,
            pairedForgot: {
              reason: pairedForgot.reason,
              destination: pairedForgot.destination,
              departureTime: pairedForgot.departureTime,
              returnTime: pairedForgot.returnTime,
              notes: entryNotes(pairedForgot.notes),
            },
          },
        );
        if (issues.length > 0) {
          throw new BadRequestException(
            formatValidationMessage(issues, dateLabel),
          );
        }
        continue;
      }
      const issues = validateStorageEntry(
        {
          reason: entry.reason,
          destination: entry.destination,
          departureTime: entry.departureTime,
          returnTime: entry.returnTime,
          notes: entryNotes(entry.notes),
        },
        { dateLabel },
      );
      if (issues.length > 0) {
        throw new BadRequestException(
          formatValidationMessage(issues, dateLabel),
        );
      }
    }

    let draftLog = await this.prisma.fieldMovementLog.findFirst({
      where: {
        companyId,
        employeeId,
        month: dto.month,
        year: dto.year,
        status: FieldMovementStatus.DRAFT,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!draftLog) {
      const requestNumber = await this.nextFieldMovementNumber();
      draftLog = await this.prisma.fieldMovementLog.create({
        data: {
          id: randomUUID(),
          companyId,
          requestNumber,
          employeeId,
          month: dto.month,
          year: dto.year,
          status: FieldMovementStatus.DRAFT,
          notes: parentNotes,
          isLateSubmission: backdating.isLateSubmission,
          lateReason: backdating.lateReason,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      if (dto.onBehalfOfEmployeeId) {
        await this.onBehalfService.recordOnBehalfCreate({
          moduleCode: 'FIELD_MOVEMENT_LOG',
          companyId,
          actorUserId: userId,
          employeeId,
          recordId: draftLog.id,
          recordReference: requestNumber,
          autoApproveTier: false,
        });
      }
    } else {
      await this.prisma.fieldMovementLog.update({
        where: { id: draftLog.id },
        data: {
          notes: parentNotes ?? draftLog.notes,
          isLateSubmission: backdating.isLateSubmission,
          lateReason: backdating.lateReason ?? draftLog.lateReason,
          updatedBy: userId,
        },
      });
    }

    // Drop prior draft rows for these days (this log and any other orphan drafts).
    await this.prisma.fieldMovementEntry.deleteMany({
      where: {
        dailyLogId: { in: dailyLogIds },
        log: {
          companyId,
          employeeId,
          status: FieldMovementStatus.DRAFT,
          deletedAt: null,
        },
      },
    });

    await this.prisma.fieldMovementEntry.createMany({
      data: dto.entries.map((entry) => {
        const dailyLog = dailyLogs.find((log) => log.id === entry.dailyLogId);
        if (!dailyLog) {
          throw new BadRequestException('Daily log not found for entry');
        }
        const sanitized = sanitizeStorageEntry({
          reason: entry.reason,
          destination: entry.destination,
          departureTime: entry.departureTime,
          returnTime: entry.returnTime,
          notes: entryNotes(entry.notes),
        });
        return {
          id: randomUUID(),
          logId: draftLog!.id,
          dailyLogId: entry.dailyLogId,
          date: dailyLog.date,
          reason: entry.reason,
          status: FieldMovementStatus.DRAFT,
          destination: sanitized.destination,
          departureTime: sanitized.departureTime,
          returnTime: sanitized.returnTime,
          notes: sanitized.notes,
        };
      }),
    });

    const entryCount = await this.prisma.fieldMovementEntry.count({
      where: { logId: draftLog.id },
    });

    return { draftLogId: draftLog.id, entryCount };
  }

  /**
   * Removes one day's entries from the month DRAFT log.
   */
  async removeFieldMovementDraftDay(
    dto: RemoveFieldMovementDraftDayDto,
    companyId: string,
    userId: string,
  ): Promise<{ draftLogId: string | null; entryCount: number }> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    await this.onBehalfService.assertTakesPartInHrProcesses(employeeId, companyId);

    const draftLog = await this.prisma.fieldMovementLog.findFirst({
      where: {
        companyId,
        employeeId,
        month: dto.month,
        year: dto.year,
        status: FieldMovementStatus.DRAFT,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!draftLog) {
      return { draftLogId: null, entryCount: 0 };
    }
    if (draftLog.employeeId !== employeeId && draftLog.createdBy !== userId) {
      throw new ForbiddenException('Cannot modify this draft log');
    }

    await this.prisma.fieldMovementEntry.deleteMany({
      where: {
        logId: draftLog.id,
        dailyLogId: dto.dailyLogId,
      },
    });

    const entryCount = await this.prisma.fieldMovementEntry.count({
      where: { logId: draftLog.id },
    });

    await this.prisma.fieldMovementLog.update({
      where: { id: draftLog.id },
      data: { updatedBy: userId },
    });

    return { draftLogId: draftLog.id, entryCount };
  }

  /**
   * Submits a draft/returned field movement log into the approval workflow.
   */
  async submitFieldMovementLog(
    logId: string,
    companyId: string,
    userId: string,
    submitDto?: { lateReason?: string },
  ): Promise<unknown> {
    const log = await this.prisma.fieldMovementLog.findFirst({
      where: { id: logId, companyId, deletedAt: null },
      include: { entries: true },
    });

    if (!log) {
      throw new NotFoundException('Field movement log not found');
    }
    const canSubmit =
      log.employeeId === userId || log.createdBy === userId;
    if (!canSubmit) {
      throw new ForbiddenException(
        'Only the employee or the creator can submit this log',
      );
    }
    if (
      log.status !== FieldMovementStatus.DRAFT &&
      log.status !== FieldMovementStatus.RETURNED
    ) {
      throw new BadRequestException(
        'Only draft or returned logs can be submitted',
      );
    }
    if (log.entries.length === 0) {
      throw new BadRequestException('Add at least one entry before submitting');
    }

    const entryDates = log.entries.map((entry) => entry.date);
    const backdating = await this.backdatingPolicy.validateSubmissionDates({
      companyId,
      actorUserId: userId,
      targetEmployeeId: log.employeeId,
      dates: entryDates,
      lateReason: submitDto?.lateReason ?? log.lateReason,
    });

    const resolvedTiers =
      await this.hrApprovalChain.buildFieldMovementApprovalChain(
        log.employeeId,
        companyId,
      );

    if (resolvedTiers.length === 0) {
      const fullLog = await this.prisma.fieldMovementLog.findFirst({
        where: { id: logId, companyId, deletedAt: null },
        include: {
          entries: {
            include: { dailyLog: true },
          },
        },
      });
      if (!fullLog) {
        throw new NotFoundException('Field movement log not found');
      }
      await this.applyFieldMovementCorrections(fullLog, new Date());
      return this.getFieldMovementLog(logId, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'FIELD_MOVEMENT_LOG',
        title: `Field Movement Log ${log.requestNumber}`,
        formData: {
          month: log.month,
          year: log.year,
          entryCount: log.entries.length,
          employeeId: log.employeeId,
        },
      },
      companyId,
      userId,
      {
        resolvedTiers: {
          ruleName: 'Field movement chain',
          tiers: resolvedTiers,
        },
        lateSubmission: {
          isLateSubmission: backdating.isLateSubmission,
          lateReason: backdating.lateReason,
        },
      },
    )) as { id: string };

    await this.prisma.$transaction(async (tx) => {
      await tx.fieldMovementLog.update({
        where: { id: logId },
        data: {
          status: FieldMovementStatus.SUBMITTED,
          approvalRequestId: approval.id,
          isLateSubmission: backdating.isLateSubmission,
          lateReason: backdating.lateReason,
          submittedAt: new Date(),
          updatedBy: userId,
        },
      });
      await tx.fieldMovementEntry.updateMany({
        where: { logId },
        data: { status: FieldMovementStatus.SUBMITTED },
      });
    });

    return this.getFieldMovementLog(logId, companyId, userId);
  }

  /**
   * Returns one field movement log with entries and approval tiers.
   */
  async getFieldMovementLog(
    logId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const log = await this.prisma.fieldMovementLog.findFirst({
      where: { id: logId, companyId, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            chineseName: true,
            employeeId: true,
          },
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            chineseName: true,
          },
        },
        entries: {
          include: {
            dailyLog: {
              select: {
                date: true,
                flag: true,
                flagResolved: true,
                clockInLocal: true,
                clockOutLocal: true,
                correctedClockInLocal: true,
                correctedClockOutLocal: true,
                isEarlyLeave: true,
                earlyLeaveMinutes: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        },
        approvalRequest: {
          include: {
            tiers: {
              include: {
                approver: {
                  select: {
                    id: true,
                    firstName: true,
                    middleName: true,
                    lastName: true,
                    chineseName: true,
                  },
                },
              },
              orderBy: { tierOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!log) {
      throw new NotFoundException('Field movement log not found');
    }

    const isHr = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    const isOwner = log.employeeId === userId;
    const isCreator = log.createdBy === userId;
    const isApprover =
      // Cancelled requests are hidden from the approval chain.
      log.status !== 'CANCELLED' &&
      (log.approvalRequest?.tiers?.some((tier) => tier.approverId === userId) ??
      false);

    if (
      !isHr &&
      !isOwner &&
      !isCreator &&
      !isApprover &&
      !(await canViewThroughTeam(this.prisma, userId, companyId, log))
    ) {
      throw new ForbiddenException('You do not have access to this log');
    }

    return { ...log, submittedOnBehalf: log.createdBy !== log.employeeId };
  }

  /**
   * Flagged days for an employee (HR only for cross-employee lookup).
   */
  async getFlaggedDaysOnBehalf(
    actorUserId: string,
    employeeId: string,
    month: number,
    year: number,
    companyId: string,
  ): Promise<unknown> {
    if (employeeId !== actorUserId) {
      const isHr = await this.permissionService.hasPermission(
        actorUserId,
        companyId,
        'hr',
        'view',
      );
      if (!isHr) {
        throw new ForbiddenException(
          'You do not have access to this employee\'s attendance',
        );
      }
    }
    await this.onBehalfService.assertTakesPartInHrProcesses(employeeId, companyId);

    const [flags, record] = await Promise.all([
      this.getFlaggedDaysForEmployee(employeeId, month, year, companyId),
      this.prisma.attendanceRecord.findUnique({
        where: {
          companyId_employeeId_month_year: { companyId, employeeId, month, year },
        },
        select: { id: true },
      }),
    ]);
    return { ...flags, hasRecord: record !== null };
  }

  /**
   * Lists field movement logs (own for employees; company-wide for HR).
   */
  async listFieldMovementLogs(
    filters: ListFieldMovementLogsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const isHr = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    // Supervisors also see their team's logs (not drafts or cancelled ones).
    const teamScope = isHr
      ? null
      : teamScopeWhere(
          userId,
          await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId),
          filters.employeeId,
        );

    const where: Prisma.FieldMovementLogWhereInput = {
      companyId,
      deletedAt: null,
      ...(teamScope ? { AND: [teamScope] } : {}),
      ...(isHr && filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.month ? { month: filters.month } : {}),
      ...(filters.year ? { year: filters.year } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.fieldMovementLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              chineseName: true,
              employeeId: true,
            },
          },
          _count: { select: { entries: true } },
          approvalRequest: {
            select: {
              id: true,
              status: true,
              currentTier: true,
              tiers: {
                where: { decision: 'PENDING' },
                take: 1,
                select: { label: true },
              },
            },
          },
        },
      }),
      this.prisma.fieldMovementLog.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => ({
        ...row,
        entryCount: row._count.entries,
        currentTierLabel: row.approvalRequest?.tiers[0]?.label ?? null,
      })),
      total,
      page,
      limit,
    );
  }

  /**
   * Cancels a draft or submitted field movement log owned by the caller.
   */
  async cancelFieldMovementLog(
    logId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const log = await this.prisma.fieldMovementLog.findFirst({
      where: { id: logId, companyId, deletedAt: null },
    });

    if (!log) {
      throw new NotFoundException('Field movement log not found');
    }
    if (log.employeeId !== userId) {
      throw new ForbiddenException('Only the owner can cancel this log');
    }
    if (log.status === FieldMovementStatus.CANCELLED) {
      return this.getFieldMovementLog(logId, companyId, userId);
    }
    if (
      log.status !== FieldMovementStatus.DRAFT &&
      log.status !== FieldMovementStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted logs can be cancelled',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.fieldMovementLog.update({
        where: { id: logId },
        data: {
          status: FieldMovementStatus.CANCELLED,
          updatedBy: userId,
        },
      });
      await tx.fieldMovementEntry.updateMany({
        where: { logId },
        data: { status: FieldMovementStatus.CANCELLED },
      });
      if (log.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: log.approvalRequestId },
          data: { status: 'CANCELLED' },
        });
      }
    });

    await this.recalculateCompanyAttendanceMonth(
      companyId,
      log.month,
      log.year,
      log.employeeId,
    );

    return this.getFieldMovementLog(logId, companyId, userId);
  }

  /**
   * Allocates the next FM-#### request number from the PostgreSQL sequence.
   */
  private async nextFieldMovementNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('field_movement_log_number_seq')
    `;
    const seq = Number(result[0]?.nextval ?? 1);
    return `FM-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Called by the approval engine when a field movement request is finalized.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const log = await this.prisma.fieldMovementLog.findFirst({
      where: { approvalRequestId, deletedAt: null },
      include: {
        entries: {
          include: {
            dailyLog: true,
          },
        },
      },
    });

    if (!log) {
      return;
    }

    if (
      log.status === FieldMovementStatus.APPROVED ||
      log.status === FieldMovementStatus.REJECTED ||
      log.status === FieldMovementStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();

    if (decision === 'APPROVED') {
      await this.applyFieldMovementCorrections(log, now);
    } else if (decision === 'REJECTED') {
      await this.finalizeFieldMovementLogStatus(
        log.id,
        FieldMovementStatus.REJECTED,
        {
          completedAt: now,
          updatedBy: log.employeeId,
        },
      );
      await this.recalculateCompanyAttendanceMonth(
        log.companyId,
        log.month,
        log.year,
        log.employeeId,
      );
    } else if (decision === 'RETURNED') {
      await this.finalizeFieldMovementLogStatus(
        log.id,
        FieldMovementStatus.RETURNED,
        { updatedBy: log.employeeId },
      );
    }
  }

  /**
   * Sets log + all entry statuses in one transaction (approval source of truth).
   */
  private async finalizeFieldMovementLogStatus(
    logId: string,
    status: FieldMovementStatus,
    logData: Prisma.FieldMovementLogUpdateInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.fieldMovementLog.update({
        where: { id: logId },
        data: { ...logData, status },
      });
      await tx.fieldMovementEntry.updateMany({
        where: { logId },
        data: { status },
      });
    });
  }

  /**
   * Approves a field movement log: statuses + scan corrections in a transaction,
   * then recalculates attendance for that employee after commit.
   */
  private async applyFieldMovementCorrections(
    log: FieldMovementLog & {
      entries: Array<FieldMovementEntry & { dailyLog: AttendanceDailyLog }>;
    },
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.fieldMovementLog.update({
        where: { id: log.id },
        data: {
          status: FieldMovementStatus.APPROVED,
          completedAt: now,
          updatedBy: log.employeeId,
        },
      });
      await tx.fieldMovementEntry.updateMany({
        where: { logId: log.id },
        data: { status: FieldMovementStatus.APPROVED },
      });

      for (const entry of log.entries) {
        await this.applyEntryCorrection(tx, entry, log.employeeId, now);
      }
    });

    await this.recalculateCompanyAttendanceMonth(
      log.companyId,
      log.month,
      log.year,
      log.employeeId,
    );
  }

  /**
   * Applies one entry's reason to its linked attendance daily log.
   */
  private async applyEntryCorrection(
    tx: Prisma.TransactionClient,
    entry: FieldMovementEntry & { dailyLog: AttendanceDailyLog },
    employeeId: string,
    now: Date,
  ): Promise<void> {
    void employeeId;
    const dailyLog = entry.dailyLog;
    const scheduledEnd = dailyLog.isHalfDay ? '12:30' : '17:30';
    const scheduledStart = '08:30';

    const data: Prisma.AttendanceDailyLogUpdateInput = {
      wasPresent: true,
      flag: AttendanceDayFlag.NONE,
      flagResolved: true,
      flagResolvedAt: now,
      fieldMovementEntryId: entry.id,
    };

    switch (entry.reason) {
      case FieldMovementReason.FIELD_VISIT:
        if (dailyLog.flag === AttendanceDayFlag.MISSING_CLOCK_OUT && !dailyLog.clockOutLocal) {
          data.correctedClockOutLocal = scheduledEnd;
          data.missingClockOut = false;
        }
        if (dailyLog.flag === AttendanceDayFlag.MISSING_CLOCK_IN && !dailyLog.clockInLocal) {
          data.correctedClockInLocal = scheduledStart;
          data.missingClockIn = false;
        }
        if (dailyLog.flag === AttendanceDayFlag.EARLY_LEAVE) {
          data.correctedClockOutLocal =
            entry.returnTime ?? entry.departureTime ?? dailyLog.clockOutLocal;
        }
        break;

      case FieldMovementReason.FORGOT_CLOCK_OUT:
        // Stated out time is inserted; early-departure rules then apply to it.
        // Only EARLY_LEAVE / FIELD_VISIT waive early-departure deduction.
        if (!entry.departureTime) {
          throw new BadRequestException(
            'Stated clock-out time is required for FORGOT_CLOCK_OUT',
          );
        }
        data.correctedClockOutLocal = entry.departureTime;
        data.missingClockOut = false;
        break;

      case FieldMovementReason.FORGOT_CLOCK_IN:
        // Stated clock-in ("forgot both" carries it in returnTime); otherwise
        // the scheduled start.
        data.correctedClockInLocal = entry.returnTime ?? scheduledStart;
        data.missingClockIn = false;
        break;

      case FieldMovementReason.EARLY_LEAVE:
        // Approved early leave is paid; keep the recorded departure for audit.
        // earlyDepartureWaiver (FIELD_VISIT / EARLY_LEAVE) waives deduction.
        data.isEarlyLeave = true;
        if (entry.departureTime) {
          data.correctedClockOutLocal = entry.departureTime;
          data.earlyLeaveMinutes = this.calculateEarlyLeaveMinutes(
            entry.departureTime,
            scheduledEnd,
          );
        }
        break;

      default:
        break;
    }

    const effectiveClockIn =
      (typeof data.correctedClockInLocal === 'string'
        ? data.correctedClockInLocal
        : null) ??
      dailyLog.correctedClockInLocal ??
      dailyLog.clockInLocal;
    const effectiveClockOut =
      (typeof data.correctedClockOutLocal === 'string'
        ? data.correctedClockOutLocal
        : null) ??
      dailyLog.correctedClockOutLocal ??
      dailyLog.clockOutLocal;

    if (effectiveClockIn && effectiveClockOut) {
      data.recordedHours = calculateHoursBetween(
        effectiveClockIn,
        effectiveClockOut,
      );
    }

    await tx.attendanceDailyLog.update({
      where: { id: dailyLog.id },
      data,
    });
  }

  /**
   * Rebuilds paid/absent days and per-log status from dayDeduction rules.
   */
  private async recalculateAttendanceRecord(
    employeeId: string,
    companyId: string,
    month: number,
    year: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const writeDb = tx ?? this.prisma;
    const readDb = writeDb;
    const record = await readDb.attendanceRecord.findUnique({
      where: {
        companyId_employeeId_month_year: {
          companyId,
          employeeId,
          month,
          year,
        },
      },
      include: {
        dailyLogs: true,
      },
    });

    if (!record) {
      return;
    }

    const employee = await readDb.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: {
        id: true,
        departmentId: true,
        nationality: true,
        attendanceMode: true,
        employmentDate: true,
      },
    });
    if (!employee) {
      return;
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const employmentWindow = await getEmploymentWindow(readDb, employeeId, month, year);
    const rawContracts = await readDb.employeeContract.findMany({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
        startDate: { lte: monthEnd },
        AND: [
          { OR: [{ endDate: null }, { endDate: { gte: monthStart } }] },
          { OR: [{ terminatedAt: null }, { terminatedAt: { gte: monthStart } }] },
        ],
      },
      select: { id: true, startDate: true, endDate: true, terminatedAt: true },
      orderBy: { startDate: 'asc' },
    });
    // Contract ended without renewal while employment is open → still employed.
    const latestContract = await readDb.employeeContract.findFirst({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
        status: { not: 'DRAFT' },
        startDate: { lte: monthEnd },
      },
      select: { id: true, startDate: true, endDate: true, terminatedAt: true },
      orderBy: { startDate: 'desc' },
    });
    const contracts = cappedContractSegments(
      withContractHoldover(rawContracts, latestContract, employmentWindow, monthEnd)
        .contracts,
      employmentWindow,
    );

    let employmentEndDate: Date | null = employmentWindow?.end ?? null;
    if (contracts.length === 0 && !employmentEndDate) {
      const latestEnded = await readDb.employeeContract.findFirst({
        where: {
          companyId,
          employeeId,
          deletedAt: null,
          OR: [{ endDate: { not: null } }, { terminatedAt: { not: null } }],
        },
        select: { endDate: true, terminatedAt: true },
        orderBy: [{ terminatedAt: 'desc' }, { endDate: 'desc' }],
      });
      employmentEndDate = effectiveContractEnd(
        latestEnded?.endDate,
        latestEnded?.terminatedAt,
      );
    }

    const contractSegments = resolveEmploymentSegmentsForMonth({
      overlappingContracts: contracts,
      employmentDate: employee.employmentDate,
      employmentEndDate,
    });
    const separationEnd = employmentWindow?.end ?? null;

    let dailyLogs = record.dailyLogs;

    const dailyLogIdsByDate = new Map<string, string>();
    const dailyLogsByDate = new Map<
      string,
      ReturnType<typeof dailyLogToDeductionInput>
    >();
    const scheduleEndByDate = new Map<string, string | null>();
    const scanOnlyRuleByDate = new Map<string, ScanOnlyRule>();
    const scheduleFlagsByDate = new Map<
      string,
      { isWorkingDay: boolean; isHalfDay: boolean }
    >();
    const scheduleCache = new Map<string, ScheduleDayLike[]>();
    const scheduleResolvers: ScheduleResolverCache = new Map();

    const rememberScheduleFlags = async (date: Date): Promise<{
      isWorkingDay: boolean;
      isHalfDay: boolean;
      scheduleDay: ScheduleDayLike | undefined;
    }> => {
      const key = dateToYyyyMmDd(date);
      const scheduleDays = await this.resolveScheduleDaysCached(
        scheduleCache,
        employeeId,
        companyId,
        date,
        {
          resolvers: scheduleResolvers,
          rangeStart: monthStart,
          rangeEnd: monthEnd,
        },
      );
      const scheduleDay = scheduleDays.find(
        (row) => row.dayOfWeek === date.getUTCDay(),
      );
      const flags = {
        isWorkingDay: scheduleDay?.isWorkingDay ?? false,
        isHalfDay: scheduleDay?.isHalfDay ?? false,
      };
      scheduleFlagsByDate.set(key, flags);
      return { ...flags, scheduleDay };
    };

    const rebuildLogMaps = async (
      logs: typeof dailyLogs,
    ): Promise<void> => {
      dailyLogIdsByDate.clear();
      dailyLogsByDate.clear();
      scheduleEndByDate.clear();
      scanOnlyRuleByDate.clear();
      scheduleFlagsByDate.clear();
      for (const log of logs) {
        const key = dateToYyyyMmDd(log.date);
        dailyLogIdsByDate.set(key, log.id);
        const { scheduleDay } = await rememberScheduleFlags(log.date);
        scheduleEndByDate.set(key, scheduledEndForDay(scheduleDay));
        const scanOnlyRule = scanOnlyRuleFor(scheduleDay);
        if (scanOnlyRule) {
          scanOnlyRuleByDate.set(key, scanOnlyRule);
        }
        dailyLogsByDate.set(
          key,
          dailyLogToDeductionInput({
            ...log,
            scheduledEnd: scheduledEndForDay(scheduleDay),
          }),
        );
      }
    };

    await rebuildLogMaps(dailyLogs);

    // Materialise missing employed calendar days as empty daily logs (no scans).
    // Month paid/absent already counted these via summarizeMonthAbsence; persisting
    // rows makes dayStatus/dayDeduction visible in the UI and subsequent recalcs.
    const employedDates = employedCalendarDatesForContracts(
      month,
      year,
      contractSegments,
    );
    const missingDates = employedDates.filter(
      (date) => !dailyLogIdsByDate.has(dateToYyyyMmDd(date)),
    );

    if (missingDates.length > 0) {
      const holidays = await readDb.publicHoliday.findMany({
        where: {
          companyId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          name: true,
          date: true,
          isRecurring: true,
          appliesToNationality: true,
        },
      });
      const applicableHolidays = holidays.filter((holiday) =>
        holidayAppliesToNationality(
          holiday.appliesToNationality,
          employee.nationality,
        ),
      );

      const toCreate: Prisma.AttendanceDailyLogCreateManyInput[] = [];
      for (const date of missingDates) {
        const { scheduleDay, isWorkingDay: wouldBeWorkingDay } =
          await rememberScheduleFlags(date);
        const matchedHoliday = applicableHolidays.find((holiday) =>
          holidayFallsOnDate(holiday.date, holiday.isRecurring, date),
        );
        const isHoliday = Boolean(matchedHoliday);
        const isWeekend = !wouldBeWorkingDay;
        const isDutyDay = !isHoliday && wouldBeWorkingDay;
        const isHalfDay = isDutyDay ? (scheduleDay?.isHalfDay ?? false) : false;
        const scheduledHours = isDutyDay
          ? Number(scheduleDay?.totalHours ?? 0)
          : 0;
        const scheduledEnd = scheduledEndForDay(scheduleDay);
        const flag = resolveAttendanceDayFlag({
          isHoliday,
          isWeekend,
          clockIn: null,
          clockOut: null,
          isLastExportDay: false,
          scheduledEnd,
        });

        toCreate.push({
          id: randomUUID(),
          attendanceRecordId: record.id,
          date,
          clockInMachine: null,
          clockOutMachine: null,
          clockInLocal: null,
          clockOutLocal: null,
          isHoliday,
          holidayName: matchedHoliday?.name ?? null,
          isWeekend,
          isHalfDay,
          wasPresent: false,
          scheduledHours,
          recordedHours: null,
          isLate: false,
          lateMinutes: 0,
          missingClockIn: false,
          missingClockOut: false,
          isEarlyLeave: false,
          earlyLeaveMinutes: 0,
          flag,
          flagResolved: false,
          isLastExportDay: false,
          dayStatus: 'ABSENT',
          dayDeduction: 0,
        });
      }

      await writeDb.attendanceDailyLog.createMany({ data: toCreate });
      dailyLogs = await writeDb.attendanceDailyLog.findMany({
        where: { attendanceRecordId: record.id },
      });
      await rebuildLogMaps(dailyLogs);
    }

    const deductionData = await loadDeductionDataForMonth(
      readDb,
      companyId,
      employee,
      month,
      year,
      dailyLogIdsByDate,
    );
    // "Present this month" / "Exempt" / "Needs enrolment" chosen for an
    // employee missing from the export: no scans exist, so treat the month like
    // an attendance-exempt one (paid categories such as leave still apply
    // first) instead of letting every working day become a no-scan absence.
    const presentByDecision = isCountedPresentMatchMethod(record.matchMethod);
    // Policies as of the attendance month - never "current".
    const policy = await loadPolicySnapshot(readDb, companyId, monthStart);
    const inactiveSpans =
      (await loadInactiveSpansForMonth(readDb, [employeeId], month, year)).get(employeeId) ?? [];

    const hireDate =
      employee.employmentDate ??
      contractSegments[0]?.startDate ??
      null;
    let enrolmentGraceKeys: Set<string> | undefined;
    if (hireDate && !presentByDecision) {
      const firstScanLog = await readDb.attendanceDailyLog.findFirst({
        where: {
          record: { companyId, employeeId },
          OR: [
            { clockInLocal: { not: null } },
            { clockOutLocal: { not: null } },
            { correctedClockInLocal: { not: null } },
            { correctedClockOutLocal: { not: null } },
          ],
        },
        orderBy: { date: 'asc' },
        select: { date: true },
      });
      // Ensure schedule flags exist for every grace-window calendar day.
      {
        const cursor = new Date(
          Date.UTC(
            hireDate.getUTCFullYear(),
            hireDate.getUTCMonth(),
            hireDate.getUTCDate(),
          ),
        );
        while (cursor.getTime() <= monthEnd.getTime()) {
          if (!scheduleFlagsByDate.has(dateToYyyyMmDd(cursor))) {
            await rememberScheduleFlags(cursor);
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
      enrolmentGraceKeys = enrolmentGraceDateKeys({
        hireDate,
        firstScanDate: firstScanLog?.date ?? null,
        throughDate: monthEnd,
        isPublicHoliday: (date) =>
          matchedPublicHolidayForEmployee(employee, deductionData, date) !=
          null,
        isDayOff: (date) => {
          const flags = scheduleFlagsByDate.get(dateToYyyyMmDd(date));
          return flags ? !flags.isWorkingDay : date.getUTCDay() === 0;
        },
        maxWorkingDays: policy.enrolmentGraceWorkingDays,
      });
    }

    // Ensure schedule flags for every employed date used by summarizeMonthAbsence.
    for (const date of employedCalendarDatesForContracts(
      month,
      year,
      contractSegments,
    )) {
      if (!scheduleFlagsByDate.has(dateToYyyyMmDd(date))) {
        await rememberScheduleFlags(date);
      }
    }

    const context = buildDayDeductionContext(
      presentByDecision ? { ...employee, attendanceMode: 'EXEMPT' } : employee,
      deductionData,
      {
        enrolmentGraceKeys,
        scanOnlyRuleByDate,
        scheduleFlagsByDate,
        policy,
        inactiveForDate: (date) => {
          const span = inactiveSpanOn(date, inactiveSpans);
          return span ? { paid: policy.inactivePaid[span.type] } : null;
        },
      },
    );

    // Month totals over the employed window only (30-day payroll scale). Per-day
    // deductions are stored from the same summary so the daily breakdown adds up
    // to absentDays; days outside the employment window carry no deduction.
    const monthSummary = summarizeMonthAbsence({
      month,
      year,
      contracts: contractSegments,
      dailyLogsByDate,
      context,
    });

    let lateWorkedDays = 0;
    for (const log of dailyLogs) {
      const key = dateToYyyyMmDd(log.date);
      const matchedHoliday = matchedPublicHolidayForEmployee(
        employee,
        deductionData,
        log.date,
      );
      const isHoliday = matchedHoliday != null;
      const scheduledEnd = scheduleEndByDate.get(key) ?? null;
      const clockIn = log.correctedClockInLocal ?? log.clockInLocal;
      const clockOut = log.correctedClockOutLocal ?? log.clockOutLocal;
      const input = dailyLogToDeductionInput({
        ...log,
        scheduledEnd,
      });
      const dayResult =
        monthSummary.byDate.get(key) ??
        dayDeduction(log.date, input, context);
      const { deduction, status, siteName } = dayResult;
      const earlyBand = dayResult.earlyDepartureBand ?? 'NONE';
      const earlyWould = dayResult.earlyDepartureWouldDeduct ?? 0;
      const isEarlyLeave =
        earlyBand === 'FLAG' ||
        earlyBand === 'OVER_1H' ||
        earlyBand === 'PENDING_APPROVAL' ||
        earlyBand === 'COVERED_APPROVED';
      const earlyLeaveMinutes =
        isEarlyLeave && clockOut && scheduledEnd
          ? this.calculateEarlyLeaveMinutes(clockOut, scheduledEnd)
          : 0;
      const inEmployedWindow = monthSummary.byDate.has(key);
      const scanOnly = scanOnlyRuleByDate.has(key);
      // Only suppress FM flags when the day is actually ENROLMENT_GRACE.
      // A grace-window date with scans (e.g. clock-in only → HALF_ABSENT) must
      // still raise MISSING_CLOCK_OUT / EARLY_LEAVE for Explain days.
      const enrolmentGrace = status === 'ENROLMENT_GRACE';
      const onLeaveButScanned = dayResult.onLeaveButScanned === true;
      const scheduleFlags = scheduleFlagsByDate.get(key);
      const isWeekend = scheduleFlags
        ? !scheduleFlags.isWorkingDay
        : status === 'DAY_OFF' ||
          status === 'WORKED_ON_DAY_OFF' ||
          status === 'SUNDAY';
      const isHalfDay =
        !isHoliday && !isWeekend
          ? (scheduleFlags?.isHalfDay ?? log.isHalfDay)
          : false;
      // Holidays / day-offs are never scheduled duty.
      let scheduledHours = 0;
      if (!isHoliday && !isWeekend) {
        const { scheduleDay } = await rememberScheduleFlags(log.date);
        scheduledHours = Number(scheduleDay?.totalHours ?? 0);
      }
      const afterSeparation =
        separationEnd != null && log.date.getTime() > separationEnd.getTime();
      if (
        log.isLate &&
        inEmployedWindow &&
        !afterSeparation &&
        (status === 'PRESENT' || status === 'HALF_ABSENT' || status === 'FIELD_MOVEMENT_PENDING')
      ) {
        lateWorkedDays += 1;
      }
      const flag = afterSeparation
        ? clockIn || clockOut
          ? AttendanceDayFlag.SCAN_AFTER_SEPARATION
          : AttendanceDayFlag.NONE
        : resolveAttendanceDayFlag({
            isHoliday,
            isWeekend,
            clockIn,
            clockOut,
            isLastExportDay: log.isLastExportDay,
            scheduledEnd,
            scanOnly,
            enrolmentGrace,
            onLeaveButScanned,
            dayStatus: status,
            earlyDepartureGraceMinutes: policy.earlyDepartureGraceMinutes,
          });
      const scanReview = resolveScanReviewFields(
        log,
        inEmployedWindow ? (dayResult.scanAfterDeadlineTime ?? null) : null,
      );

      const coverageSuppressesScanFlags =
        afterSeparation ||
        status === 'INACTIVE' ||
        status === 'ON_SITE' ||
        status === 'WORK_FROM_HOME' ||
        status === 'LEAVE' ||
        status === 'UNPAID_LEAVE' ||
        status === 'ENROLMENT_GRACE' ||
        status === 'DAY_OFF' ||
        status === 'WORKED_ON_DAY_OFF' ||
        status === 'SUNDAY';

      const nextFlagResolved =
        flag === AttendanceDayFlag.NONE ||
        flag === AttendanceDayFlag.SCAN_AFTER_SEPARATION
          ? true
          : flag === AttendanceDayFlag.ON_LEAVE_BUT_SCANNED
            ? false
            : // Keep resolved only when the same actionable flag is unchanged.
              log.flag === flag
              ? log.flagResolved
              : false;
      const nextFlagResolvedAt =
        flag === AttendanceDayFlag.NONE ||
        flag === AttendanceDayFlag.SCAN_AFTER_SEPARATION
          ? (log.flagResolvedAt ?? new Date())
          : log.flag === flag && log.flagResolved
            ? log.flagResolvedAt
            : null;

      await writeDb.attendanceDailyLog.update({
        where: { id: log.id },
        data: {
          isHoliday,
          holidayName: matchedHoliday?.name ?? null,
          isWeekend,
          isHalfDay,
          scheduledHours,
          // DAY_OFF / WORKED_ON_DAY_OFF cast until prisma generate after migrate.
          dayStatus: (afterSeparation ? 'NOT_EMPLOYED' : status) as AttendanceDayStatus,
          dayDeduction: inEmployedWindow && !afterSeparation ? deduction : 0,
          isEarlyLeave: coverageSuppressesScanFlags ? false : isEarlyLeave,
          earlyLeaveMinutes: coverageSuppressesScanFlags ? 0 : earlyLeaveMinutes,
          flag,
          flagResolved: nextFlagResolved,
          flagResolvedAt: nextFlagResolvedAt,
          siteAssignmentName:
            siteName ??
            (status === 'ON_SITE' ? context.siteNameForDate(log.date) : null),
          // earlyDeparture* columns from 20261009160000 - cast until client regen
          ...({
            earlyDepartureBand: coverageSuppressesScanFlags
              ? null
              : earlyBand === 'NONE'
                ? null
                : earlyBand,
            earlyDepartureWouldDeduct: coverageSuppressesScanFlags
              ? 0
              : earlyWould,
          } as Prisma.AttendanceDailyLogUpdateInput),
          // SCAN_ONLY or site/WFH/leave coverage: no late / missing punch noise.
          ...(scanOnly || coverageSuppressesScanFlags
            ? {
                isLate: false,
                lateMinutes: 0,
                missingClockIn: false,
                missingClockOut: false,
              }
            : {}),
          ...scanReview,
          // Leave + scans: HR review queue (Explain days still excludes via leave cover).
          ...(onLeaveButScanned ? { needsReview: true } : {}),
        },
      });
      if (scanOnly || coverageSuppressesScanFlags) {
        log.isLate = false;
        log.lateMinutes = 0;
        log.missingClockIn = false;
        log.missingClockOut = false;
      }

      // Keep in-memory logs aligned so month KPIs below use the new holiday flags.
      log.isHoliday = isHoliday;
      log.isWeekend = isWeekend;
      log.isHalfDay = isHalfDay;
      log.holidayName = matchedHoliday?.name ?? null;
      log.scheduledHours = scheduledHours as never;
      log.dayStatus = status as AttendanceDayStatus;
      log.dayDeduction = (inEmployedWindow ? deduction : 0) as never;
      log.isEarlyLeave = isEarlyLeave;
      log.earlyLeaveMinutes = earlyLeaveMinutes;
      Object.assign(log, {
        earlyDepartureBand: earlyBand === 'NONE' ? null : earlyBand,
        earlyDepartureWouldDeduct: earlyWould,
      });
      log.flag = flag;
      log.flagResolved = nextFlagResolved;
      log.flagResolvedAt = nextFlagResolvedAt;
    }

    const workingDayLogs = dailyLogs.filter(
      (log) => !log.isWeekend && !log.isHoliday,
    );
    const holidayLogs = dailyLogs.filter((log) => log.isHoliday);
    const scheduledDays = monthSummary.scheduledDays;
    const presentDays = monthSummary.presentDays;
    // lateDeductionMode ENFORCED: 0.5 day per latesPerHalfDay lates on worked days in the window.
    const lateDeduction = lateArrivalDeduction(
      lateWorkedDays,
      policy.lateDeductionMode,
      policy.latesPerHalfDay,
    );
    const absentDays = Math.round((monthSummary.absentDays + lateDeduction) * 100) / 100;
    const unpaidLeaveDays = monthSummary.unpaidLeaveDays;
    const paidDays = Math.max(
      0,
      Math.round((monthSummary.paidDays - lateDeduction) * 100) / 100,
    );
    const holidayDays = holidayLogs.length;
    const lateDays = workingDayLogs.filter((log) => log.isLate).length;
    const totalLateMinutes = workingDayLogs.reduce(
      (sum, log) => sum + (log.lateMinutes ?? 0),
      0,
    );
    const earlyLeaveDays = workingDayLogs.filter(
      (log) => log.isEarlyLeave,
    ).length;

    const missingClockInDays = workingDayLogs.filter(
      (log) =>
        log.flag === AttendanceDayFlag.MISSING_CLOCK_IN && !log.flagResolved,
    ).length;

    const missingClockOutDays = workingDayLogs.filter(
      (log) =>
        log.flag === AttendanceDayFlag.MISSING_CLOCK_OUT && !log.flagResolved,
    ).length;

    const flaggedDays = dailyLogs.filter(
      (log) => log.flag !== AttendanceDayFlag.NONE && !log.flagResolved,
    ).length;

    const resolvedDays = dailyLogs.filter((log) => log.flagResolved).length;

    const approvedFieldMovements =
      await writeDb.fieldMovementEntry.count({
        where: {
          dailyLogId: { in: dailyLogs.map((log) => log.id) },
          log: {
            companyId,
            employeeId,
            status: FieldMovementStatus.APPROVED,
            deletedAt: null,
          },
        },
      });

    const forgotToClockCount = await writeDb.fieldMovementEntry.count({
      where: {
        dailyLogId: { in: dailyLogs.map((log) => log.id) },
        reason: {
          in: [
            FieldMovementReason.FORGOT_CLOCK_IN,
            FieldMovementReason.FORGOT_CLOCK_OUT,
          ],
        },
        log: {
          companyId,
          employeeId,
          status: FieldMovementStatus.APPROVED,
          deletedAt: null,
        },
      },
    });

    let payableHours = 0;
    for (const log of dailyLogs) {
      const wouldBeWorkingDay = !log.isWeekend;
      const dutyHours = Number(log.isHalfDay ? 4 : log.scheduledHours || 8);
      if (log.isHoliday && wouldBeWorkingDay) {
        // Holiday credit uses scheduled weekday hours (stored as 0 on holidays).
        payableHours += Number(log.isHalfDay ? 4 : 8);
      } else if (!log.isHoliday && !log.isWeekend && log.wasPresent) {
        payableHours +=
          Number(log.scheduledHours) > 0
            ? Number(log.scheduledHours)
            : dutyHours;
      }
    }

    await writeDb.attendanceRecord.update({
      where: { id: record.id },
      data: {
        scheduledDays,
        presentDays,
        absentDays,
        paidDays,
        holidayDays,
        lateDays,
        totalLateMinutes,
        earlyLeaveDays,
        missingClockInDays,
        missingClockOutDays,
        flaggedDays,
        resolvedDays,
        payableHours: Math.round(payableHours * 100) / 100,
        // earlyDeparture* / forgotToClock* - cast until client regen
        ...({
          earlyDepartureCount: monthSummary.earlyDepartureCount,
          earlyDepartureDeductedDays: monthSummary.earlyDepartureDeductedDays,
          earlyDepartureWouldDeductDays:
            monthSummary.earlyDepartureWouldDeductDays,
          forgotToClockCount,
          approvedFieldMovementCount: approvedFieldMovements,
        } as Prisma.AttendanceRecordUpdateInput),
      },
    });
    // unpaid_leave_days column exists after migrate; write via SQL until
    // `prisma generate` succeeds (running Nest locks the query engine DLL).
    await writeDb.$executeRaw`
      UPDATE attendance_record
      SET unpaid_leave_days = ${unpaidLeaveDays}
      WHERE id = ${record.id}
    `;
  }

  /**
   * Minutes left early relative to the scheduled end time (HH:mm).
   */
  private calculateEarlyLeaveMinutes(
    actualDeparture: string,
    scheduledEnd: string,
  ): number {
    const [actualHour, actualMinute] = actualDeparture.split(':').map(Number);
    const [scheduledHour, scheduledMinute] = scheduledEnd.split(':').map(Number);
    const actualMins = (actualHour ?? 0) * 60 + (actualMinute ?? 0);
    const scheduledMins = (scheduledHour ?? 0) * 60 + (scheduledMinute ?? 0);
    return Math.max(0, scheduledMins - actualMins);
  }

  /**
   * Recomputes attendance daily logs and month summaries for an employee from
   * a given date onward, using each day's active work schedule. Skips months
   * locked as APPROVED. Preserves HR corrections and field-movement links.
   */
  async recalculateEmployeeAttendanceFromDate(
    employeeId: string,
    companyId: string,
    fromDate: Date,
  ): Promise<{
    updatedRecords: number;
    updatedDays: number;
    skippedLockedMonths: number;
  }> {
    const from = toUtcDateOnlySafe(fromDate);
    const fromYear = from.getUTCFullYear();
    const fromMonth = from.getUTCMonth() + 1;

    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true, nationality: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const holidays = await this.prisma.publicHoliday.findMany({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        name: true,
        date: true,
        isRecurring: true,
        appliesToNationality: true,
      },
    });
    const applicableHolidays = holidays.filter((holiday) =>
      holidayAppliesToNationality(
        holiday.appliesToNationality,
        employee.nationality,
      ),
    );

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        companyId,
        employeeId,
        OR: [
          { year: { gt: fromYear } },
          { year: fromYear, month: { gte: fromMonth } },
        ],
      },
      include: {
        dailyLogs: { orderBy: { date: 'asc' } },
        importBatch: {
          include: { monthlyApproval: { select: { status: true } } },
        },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    let updatedRecords = 0;
    let updatedDays = 0;
    let skippedLockedMonths = 0;

    const scheduleCache = new Map<string, ScheduleDayLike[]>();
    const scheduleResolvers: ScheduleResolverCache = new Map();

    for (const record of records) {
      const status = record.importBatch.monthlyApproval?.status;
      if (status === 'APPROVED') {
        skippedLockedMonths += 1;
        await markAttendanceMonthRecalcStale(
          this.prisma,
          companyId,
          record.month,
          record.year,
        );
        await markPayrollAttendanceSnapshotStale(
          this.prisma,
          companyId,
          record.month,
          record.year,
        );
        continue;
      }
      if (
        await isPayrollMonthLocked(
          this.prisma,
          companyId,
          record.month,
          record.year,
        )
      ) {
        skippedLockedMonths += 1;
        await markPayrollAttendanceSnapshotStale(
          this.prisma,
          companyId,
          record.month,
          record.year,
        );
        continue;
      }

      let lastExportDate: Date | null = null;
      for (const log of record.dailyLogs) {
        if (!lastExportDate || log.date.getTime() > lastExportDate.getTime()) {
          lastExportDate = log.date;
        }
      }
      const exportDayKey = lastExportDate
        ? lastExportDate.toISOString().slice(0, 10)
        : null;

      let daysChanged = 0;
      const recordMonthStart = new Date(
        Date.UTC(record.year, record.month - 1, 1),
      );
      const recordMonthEnd = new Date(Date.UTC(record.year, record.month, 0));
      // Fresh resolver per month so range matches the record being updated.
      scheduleResolvers.delete(employeeId);

      for (const log of record.dailyLogs) {
        const logDay = toUtcDateOnlySafe(log.date);
        if (logDay.getTime() < from.getTime()) {
          continue;
        }

        const scheduleDays = await this.resolveScheduleDaysCached(
          scheduleCache,
          employeeId,
          companyId,
          logDay,
          {
            resolvers: scheduleResolvers,
            rangeStart: recordMonthStart,
            rangeEnd: recordMonthEnd,
          },
        );
        const dayOfWeek = logDay.getUTCDay();
        const scheduleDay = scheduleDays.find(
          (row) => row.dayOfWeek === dayOfWeek,
        );
        const scanOnly = isScanOnlySchedule(scheduleDay);

        const matchedHoliday = applicableHolidays.find((holiday) =>
          holidayFallsOnDate(holiday.date, holiday.isRecurring, logDay),
        );
        const isHoliday = Boolean(matchedHoliday);
        const wouldBeWorkingDay = scheduleDay?.isWorkingDay ?? false;
        const isWeekend = !wouldBeWorkingDay;
        const isDutyDay = !isHoliday && wouldBeWorkingDay;
        const isHalfDay = isDutyDay ? (scheduleDay?.isHalfDay ?? false) : false;
        const weekdayHours = Number(scheduleDay?.totalHours ?? 0);
        const scheduledHours = isDutyDay ? weekdayHours : 0;

        const clockIn =
          log.correctedClockInLocal ?? log.clockInLocal;
        const clockOut =
          log.correctedClockOutLocal ?? log.clockOutLocal;
        const wasPresent = scanOnly
          ? Boolean(clockIn || clockOut)
          : Boolean(clockIn);

        let recordedHours: number | null = null;
        if (clockIn && clockOut) {
          recordedHours = calculateHoursBetween(clockIn, clockOut);
        }

        let isLate = false;
        let lateMinutes = 0;
        if (
          !scanOnly &&
          wasPresent &&
          isDutyDay &&
          scheduleDay?.morningStart &&
          clockIn
        ) {
          const late = isLateAfterGrace(
            clockIn,
            scheduleDay.morningStart,
            await getPolicy(this.prisma, companyId, 'lateGraceMinutes', logDay),
          );
          isLate = late.isLate;
          lateMinutes = late.lateMinutes;
        }

        const missingClockIn =
          !scanOnly && isDutyDay && !wasPresent && Boolean(clockOut);
        const isLastExportDay =
          exportDayKey != null &&
          logDay.toISOString().slice(0, 10) === exportDayKey;
        const missingClockOut =
          !scanOnly &&
          isDutyDay &&
          wasPresent &&
          !clockOut &&
          !isLastExportDay;

        const flag = resolveAttendanceDayFlag({
          isHoliday,
          isWeekend,
          clockIn,
          clockOut,
          isLastExportDay,
          scheduledEnd: scheduledEndForDay(scheduleDay),
          scanOnly,
          earlyDepartureGraceMinutes: await getPolicy(
            this.prisma,
            companyId,
            'earlyDepartureGraceMinutes',
            logDay,
          ),
        });

        const flagResolved =
          flag === AttendanceDayFlag.NONE
            ? true
            : log.flagResolved;

        await this.prisma.attendanceDailyLog.update({
          where: { id: log.id },
          data: {
            isHoliday,
            holidayName: matchedHoliday?.name ?? null,
            isWeekend,
            isHalfDay,
            wasPresent,
            scheduledHours,
            recordedHours,
            isLate,
            lateMinutes,
            missingClockIn,
            missingClockOut,
            flag,
            flagResolved,
            flagResolvedAt:
              flag === AttendanceDayFlag.NONE
                ? (log.flagResolvedAt ?? new Date())
                : log.flagResolved
                  ? log.flagResolvedAt
                  : null,
            isLastExportDay,
          },
        });
        daysChanged += 1;
      }

      if (daysChanged > 0) {
        await this.recalculateAttendanceRecord(
          employeeId,
          companyId,
          record.month,
          record.year,
        );
        // Draft payroll for the month now reads different attendance figures.
        await markPayrollAttendanceSnapshotStale(
          this.prisma,
          companyId,
          record.month,
          record.year,
        );
        updatedRecords += 1;
        updatedDays += daysChanged;
      }
    }

    this.logger.log(
      `[Attendance] Recalculated from ${from.toISOString().slice(0, 10)} for ${employeeId}: ${updatedRecords} record(s), ${updatedDays} day(s), ${skippedLockedMonths} locked month(s) skipped`,
    );

    return { updatedRecords, updatedDays, skippedLockedMonths };
  }

  /**
   * Prefetches assignments for a date range once; returns a sync day→weekday map.
   */
  private async buildEmployeeScheduleDayResolver(
    employeeId: string,
    companyId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<(date: Date) => ScheduleDayLike[]> {
    const resolveActive =
      await this.workScheduleService.createActiveScheduleResolver(
        employeeId,
        companyId,
        rangeStart,
        rangeEnd,
      );
    const byScheduleId = new Map<string, ScheduleDayLike[]>();
    const fallback = this.fallbackWeekdaySchedule();
    return (date: Date): ScheduleDayLike[] => {
      const schedule = resolveActive(date);
      if (!schedule) {
        return fallback;
      }
      let days = byScheduleId.get(schedule.id);
      if (!days) {
        days = toScheduleDayLikes(schedule);
        byScheduleId.set(schedule.id, days);
      }
      return days;
    };
  }

  /**
   * Loads and caches weekday schedule rows for a calendar day.
   * Pass `resolvers` + range so each employee pays only one assignment query.
   */
  private async resolveScheduleDaysCached(
    cache: Map<string, ScheduleDayLike[]>,
    employeeId: string,
    companyId: string,
    date: Date,
    options?: {
      resolvers?: ScheduleResolverCache;
      rangeStart?: Date;
      rangeEnd?: Date;
    },
  ): Promise<ScheduleDayLike[]> {
    const dayKey = `${employeeId}|${date.toISOString().slice(0, 10)}`;
    const hit = cache.get(dayKey);
    if (hit) {
      return hit;
    }

    const rangeStart = options?.rangeStart ?? date;
    const rangeEnd = options?.rangeEnd ?? date;
    const resolvers = options?.resolvers ?? new Map();

    let pending = resolvers.get(employeeId);
    if (!pending) {
      pending = this.buildEmployeeScheduleDayResolver(
        employeeId,
        companyId,
        rangeStart,
        rangeEnd,
      );
      resolvers.set(employeeId, pending);
    }
    const resolve = await pending;
    const days = resolve(date);
    cache.set(dayKey, days);
    return days;
  }

  /**
   * Runs async work over items with a fixed concurrency ceiling.
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= items.length) {
            return;
          }
          results[index] = await mapper(items[index], index);
        }
      }),
    );
    return results;
  }

  /**
   * Recomputes dayDeduction summaries for every attendance record in a month.
   */
  async recalculateCompanyAttendanceMonth(
    companyId: string,
    month: number,
    year: number,
    employeeId?: string,
  ): Promise<{
    updated: number;
    skippedPayrollLocked?: boolean;
    skippedAttendanceApproved?: boolean;
  }> {
    if (await isPayrollMonthLocked(this.prisma, companyId, month, year)) {
      await markPayrollAttendanceSnapshotStale(
        this.prisma,
        companyId,
        month,
        year,
      );
      return { updated: 0, skippedPayrollLocked: true };
    }

    if (await isAttendanceMonthApproved(this.prisma, companyId, month, year)) {
      await markAttendanceMonthRecalcStale(
        this.prisma,
        companyId,
        month,
        year,
      );
      await markPayrollAttendanceSnapshotStale(
        this.prisma,
        companyId,
        month,
        year,
      );
      return { updated: 0, skippedAttendanceApproved: true };
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        companyId,
        month,
        year,
        ...(employeeId ? { employeeId } : {}),
      },
      select: { employeeId: true },
    });
    let updated = 0;
    for (const record of records) {
      await this.recalculateAttendanceRecord(
        record.employeeId,
        companyId,
        month,
        year,
      );
      updated += 1;
    }

    if (updated > 0) {
      await markPayrollAttendanceSnapshotStale(
        this.prisma,
        companyId,
        month,
        year,
      );
      await clearAttendanceMonthRecalcStale(
        this.prisma,
        companyId,
        month,
        year,
      );
    }

    return { updated };
  }

  /**
   * Loads approved site / WFH / leave coverage for missing-from-file employees.
   */
  private async buildMissingCoverageByEmployee(
    companyId: string,
    employees: ReadonlyArray<{
      id: string;
      departmentId: string | null;
      nationality: Nationality | null;
      employmentDate: Date | null;
    }>,
    month: number,
    year: number,
  ): Promise<
    Map<
      string,
      ReturnType<typeof summarizeMissingEmployeeCoverage>
    >
  > {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const employeeIds = employees.map((e) => e.id);

    const [holidays, wfhDays, leaveRows, siteRows] = await Promise.all([
      this.prisma.publicHoliday.findMany({
        where: { companyId, isActive: true, deletedAt: null },
        select: {
          name: true,
          date: true,
          isRecurring: true,
          appliesToNationality: true,
        },
      }),
      this.prisma.workFromHomeDay.findMany({
        where: {
          companyId,
          deletedAt: null,
          date: { gte: monthStart, lte: monthEnd },
        },
        select: {
          date: true,
          scope: true,
          departmentIds: true,
          employeeIds: true,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          companyId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          // UNPAID leave is absence, not schedule coverage for COVERED.
          leaveType: { not: 'UNPAID' },
          deletedAt: null,
          periods: {
            some: {
              startDate: { lte: monthEnd },
              endDate: { gte: monthStart },
            },
          },
        },
        select: {
          employeeId: true,
          periods: { select: { startDate: true, endDate: true } },
        },
      }),
      this.prisma.siteAssignment.findMany({
        where: {
          companyId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          deletedAt: null,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: {
          employeeId: true,
          startDate: true,
          endDate: true,
          siteName: true,
        },
      }),
    ]);

    const leaveKeysByEmployee = new Map<string, Set<string>>();
    for (const leave of leaveRows) {
      const set = leaveKeysByEmployee.get(leave.employeeId) ?? new Set();
      for (const period of leave.periods) {
        const cursor = new Date(
          Math.max(period.startDate.getTime(), monthStart.getTime()),
        );
        const end = Math.min(period.endDate.getTime(), monthEnd.getTime());
        while (cursor.getTime() <= end) {
          set.add(dateToYyyyMmDd(cursor));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
      leaveKeysByEmployee.set(leave.employeeId, set);
    }

    const sitesByEmployee = new Map<
      string,
      Array<{ startDate: Date; endDate: Date; siteName: string }>
    >();
    for (const site of siteRows) {
      const list = sitesByEmployee.get(site.employeeId) ?? [];
      list.push({
        startDate: site.startDate,
        endDate: site.endDate,
        siteName: site.siteName,
      });
      sitesByEmployee.set(site.employeeId, list);
    }

    const contractsByEmployee = await this.prisma.employeeContract.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        deletedAt: null,
        startDate: { lte: monthEnd },
        AND: [
          { OR: [{ endDate: null }, { endDate: { gte: monthStart } }] },
          { OR: [{ terminatedAt: null }, { terminatedAt: { gte: monthStart } }] },
        ],
      },
      select: {
        employeeId: true,
        startDate: true,
        endDate: true,
        terminatedAt: true,
      },
      orderBy: { startDate: 'asc' },
    });

    const windowsByEmployee = await loadEmploymentWindows(
      this.prisma,
      employees,
      month,
      year,
    );
    const rawGrouped = new Map<
      string,
      Array<{ startDate: Date; endDate: Date | null; terminatedAt: Date | null }>
    >();
    for (const contract of contractsByEmployee) {
      const list = rawGrouped.get(contract.employeeId) ?? [];
      list.push(contract);
      rawGrouped.set(contract.employeeId, list);
    }
    const contractsGrouped = new Map<
      string,
      Array<{ startDate: Date; endDate: Date | null }>
    >();
    for (const [employeeId, list] of rawGrouped) {
      contractsGrouped.set(
        employeeId,
        cappedContractSegments(list, windowsByEmployee.get(employeeId) ?? null),
      );
    }

    const result = new Map<
      string,
      ReturnType<typeof summarizeMissingEmployeeCoverage>
    >();
    const scheduleCache = new Map<string, ScheduleDayLike[]>();
    const scheduleResolvers: ScheduleResolverCache = new Map();
    const coverageMonthStart = new Date(Date.UTC(year, month - 1, 1));
    const coverageMonthEnd = new Date(Date.UTC(year, month, 0));

    for (const employee of employees) {
      const overlapping = contractsGrouped.get(employee.id) ?? [];
      let employmentEndDate: Date | null =
        windowsByEmployee.get(employee.id)?.end ?? null;
      if (overlapping.length === 0 && !employmentEndDate) {
        const latestEnded = await this.prisma.employeeContract.findFirst({
          where: {
            companyId,
            employeeId: employee.id,
            deletedAt: null,
            OR: [{ endDate: { not: null } }, { terminatedAt: { not: null } }],
          },
          select: { endDate: true, terminatedAt: true },
          orderBy: [{ terminatedAt: 'desc' }, { endDate: 'desc' }],
        });
        employmentEndDate = effectiveContractEnd(
          latestEnded?.endDate,
          latestEnded?.terminatedAt,
        );
      }

      const segments = resolveEmploymentSegmentsForMonth({
        overlappingContracts: overlapping,
        employmentDate: employee.employmentDate,
        employmentEndDate,
      });

      const scheduleFlagsByDate = new Map<
        string,
        { isWorkingDay: boolean; isHalfDay: boolean }
      >();
      for (const date of employedCalendarDatesForContracts(
        month,
        year,
        segments,
      )) {
        const scheduleDays = await this.resolveScheduleDaysCached(
          scheduleCache,
          employee.id,
          companyId,
          date,
          {
            resolvers: scheduleResolvers,
            rangeStart: coverageMonthStart,
            rangeEnd: coverageMonthEnd,
          },
        );
        const scheduleDay = scheduleDays.find(
          (row) => row.dayOfWeek === date.getUTCDay(),
        );
        scheduleFlagsByDate.set(dateToYyyyMmDd(date), {
          isWorkingDay: scheduleDay?.isWorkingDay ?? false,
          isHalfDay: scheduleDay?.isHalfDay ?? false,
        });
      }

      const summary = summarizeMissingEmployeeCoverage({
        month,
        year,
        contractSegments: segments,
        employee: {
          id: employee.id,
          departmentId: employee.departmentId,
          nationality: employee.nationality,
        },
        holidays,
        approvedSites: sitesByEmployee.get(employee.id) ?? [],
        wfhDays,
        leaveDateKeys: leaveKeysByEmployee.get(employee.id) ?? new Set(),
        scheduleFlagsByDate,
      });
      result.set(employee.id, summary);
    }

    return result;
  }

}

/**
 * Normalizes a Date to UTC midnight for date-only comparisons.
 */
function toUtcDateOnlySafe(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
