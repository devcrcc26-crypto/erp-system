import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AttendanceDailyLog,
  AttendanceDayFlag,
  AttendanceImportBatch,
  AttendanceMonthlyApproval,
  FieldMovementEntry,
  FieldMovementLog,
  FieldMovementReason,
  FieldMovementStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  holidayAppliesToNationality,
  holidayFallsOnDate,
} from '../../../work-schedule/application/services/work-schedule.dates';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
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
  UnlockAttendanceMonthDto,
} from '../dtos/attendance.dto';
import {
  AttendanceMatchResult,
  AttendanceMatchingService,
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
};

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
 */
function resolveAttendanceDayFlag(params: {
  isHoliday: boolean;
  isWeekend: boolean;
  clockIn: string | null;
  clockOut: string | null;
  isLastExportDay: boolean;
  scheduledEnd: string | null;
}): AttendanceDayFlag {
  if (params.isHoliday || params.isWeekend) {
    return AttendanceDayFlag.NONE;
  }
  if (!params.clockIn) {
    return AttendanceDayFlag.MISSING_CLOCK_IN;
  }
  if (!params.clockOut && !params.isLastExportDay) {
    return AttendanceDayFlag.MISSING_CLOCK_OUT;
  }
  if (
    params.clockIn &&
    params.clockOut &&
    params.scheduledEnd &&
    isBeforeTime(params.clockOut, params.scheduledEnd)
  ) {
    return AttendanceDayFlag.EARLY_LEAVE;
  }
  return AttendanceDayFlag.NONE;
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
 * Attendance import and reporting — daily logs from Deli clock times,
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
    private readonly workScheduleService: WorkScheduleService,
    private readonly permissionService: PermissionService,
    private readonly previewCache: AttendancePreviewCache,
    private readonly notificationService: NotificationService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
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
    const matchResults = await this.matchingService.matchRows(rows, companyId);

    const existing = await this.prisma.attendanceImportBatch.findUnique({
      where: {
        companyId_month_year: { companyId, month, year },
      },
    });

    const matched = matchResults.filter(
      (row) =>
        row.confidence === 'ID_MATCH' || row.confidence === 'NAME_HIGH',
    );
    const review = matchResults.filter(
      (row) => row.confidence === 'NAME_REVIEW',
    );
    const rejected = matchResults.filter(
      (row) => row.confidence === 'NO_MATCH',
    );

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
  ): Promise<{ logs: AttendanceDailyLogInput[]; summary: AttendanceDailySummary }> {
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { nationality: true },
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

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    let scheduleDays: ScheduleDayLike[] = [];
    try {
      const schedule = await this.workScheduleService.getActiveSchedule(
        employeeId,
        companyId,
        periodStart,
      );
      scheduleDays = schedule.days.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        isWorkingDay: day.isWorkingDay,
        isHalfDay: day.isHalfDay,
        morningStart: day.morningStart,
        morningEnd: day.morningEnd,
        afternoonEnd: day.afternoonEnd,
        totalHours: day.totalHours,
      }));
    } catch {
      scheduleDays = this.fallbackWeekdaySchedule();
    }

    const exportDayKey = lastExportDate
      ? lastExportDate.toISOString().slice(0, 10)
      : null;

    const logs: AttendanceDailyLogInput[] = [];
    let payableHours = 0;

    for (const day of rawDailyData) {
      const date =
        day.date instanceof Date ? day.date : new Date(String(day.date));
      const dayOfWeek = date.getUTCDay();
      const scheduleDay = scheduleDays.find(
        (row) => row.dayOfWeek === dayOfWeek,
      );

      const matchedHoliday = applicableHolidays.find((holiday) =>
        holidayFallsOnDate(holiday.date, holiday.isRecurring, date),
      );
      const isHoliday = Boolean(matchedHoliday);
      const wouldBeWorkingDay = scheduleDay?.isWorkingDay ?? false;
      const isWeekend = !wouldBeWorkingDay;
      const isDutyDay = !isHoliday && wouldBeWorkingDay;
      const isHalfDay = isDutyDay ? (scheduleDay?.isHalfDay ?? false) : false;
      const weekdayHours = Number(scheduleDay?.totalHours ?? 0);
      // Holidays / weekends are not scheduled duty — expected hours are 0.
      const scheduledHours = isDutyDay ? weekdayHours : 0;

      const wasPresent = Boolean(day.clockInLocal);
      let recordedHours: number | null = null;
      if (day.clockInLocal && day.clockOutLocal) {
        recordedHours = calculateHoursBetween(
          day.clockInLocal,
          day.clockOutLocal,
        );
      }

      let isLate = false;
      let lateMinutes = 0;
      if (
        wasPresent &&
        isDutyDay &&
        scheduleDay?.morningStart &&
        day.clockInLocal
      ) {
        isLate = isAfterTime(day.clockInLocal, scheduleDay.morningStart);
        if (isLate) {
          lateMinutes = minutesBetween(
            scheduleDay.morningStart,
            day.clockInLocal,
          );
        }
      }

      // Missing punches only apply on scheduled duty days (not holidays/weekends).
      const missingClockIn =
        isDutyDay && !wasPresent && Boolean(day.clockOutLocal);
      const isLastExportDay =
        exportDayKey != null &&
        date.toISOString().slice(0, 10) === exportDayKey;
      const missingClockOut =
        isDutyDay && wasPresent && !day.clockOutLocal && !isLastExportDay;

      // Payable hours: recorded duty time + paid public-holiday credit
      // (holiday on a normally working weekday credits that day's hours).
      if (isHoliday && wouldBeWorkingDay) {
        payableHours += weekdayHours;
      } else if (isDutyDay && recordedHours != null) {
        payableHours += recordedHours;
      }

      const flag = resolveAttendanceDayFlag({
        isHoliday,
        isWeekend,
        clockIn: day.clockInLocal,
        clockOut: day.clockOutLocal,
        isLastExportDay,
        scheduledEnd: scheduledEndForDay(scheduleDay),
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

    const scheduledDays = workingDayLogs.reduce(
      (sum, log) => sum + (log.isHalfDay ? 0.5 : 1),
      0,
    );
    const presentDays = workingDayLogs
      .filter((log) => log.wasPresent)
      .reduce((sum, log) => sum + (log.isHalfDay ? 0.5 : 1), 0);

    const summary: AttendanceDailySummary = {
      scheduledDays,
      presentDays,
      absentDays: Math.max(0, scheduledDays - presentDays),
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

    const { month, year, fileName, matched, review, rejected, totalRows } =
      cached;

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
      const employees = await this.prisma.user.findMany({
        where: {
          companyId,
          deletedAt: null,
          isActive: true,
          id: { in: [...new Set(assignmentEmployeeIds)] },
        },
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

    type ImportRow = AttendanceMatchResult & { matchedEmployeeId: string };
    const rowsToImport: ImportRow[] = [];
    const takenEmployeeIds = new Set<string>();

    const claimEmployee = (id: string): void => {
      if (takenEmployeeIds.has(id)) {
        throw new BadRequestException(
          'Each ERP employee can only be matched once in an import',
        );
      }
      takenEmployeeIds.add(id);
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
      });
      autoMatchedCount += 1;
    }

    for (let index = 0; index < review.length; index += 1) {
      if (!confirmedIndices.has(index)) {
        continue;
      }
      const row = review[index];
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
          matchedEmployeeName: `${employee.firstName} ${employee.lastName}`,
          matchedEmployeeErpId: employee.employeeId,
          confidence: 'MANUAL',
          score: 100,
        });
        manualAssignedCount += 1;
      } else if (row.matchedEmployeeId) {
        claimEmployee(row.matchedEmployeeId);
        rowsToImport.push({
          ...row,
          matchedEmployeeId: row.matchedEmployeeId,
        });
        autoMatchedCount += 1;
      }
    }

    const stillRejected: AttendanceMatchResult[] = [];
    for (let index = 0; index < rejected.length; index += 1) {
      const row = rejected[index];
      const assignedId = rejectedAssignmentByIndex.get(index);
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
          matchedEmployeeName: `${employee.firstName} ${employee.lastName}`,
          matchedEmployeeErpId: employee.employeeId,
          confidence: 'MANUAL',
          score: 100,
        });
        manualAssignedCount += 1;
      } else {
        stillRejected.push(row);
      }
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

    const prepared = await Promise.all(
      rowsToImport.map(async (row) => {
        const { logs, summary } = await this.calculateDailyLogs(
          row.matchedEmployeeId,
          companyId,
          row.data.dailyData ?? [],
          month,
          year,
          lastExportDate,
        );
        return {
          row,
          logs,
          summary,
          recordId: randomUUID(),
        };
      }),
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
      },
      {
        maxWait: 20_000,
        timeout: 120_000,
      },
    );

    await this.createMonthlyApproval(batchId, companyId, userId);
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
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        OR: [
          { firstName: { contains: trimmed, mode: 'insensitive' } },
          { lastName: { contains: trimmed, mode: 'insensitive' } },
          { employeeId: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
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

    const where: Prisma.AttendanceRecordWhereInput = {
      companyId,
      month,
      year,
      ...(isHrViewer && filters.employeeId
        ? { employeeId: filters.employeeId }
        : !isHrViewer
          ? { employeeId: userId }
          : {}),
      ...(isHrViewer && filters.search?.trim()
        ? {
            employee: {
              OR: [
                {
                  firstName: {
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
              ],
            },
          }
        : {}),
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
              lastName: true,
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

    const data = rows.map((record) => ({
      ...record,
      attendanceRate: computeAttendanceRate(
        record.scheduledDays,
        record.presentDays,
      ),
    }));

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * Year profile for one employee: month rows with rates, daily logs, summary.
   */
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
   * Import batch history for HR — which months were imported and by whom.
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
      },
    });
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

    return this.prisma.attendanceMonthlyApproval.update({
      where: { id: dto.monthlyApprovalId },
      data: {
        status: 'UNLOCKED',
        unlockedAt: new Date(),
        unlockedBy: userId,
        unlockReason: dto.unlockReason,
      },
    });
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
            lastName: true,
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
    try {
      const schedule = await this.workScheduleService.getActiveSchedule(
        record.employeeId,
        record.companyId,
        dailyLog.date,
      );
      const dayOfWeek = dailyLog.date.getUTCDay();
      const scheduleDay = schedule.days.find(
        (row) => row.dayOfWeek === dayOfWeek,
      );
      scheduledEnd = scheduledEndForDay(
        scheduleDay
          ? {
              dayOfWeek: scheduleDay.dayOfWeek,
              isWorkingDay: scheduleDay.isWorkingDay,
              isHalfDay: scheduleDay.isHalfDay,
              morningStart: scheduleDay.morningStart,
              morningEnd: scheduleDay.morningEnd,
              afternoonEnd: scheduleDay.afternoonEnd,
              totalHours: scheduleDay.totalHours,
            }
          : undefined,
      );
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
    });

    await this.prisma.attendanceDailyLog.update({
      where: { id: dailyLog.id },
      data: {
        flag,
        missingClockIn:
          !dailyLog.isHoliday &&
          !dailyLog.isWeekend &&
          !effectiveClockIn &&
          Boolean(effectiveClockOut),
        missingClockOut:
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
    }>;
    month: number;
    year: number;
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
      return { flaggedDays: [], month, year };
    }

    const flaggedDays = await this.prisma.attendanceDailyLog.findMany({
      where: {
        attendanceRecordId: record.id,
        flag: { not: 'NONE' },
        flagResolved: false,
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

    /** Active logs still block a new explanation for that day. */
    const blockingStatuses = new Set<FieldMovementStatus>([
      FieldMovementStatus.DRAFT,
      FieldMovementStatus.SUBMITTED,
      FieldMovementStatus.IN_REVIEW,
      FieldMovementStatus.RETURNED,
      FieldMovementStatus.APPROVED,
    ]);

    const flaggedDaysWithOptions = flaggedDays.map((day) => {
      const availableReasons: FieldMovementReason[] = [];

      if (day.flag === 'MISSING_CLOCK_IN') {
        availableReasons.push(
          FieldMovementReason.FIELD_VISIT,
          FieldMovementReason.FORGOT_CLOCK_IN,
        );
      } else if (day.flag === 'MISSING_CLOCK_OUT') {
        availableReasons.push(
          FieldMovementReason.FIELD_VISIT,
          FieldMovementReason.EARLY_LEAVE,
          FieldMovementReason.FORGOT_CLOCK_OUT,
        );
      } else if (day.flag === 'EARLY_LEAVE') {
        availableReasons.push(
          FieldMovementReason.FIELD_VISIT,
          FieldMovementReason.EARLY_LEAVE,
        );
      }

      const activeEntry = day.fieldMovementEntries.find((entry) =>
        blockingStatuses.has(entry.log.status),
      );
      const activeLog = activeEntry?.log ?? null;
      const pendingTier = activeLog?.approvalRequest?.tiers[0];
      const pendingApprover = pendingTier?.approver
        ? `${pendingTier.approver.firstName} ${pendingTier.approver.lastName}`.trim()
        : null;

      return {
        ...day,
        availableReasons,
        alreadySubmitted: activeLog != null,
        submittedLog: activeLog
          ? {
              id: activeLog.id,
              requestNumber: activeLog.requestNumber,
              status: activeLog.status,
              approvalRequestId: activeLog.approvalRequestId,
              pendingTierLabel: pendingTier?.label ?? null,
              pendingApproverName: pendingApprover,
            }
          : null,
      };
    });

    return { flaggedDays: flaggedDaysWithOptions, month, year };
  }

  /**
   * Creates a draft field movement / early departure log for the signed-in employee.
   */
  async createFieldMovementLog(
    dto: CreateFieldMovementLogDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const dailyLogIds = dto.entries.map((entry) => entry.dailyLogId);
    const uniqueIds = [...new Set(dailyLogIds)];
    if (uniqueIds.length !== dailyLogIds.length) {
      throw new BadRequestException('Duplicate daily log entries are not allowed');
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
      if (log.record.employeeId !== userId) {
        throw new ForbiddenException(
          'You can only submit logs for your own attendance',
        );
      }
      if (log.flag === 'NONE') {
        throw new BadRequestException(
          `Day ${log.date.toISOString().split('T')[0]} has no flag — no explanation needed`,
        );
      }
    }

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

    for (const entry of dto.entries) {
      const dailyLog = dailyLogs.find((log) => log.id === entry.dailyLogId);
      const dateLabel = dailyLog
        ? dailyLog.date.toISOString().split('T')[0]
        : entry.dailyLogId;

      if (entry.reason === FieldMovementReason.FIELD_VISIT) {
        if (!entry.destination?.trim()) {
          throw new BadRequestException(
            `Destination is required for field visit on ${dateLabel}`,
          );
        }
        if (entry.destination.trim().length < 3) {
          throw new BadRequestException(
            `Destination must be at least 3 characters for field visit on ${dateLabel}`,
          );
        }
      }
      if (
        entry.reason === FieldMovementReason.EARLY_LEAVE &&
        !entry.departureTime
      ) {
        throw new BadRequestException(
          'Departure time is required for early leave entries',
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

    return this.prisma.fieldMovementLog.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId: userId,
        month,
        year,
        status: FieldMovementStatus.DRAFT,
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
        entries: {
          create: dto.entries.map((entry) => {
            const dailyLog = dailyLogs.find((log) => log.id === entry.dailyLogId);
            if (!dailyLog) {
              throw new BadRequestException('Daily log not found for entry');
            }
            return {
              id: randomUUID(),
              dailyLogId: entry.dailyLogId,
              date: dailyLog.date,
              reason: entry.reason,
              destination: entry.destination ?? null,
              departureTime: entry.departureTime ?? null,
              returnTime: entry.returnTime ?? null,
              notes: entry.notes ?? null,
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
  }

  /**
   * Submits a draft/returned field movement log into the approval workflow.
   */
  async submitFieldMovementLog(
    logId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const log = await this.prisma.fieldMovementLog.findFirst({
      where: { id: logId, companyId, deletedAt: null },
      include: { entries: true },
    });

    if (!log) {
      throw new NotFoundException('Field movement log not found');
    }
    if (log.employeeId !== userId) {
      throw new ForbiddenException('Only the owner can submit this log');
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

    const resolvedTiers =
      await this.hrApprovalChain.buildFieldMovementApprovalChain(
        userId,
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
      },
    )) as { id: string };

    await this.prisma.fieldMovementLog.update({
      where: { id: logId },
      data: {
        status: FieldMovementStatus.SUBMITTED,
        approvalRequestId: approval.id,
        submittedAt: new Date(),
        updatedBy: userId,
      },
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
            lastName: true,
            employeeId: true,
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
                  select: { id: true, firstName: true, lastName: true },
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
    const isApprover =
      log.approvalRequest?.tiers?.some((tier) => tier.approverId === userId) ??
      false;

    if (!isHr && !isOwner && !isApprover) {
      throw new ForbiddenException('You do not have access to this log');
    }

    return log;
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

    const where: Prisma.FieldMovementLogWhereInput = {
      companyId,
      deletedAt: null,
      ...(isHr ? {} : { employeeId: userId }),
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
              lastName: true,
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
      if (log.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: log.approvalRequestId },
          data: { status: 'CANCELLED' },
        });
      }
    });

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
      await this.prisma.fieldMovementLog.update({
        where: { id: log.id },
        data: {
          status: FieldMovementStatus.REJECTED,
          completedAt: now,
          updatedBy: log.employeeId,
        },
      });
    } else if (decision === 'RETURNED') {
      await this.prisma.fieldMovementLog.update({
        where: { id: log.id },
        data: {
          status: FieldMovementStatus.RETURNED,
          updatedBy: log.employeeId,
        },
      });
    }
  }

  /**
   * Approves a field movement log and applies daily-log corrections in one transaction.
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

      for (const entry of log.entries) {
        await this.applyEntryCorrection(tx, entry, log.employeeId, now);
      }

      await this.recalculateAttendanceRecord(
        tx,
        log.employeeId,
        log.companyId,
        log.month,
        log.year,
      );
    });
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
        data.correctedClockOutLocal = scheduledEnd;
        data.missingClockOut = false;
        break;

      case FieldMovementReason.FORGOT_CLOCK_IN:
        data.correctedClockInLocal = scheduledStart;
        data.missingClockIn = false;
        break;

      case FieldMovementReason.EARLY_LEAVE:
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
   * Rebuilds AttendanceRecord summary counters from current daily logs.
   */
  private async recalculateAttendanceRecord(
    tx: Prisma.TransactionClient,
    employeeId: string,
    companyId: string,
    month: number,
    year: number,
  ): Promise<void> {
    const record = await tx.attendanceRecord.findUnique({
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

    const workingDayLogs = record.dailyLogs.filter(
      (log) => !log.isWeekend && !log.isHoliday,
    );
    const holidayLogs = record.dailyLogs.filter((log) => log.isHoliday);

    const scheduledDays = workingDayLogs.reduce(
      (sum, log) => sum + (log.isHalfDay ? 0.5 : 1),
      0,
    );

    const presentDays = workingDayLogs
      .filter((log) => log.wasPresent)
      .reduce((sum, log) => sum + (log.isHalfDay ? 0.5 : 1), 0);

    const absentDays = Math.max(0, scheduledDays - presentDays);
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

    const flaggedDays = record.dailyLogs.filter(
      (log) => log.flag !== AttendanceDayFlag.NONE && !log.flagResolved,
    ).length;

    const resolvedDays = record.dailyLogs.filter(
      (log) => log.flagResolved,
    ).length;

    let payableHours = 0;
    for (const log of record.dailyLogs) {
      const wouldBeWorkingDay = !log.isWeekend;
      if (log.isHoliday && wouldBeWorkingDay) {
        payableHours += Number(log.scheduledHours);
      } else if (!log.isHoliday && !log.isWeekend && log.recordedHours != null) {
        payableHours += Number(log.recordedHours);
      }
    }

    await tx.attendanceRecord.update({
      where: { id: record.id },
      data: {
        scheduledDays,
        presentDays,
        absentDays,
        holidayDays,
        lateDays,
        totalLateMinutes,
        earlyLeaveDays,
        missingClockInDays,
        missingClockOutDays,
        flaggedDays,
        resolvedDays,
        payableHours: Math.round(payableHours * 100) / 100,
      },
    });
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
}
