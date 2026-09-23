import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
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
  minutesBetween,
} from '../../utils/time.util';
import {
  ConfirmAttendanceImportDto,
  ListAttendanceDto,
} from '../dtos/attendance.dto';
import {
  AttendanceMatchResult,
  AttendanceMatchingService,
} from './attendance-matching.service';
import { AttendancePreviewCache } from './attendance-preview.cache';

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
}

type CachedAttendancePreview = AttendancePreviewResult & {
  companyId: string;
};

type ScheduleDayLike = {
  dayOfWeek: number;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  totalHours: Prisma.Decimal | number;
};

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
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: AttendanceMatchingService,
    private readonly workScheduleService: WorkScheduleService,
    private readonly permissionService: PermissionService,
    private readonly previewCache: AttendancePreviewCache,
  ) {}

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
      scheduleDays = schedule.days;
    } catch {
      scheduleDays = this.fallbackWeekdaySchedule();
    }

    const logs: AttendanceDailyLogInput[] = [];

    for (const day of rawDailyData) {
      const date =
        day.date instanceof Date ? day.date : new Date(String(day.date));
      const dayOfWeek = date.getUTCDay();
      const scheduleDay = scheduleDays.find(
        (row) => row.dayOfWeek === dayOfWeek,
      );

      const isWeekend = !(scheduleDay?.isWorkingDay ?? false);
      const isHalfDay = scheduleDay?.isHalfDay ?? false;
      const scheduledHours = Number(scheduleDay?.totalHours ?? 0);

      const matchedHoliday = applicableHolidays.find((holiday) =>
        holidayFallsOnDate(holiday.date, holiday.isRecurring, date),
      );
      const isHoliday = Boolean(matchedHoliday);

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
        !isHoliday &&
        !isWeekend &&
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
        missingClockIn:
          !isHoliday && !isWeekend && !wasPresent && Boolean(day.clockOutLocal),
        missingClockOut: wasPresent && !day.clockOutLocal,
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

    const prepared = await Promise.all(
      rowsToImport.map(async (row) => {
        const { logs, summary } = await this.calculateDailyLogs(
          row.matchedEmployeeId,
          companyId,
          row.data.dailyData ?? [],
          month,
          year,
        );
        return {
          row,
          logs,
          summary,
          recordId: randomUUID(),
        };
      }),
    );

    await this.prisma.$transaction(
      async (tx) => {
        if (existing && dto.overwrite) {
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
              payableHours: item.row.data.payableHours,
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

  private fallbackWeekdaySchedule(): ScheduleDayLike[] {
    return [
      {
        dayOfWeek: 0,
        isWorkingDay: false,
        isHalfDay: false,
        morningStart: null,
        totalHours: 0,
      },
      {
        dayOfWeek: 1,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 2,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 3,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 4,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 5,
        isWorkingDay: true,
        isHalfDay: false,
        morningStart: '08:30',
        totalHours: 8,
      },
      {
        dayOfWeek: 6,
        isWorkingDay: true,
        isHalfDay: true,
        morningStart: '08:30',
        totalHours: 4,
      },
    ];
  }
}
