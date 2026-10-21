import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  HolidayNationality,
  Nationality,
  Prisma,
  WorkScheduleCheckMode,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  AssignScheduleDto,
  CreateWorkScheduleDto,
  UpdateWorkScheduleDto,
  WorkScheduleDayDto,
} from '../dtos/create-work-schedule.dto';
import { PreviewDaysDto } from '../dtos/preview-days.dto';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import {
  addUtcDays,
  computeAndValidateDayHours,
  dateRangesOverlap,
  formatDateOnly,
  holidayAppliesToNationality,
  holidayFallsOnDate,
  iterateUtcDays,
  parseDateOnly,
  todayUtc,
  toUtcDateOnly,
  type DayBreakdown,
  type WorkingDaysResult,
} from './work-schedule.dates';
import {
  calculateLeaveDaysForRange,
  calculateLeaveDaysFromPeriods,
  summarizeLeaveBreakdown,
  type LeaveDayPortion,
  type LeaveDaysResult,
} from '../../../leave/application/utils/leave-days.util';
import {
  defaultScheduleDayFlags,
  getDayKind as classifyDayKind,
  type DayKind,
} from '../utils/get-day-kind.util';

type ScheduleWithDays = Prisma.WorkScheduleGetPayload<{
  include: { days: true };
}>;

/** A weekday row after validation, ready to persist. */
type NormalizedScheduleDay = {
  dayOfWeek: number;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  totalHours: Prisma.Decimal;
};

/** Check mode + latest scan time after validation, ready to persist. */
type NormalizedCheckMode = {
  checkMode: WorkScheduleCheckMode;
  latestScanTime: string | null;
};

/** Recalc start when an employee's assignment start on a schedule is unknown. */
const RECALC_FROM_ALL_IMPORTED = new Date(Date.UTC(2000, 0, 1));

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

type HolidayRow = {
  id: string;
  name: string;
  nameZh: string | null;
  date: Date;
  isRecurring: boolean;
  appliesToNationality: HolidayNationality;
};

const SCHEDULE_INCLUDE = {
  days: { orderBy: { dayOfWeek: 'asc' as const } },
} as const;

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  chineseName: true,
  email: true,
  employeeId: true,
  nationality: true,
} as const;

/**
 * Company work schedules, employee assignments, and working-day calculation.
 * Leave, overtime, and attendance must call this service - never hardcode weekends
 * or holidays in those modules. When a company has no schedule configured, day
 * counts temporarily use a Mon–Fri fallback so leave requests are not blocked.
 */
@Injectable()
export class WorkScheduleService {
  private readonly logger = new Logger(WorkScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    @Inject(forwardRef(() => OnBehalfService))
    private readonly onBehalfService: OnBehalfService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Active schedule for an employee on a date (assignment, else company default).
   */
  async getActiveSchedule(
    employeeId: string,
    companyId: string,
    date?: Date,
  ): Promise<ScheduleWithDays> {
    const onDate = toUtcDateOnly(date ?? todayUtc());
    const resolve = await this.createActiveScheduleResolver(
      employeeId,
      companyId,
      onDate,
      onDate,
    );
    const schedule = resolve(onDate);
    if (!schedule) {
      throw new NotFoundException(
        'No work schedule found for this employee and no company default is set',
      );
    }
    return schedule;
  }

  /**
   * Prefetches overlapping assignments + company default once, then resolves
   * any date in the range synchronously (no further DB reads).
   */
  async createActiveScheduleResolver(
    employeeId: string,
    companyId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<(date: Date) => ScheduleWithDays | null> {
    const start = toUtcDateOnly(rangeStart);
    const end = toUtcDateOnly(rangeEnd);

    const [assignments, companyDefault] = await Promise.all([
      this.prisma.employeeScheduleAssignment.findMany({
        where: {
          companyId,
          employeeId,
          effectiveFrom: { lte: end },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
          schedule: activeOnly({ companyId, isActive: true }),
        },
        orderBy: { effectiveFrom: 'desc' },
        include: {
          schedule: { include: SCHEDULE_INCLUDE },
        },
      }),
      this.prisma.workSchedule.findFirst({
        where: activeOnly({ companyId, isDefault: true, isActive: true }),
        include: SCHEDULE_INCLUDE,
      }),
    ]);

    return (date: Date): ScheduleWithDays | null => {
      const onDate = toUtcDateOnly(date);
      const match = assignments.find(
        (assignment) =>
          assignment.effectiveFrom <= onDate &&
          (assignment.effectiveTo == null ||
            assignment.effectiveTo >= onDate),
      );
      return match?.schedule ?? companyDefault ?? null;
    };
  }

  /**
   * Working-day weights between two inclusive dates for one employee.
   * Leave balance charging uses the same schedule/holiday rules.
   */
  async calculateWorkingDays(
    employeeId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
    dayPortion: LeaveDayPortion = 'FULL',
  ): Promise<WorkingDaysResult> {
    const start = toUtcDateOnly(startDate);
    const end = toUtcDateOnly(endDate);
    const ctx = await this.buildLeaveDayContext(employeeId, companyId, start, end);
    return calculateLeaveDaysForRange(
      start,
      end,
      ctx.resolveScheduleDay,
      ctx.holidays,
      dayPortion,
    );
  }

  /**
   * Canonical leave-day calculation for submit, preview, and balance deduction.
   * Never trust client-sent day counts.
   */
  async calculateLeaveDays(
    employeeId: string,
    companyId: string,
    periods: Array<{
      startDate: string;
      endDate: string;
      dayPortion?: LeaveDayPortion;
    }>,
  ): Promise<LeaveDaysResult> {
    if (periods.length === 0) {
      throw new BadRequestException('At least one leave period is required');
    }
    this.assertPeriodsDoNotOverlap(periods);

    const parsed = periods.map((period) => ({
      startDate: parseDateOnly(period.startDate),
      endDate: parseDateOnly(period.endDate),
      dayPortion: (period.dayPortion ?? 'FULL') as LeaveDayPortion,
    }));
    const rangeStart = parsed.reduce(
      (min, p) => (p.startDate.getTime() < min.getTime() ? p.startDate : min),
      parsed[0].startDate,
    );
    const rangeEnd = parsed.reduce(
      (max, p) => (p.endDate.getTime() > max.getTime() ? p.endDate : max),
      parsed[0].endDate,
    );

    const ctx = await this.buildLeaveDayContext(
      employeeId,
      companyId,
      rangeStart,
      rangeEnd,
    );

    return calculateLeaveDaysFromPeriods(
      parsed,
      ctx.resolveScheduleDay,
      ctx.holidays,
    );
  }

  /**
   * Expected working hours for an employee on a specific date.
   */
  async calculateWorkingHours(
    employeeId: string,
    companyId: string,
    date: Date,
  ): Promise<number> {
    const onDate = toUtcDateOnly(date);
    const result = await this.calculateWorkingDays(
      employeeId,
      companyId,
      onDate,
      onDate,
    );
    const day = result.breakdown[0];
    if (!day || day.type === 'holiday' || day.type === 'weekend') {
      return 0;
    }

    const schedule = await this.getActiveScheduleOrWeekdayFallback(
      employeeId,
      companyId,
      onDate,
    );
    const weekday = schedule.days.find(
      (row) => row.dayOfWeek === onDate.getUTCDay(),
    );
    if (!weekday) {
      return 0;
    }
    if (day.type === 'half') {
      return weekday.isHalfDay ? Number(weekday.totalHours) : 4;
    }
    return Number(weekday.totalHours);
  }

  /**
   * Whether `date` is an active public holiday for this nationality.
   * Null nationality only matches holidays with appliesToNationality = ALL.
   */
  async isHolidayForEmployee(
    companyId: string,
    nationality: Nationality | null,
    date: Date,
  ): Promise<{ isHoliday: boolean; holidayName: string | null }> {
    const onDate = toUtcDateOnly(date);
    const holidays = await this.loadActiveHolidays(companyId);
    const match = holidays.find(
      (holiday) =>
        holidayAppliesToNationality(
          holiday.appliesToNationality,
          nationality,
        ) && holidayFallsOnDate(holiday.date, holiday.isRecurring, onDate),
    );
    if (!match) {
      return { isHoliday: false, holidayName: null };
    }
    return { isHoliday: true, holidayName: match.name };
  }

  /**
   * Active public holidays in range that apply to a nationality.
   * Recurring holidays match month and day across any year.
   */
  async getHolidaysInRange(
    companyId: string,
    nationality: Nationality | null,
    startDate: Date,
    endDate: Date,
  ): Promise<HolidayRow[]> {
    const start = toUtcDateOnly(startDate);
    const end = toUtcDateOnly(endDate);
    const holidays = await this.loadActiveHolidays(companyId);
    return holidays.filter((holiday) => {
      if (!holidayAppliesToNationality(holiday.appliesToNationality, nationality)) {
        return false;
      }
      const days = iterateUtcDays(start, end);
      return days.some((day) =>
        holidayFallsOnDate(holiday.date, holiday.isRecurring, day),
      );
    });
  }

  /**
   * Holidays whose next occurrence falls within the next `daysAhead` days.
   */
  async getUpcomingHolidays(
    companyId: string,
    daysAhead = 7,
  ): Promise<
    Array<
      HolidayRow & {
        occurrenceDate: Date;
        daysUntil: number;
        notifyDaysBefore: number;
      }
    >
  > {
    const today = todayUtc();
    const windowEnd = addUtcDays(today, daysAhead);
    const holidays = await this.prisma.publicHoliday.findMany({
      where: activeOnly({ companyId, isActive: true }),
    });

    const upcoming: Array<
      HolidayRow & {
        occurrenceDate: Date;
        daysUntil: number;
        notifyDaysBefore: number;
      }
    > = [];

    for (const holiday of holidays) {
      const occurrence = this.nextOccurrence(holiday.date, holiday.isRecurring, today);
      if (occurrence.getTime() < today.getTime() || occurrence.getTime() > windowEnd.getTime()) {
        continue;
      }
      upcoming.push({
        id: holiday.id,
        name: holiday.name,
        nameZh: holiday.nameZh,
        date: holiday.date,
        isRecurring: holiday.isRecurring,
        appliesToNationality: holiday.appliesToNationality,
        occurrenceDate: occurrence,
        daysUntil: Math.round(
          (occurrence.getTime() - today.getTime()) / 86_400_000,
        ),
        notifyDaysBefore: holiday.notifyDaysBefore,
      });
    }

    upcoming.sort(
      (a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime(),
    );
    return upcoming;
  }

  /**
   * Preview working-day totals for one or more periods.
   */
  async previewDays(
    dto: PreviewDaysDto,
    companyId: string,
    actorUserId: string,
  ): Promise<{
    totalDays: number;
    periods: Array<{
      startDate: string;
      endDate: string;
      days: number;
      dayPortion: LeaveDayPortion;
      breakdown: Array<{
        date: string;
        type: DayBreakdown['type'];
        holidayName?: string;
        weight: number;
      }>;
    }>;
    summary: {
      totalDays: number;
      workingDays: number;
      halfDays: number;
      weekendDays: number;
      holidayDays: number;
    };
  }> {
    const employeeId = await this.resolvePreviewEmployee(
      dto.employeeId,
      companyId,
      actorUserId,
    );
    this.assertPeriodsDoNotOverlap(dto.periods);

    let totalDays = 0;
    const periods: Array<{
      startDate: string;
      endDate: string;
      days: number;
      dayPortion: LeaveDayPortion;
      breakdown: Array<{
        date: string;
        type: DayBreakdown['type'];
        holidayName?: string;
        weight: number;
      }>;
    }> = [];

    for (const period of dto.periods) {
      const start = parseDateOnly(period.startDate);
      const end = parseDateOnly(period.endDate);
      const dayPortion = period.dayPortion ?? 'FULL';
      const result = await this.calculateWorkingDays(
        employeeId,
        companyId,
        start,
        end,
        dayPortion,
      );
      const days = Number(result.totalDays);
      totalDays += days;
      periods.push({
        startDate: formatDateOnly(start),
        endDate: formatDateOnly(end),
        days,
        dayPortion,
        breakdown: result.breakdown.map((row) => ({
          date: formatDateOnly(row.date),
          type: row.type,
          holidayName: row.holidayName,
          weight: row.weight,
        })),
      });
    }

    return {
      totalDays: Math.round(totalDays * 10) / 10,
      periods,
      summary: summarizeLeaveBreakdown(
        periods.flatMap((p) =>
          p.breakdown.map((row) => ({
            date: parseDateOnly(row.date),
            type: row.type,
            holidayName: row.holidayName,
            weight: row.weight,
          })),
        ),
      ),
    };
  }

  /**
   * Creates a work schedule with seven weekday rows.
   */
  async createSchedule(
    dto: CreateWorkScheduleDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const mode = this.normalizeCheckMode(dto.checkMode, dto.latestScanTime);
    const days = this.normalizeDays(dto.days, mode.checkMode);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.workSchedule.updateMany({
            where: activeOnly({ companyId, isDefault: true }),
            data: { isDefault: false, updatedBy: userId },
          });
        }

        return tx.workSchedule.create({
          data: {
            id: randomUUID(),
            companyId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            isDefault: dto.isDefault ?? false,
            isActive: dto.isActive ?? true,
            ...mode,
            createdBy: userId,
            updatedBy: userId,
            days: {
              create: days.map((day) => ({
                id: randomUUID(),
                ...day,
              })),
            },
          },
          include: SCHEDULE_INCLUDE,
        });
      });
      return this.mapSchedule(created, 0);
    } catch (error: unknown) {
      const revived = await this.reviveDeletedSchedule(
        dto,
        days,
        mode,
        companyId,
        userId,
        error,
      );
      if (revived) {
        return revived;
      }
      this.throwIfUniqueName(error);
      throw error;
    }
  }

  /**
   * The company+name unique key ignores `deletedAt`, so a deleted schedule
   * still holds its name. Re-creating that name reuses the row.
   */
  private async reviveDeletedSchedule(
    dto: CreateWorkScheduleDto,
    days: NormalizedScheduleDay[],
    mode: NormalizedCheckMode,
    companyId: string,
    userId: string,
    error: unknown,
  ): Promise<Record<string, unknown> | null> {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return null;
    }

    const deleted = await this.prisma.workSchedule.findFirst({
      where: {
        companyId,
        name: dto.name.trim(),
        deletedAt: { not: null },
      },
    });
    if (!deleted) {
      return null;
    }

    const revived = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.workSchedule.updateMany({
          where: activeOnly({ companyId, isDefault: true, id: { not: deleted.id } }),
          data: { isDefault: false, updatedBy: userId },
        });
      }

      await tx.workScheduleDay.deleteMany({ where: { scheduleId: deleted.id } });
      await tx.workScheduleDay.createMany({
        data: days.map((day) => ({
          id: randomUUID(),
          scheduleId: deleted.id,
          ...day,
        })),
      });

      return tx.workSchedule.update({
        where: { id: deleted.id },
        data: {
          description: dto.description?.trim() || null,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
          ...mode,
          deletedAt: null,
          deletedBy: null,
          updatedBy: userId,
        },
        include: SCHEDULE_INCLUDE,
      });
    });

    return this.mapSchedule(revived, 0);
  }

  /**
   * Updates schedule metadata and optionally replaces weekday rows.
   */
  async updateSchedule(
    id: string,
    dto: UpdateWorkScheduleDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const existing = await this.findScheduleOrThrow(id, companyId);
    const mode = this.normalizeCheckMode(
      dto.checkMode ?? existing.checkMode,
      dto.latestScanTime !== undefined
        ? dto.latestScanTime
        : existing.latestScanTime,
    );
    const days = dto.days
      ? this.normalizeDays(dto.days, mode.checkMode)
      : null;
    if (!days && mode.checkMode !== existing.checkMode) {
      // Switching back to STANDARD needs both windows on full working days.
      this.normalizeDays(existing.days, mode.checkMode);
    }
    const checkModeChanged =
      mode.checkMode !== existing.checkMode ||
      mode.latestScanTime !== existing.latestScanTime;

    if (dto.isActive === false && existing.isDefault) {
      throw new BadRequestException(
        'The default work schedule cannot be deactivated. Set another schedule as the company default first.',
      );
    }

    if (dto.isDefault === false && existing.isDefault) {
      throw new BadRequestException(
        'The company default is transferred by setting another schedule as default, not by clearing this one.',
      );
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.workSchedule.updateMany({
            where: activeOnly({
              companyId,
              isDefault: true,
              id: { not: id },
            }),
            data: { isDefault: false, updatedBy: userId },
          });
        }

        if (days) {
          await tx.workScheduleDay.deleteMany({ where: { scheduleId: id } });
          await tx.workScheduleDay.createMany({
            data: days.map((day) => ({
              id: randomUUID(),
              scheduleId: id,
              ...day,
            })),
          });
        }

        return tx.workSchedule.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description?.trim() || null }
              : {}),
            ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            ...mode,
            updatedBy: userId,
          },
          include: SCHEDULE_INCLUDE,
        });
      });

      const assignedCount = await this.countAssignedEmployees(id, companyId);
      const mapped = this.mapSchedule(updated, assignedCount);

      let attendanceRecalc: {
        employeesUpdated: number;
        updatedRecords: number;
        updatedDays: number;
        skippedLockedMonths: number;
      } | null = null;

      // Timing / check-mode changes re-evaluate imported months (approved or
      // payroll-locked months are only flagged stale). Opt out with false.
      if (dto.recalculateAttendance !== false && (days || checkModeChanged)) {
        const fixedFrom = dto.recalculateFrom
          ? parseDateOnly(dto.recalculateFrom)
          : null;
        const targets = await this.listRecalcTargets(
          id,
          companyId,
          updated.isDefault,
        );
        let updatedRecords = 0;
        let updatedDays = 0;
        let skippedLockedMonths = 0;
        let employeesUpdated = 0;

        for (const [employeeId, assignedFrom] of targets) {
          const result =
            await this.attendanceService.recalculateEmployeeAttendanceFromDate(
              employeeId,
              companyId,
              fixedFrom ?? assignedFrom,
            );
          if (result.updatedRecords > 0 || result.updatedDays > 0) {
            employeesUpdated += 1;
          }
          updatedRecords += result.updatedRecords;
          updatedDays += result.updatedDays;
          skippedLockedMonths += result.skippedLockedMonths;
        }

        attendanceRecalc = {
          employeesUpdated,
          updatedRecords,
          updatedDays,
          skippedLockedMonths,
        };
      }

      return {
        ...mapped,
        attendanceRecalc,
      };
    } catch (error: unknown) {
      this.throwIfUniqueName(error);
      throw error;
    }
  }

  /**
   * Deactivates a schedule (kept listed; ignored by the calculation engine).
   */
  async deactivateSchedule(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    return this.updateSchedule(id, { isActive: false }, companyId, userId);
  }

  /**
   * Deletes a schedule (soft delete) and moves everyone on it to the company
   * default. The default itself cannot be deleted - another schedule must be
   * made default first, which is also how the default is transferred.
   */
  async removeSchedule(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<{
    movedEmployees: number;
    defaultScheduleId: string;
    defaultScheduleName: string;
  }> {
    const schedule = await this.findScheduleOrThrow(id, companyId);
    if (schedule.isDefault) {
      throw new BadRequestException(
        'The default work schedule cannot be deleted. Set another schedule as the company default first.',
      );
    }

    const fallback = await this.prisma.workSchedule.findFirst({
      where: activeOnly({
        companyId,
        isDefault: true,
        isActive: true,
        id: { not: id },
      }),
    });
    if (!fallback) {
      throw new BadRequestException(
        'Set a company default work schedule before deleting this one, so its employees have a schedule to fall back to.',
      );
    }

    const today = todayUtc();
    const openAssignments =
      await this.prisma.employeeScheduleAssignment.findMany({
        where: {
          companyId,
          scheduleId: id,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
      });
    const employeesByFk = await this.prisma.user.findMany({
      where: { companyId, workScheduleId: id, deletedAt: null },
      select: { id: true },
    });
    const employeeIds = new Set<string>([
      ...openAssignments.map((row) => row.employeeId),
      ...employeesByFk.map((row) => row.id),
    ]);

    await this.prisma.$transaction(async (tx) => {
      for (const assignment of openAssignments) {
        const closeOn = addUtcDays(today, -1);
        await tx.employeeScheduleAssignment.update({
          where: { id: assignment.id },
          data: {
            effectiveTo:
              closeOn.getTime() < assignment.effectiveFrom.getTime()
                ? assignment.effectiveFrom
                : closeOn,
          },
        });
      }

      for (const employeeId of employeeIds) {
        await tx.employeeScheduleAssignment.create({
          data: {
            id: randomUUID(),
            companyId,
            employeeId,
            scheduleId: fallback.id,
            effectiveFrom: today,
            notes: 'Moved to the company default; previous schedule deleted',
            createdBy: userId,
          },
        });
      }

      if (employeeIds.size > 0) {
        await tx.user.updateMany({
          where: { companyId, workScheduleId: id },
          data: { workScheduleId: fallback.id, updatedBy: userId },
        });
      }

      await tx.workSchedule.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
          updatedBy: userId,
        },
      });
    });

    return {
      movedEmployees: employeeIds.size,
      defaultScheduleId: fallback.id,
      defaultScheduleName: fallback.name,
    };
  }

  /**
   * Marks this schedule as the company default (unsets the previous default).
   */
  async setDefault(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    return this.updateSchedule(id, { isDefault: true, isActive: true }, companyId, userId);
  }

  /**
   * Lists company schedules with weekly hours and assigned-employee counts.
   */
  async listSchedules(companyId: string): Promise<unknown[]> {
    const today = todayUtc();
    const rows = await this.prisma.workSchedule.findMany({
      where: activeOnly({ companyId }),
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        days: { orderBy: { dayOfWeek: 'asc' } },
        assignments: {
          where: {
            effectiveFrom: { lte: today },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
          },
          select: { employeeId: true },
        },
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
          },
        },
      },
    });

    return rows.map((row) => {
      const assignedIds = new Set(row.assignments.map((item) => item.employeeId));
      return this.mapSchedule(
        row,
        Math.max(assignedIds.size, row._count.employees),
      );
    });
  }

  /**
   * One schedule with weekday breakdown.
   */
  async getSchedule(id: string, companyId: string): Promise<unknown> {
    const schedule = await this.findScheduleOrThrow(id, companyId);
    const assignedCount = await this.countAssignedEmployees(id, companyId);
    return this.mapSchedule(schedule, assignedCount);
  }

  /**
   * Assigns a schedule to an employee, closing the previous open assignment.
   */
  async assignToEmployee(
    scheduleId: string,
    dto: AssignScheduleDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const schedule = await this.findScheduleOrThrow(scheduleId, companyId);
    if (!schedule.isActive) {
      throw new BadRequestException('Cannot assign an inactive work schedule');
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: dto.employeeId, companyId }),
      select: { id: true, workScheduleId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const effectiveFrom = parseDateOnly(dto.effectiveFrom);
    const today = todayUtc();

    const current = await this.prisma.employeeScheduleAssignment.findFirst({
      where: {
        companyId,
        employeeId: dto.employeeId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // if (current && current.effectiveFrom.getTime() >= effectiveFrom.getTime()) {
    //   throw new BadRequestException(
    //     'New assignment must start after the current assignment effective-from date',
    //   );
    // }

    const created = await this.prisma.$transaction(async (tx) => {
      if (current && (current.effectiveTo === null || current.effectiveTo.getTime() >= effectiveFrom.getTime())) {
        const closeOn = addUtcDays(effectiveFrom, -1);
        await tx.employeeScheduleAssignment.update({
          where: { id: current.id },
          data: {
            effectiveTo:
              closeOn.getTime() < current.effectiveFrom.getTime()
                ? current.effectiveFrom
                : closeOn,
          },
        });
      }

      const assignment = await tx.employeeScheduleAssignment.create({
        data: {
          id: randomUUID(),
          companyId,
          employeeId: dto.employeeId,
          scheduleId,
          effectiveFrom,
          notes: dto.notes?.trim() || null,
          createdBy: userId,
        },
        include: {
          schedule: { include: SCHEDULE_INCLUDE },
          employee: { select: USER_SELECT },
        },
      });

      if (effectiveFrom.getTime() <= today.getTime()) {
        await tx.user.update({
          where: { id: dto.employeeId },
          data: { workScheduleId: scheduleId, updatedBy: userId },
        });
      }

      return assignment;
    });

    let attendanceRecalc: {
      updatedRecords: number;
      updatedDays: number;
      skippedLockedMonths: number;
    } | null = null;

    if (dto.recalculateAttendance !== false) {
      attendanceRecalc =
        await this.attendanceService.recalculateEmployeeAttendanceFromDate(
          dto.employeeId,
          companyId,
          effectiveFrom,
        );
    }

    return {
      ...this.mapAssignment(created),
      attendanceRecalc,
    };
  }

  /**
   * Applies a work schedule from the employee add/edit form.
   * Same-day corrections update the open assignment in place.
   */
  async syncEmployeeSchedule(
    employeeId: string,
    scheduleId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const schedule = await this.findScheduleOrThrow(scheduleId, companyId);
    if (!schedule.isActive) {
      throw new BadRequestException('Cannot assign an inactive work schedule');
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true, workScheduleId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const today = todayUtc();
    const current = await this.prisma.employeeScheduleAssignment.findFirst({
      where: {
        companyId,
        employeeId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (
      current?.scheduleId === scheduleId &&
      employee.workScheduleId === scheduleId
    ) {
      return;
    }

    if (current && current.effectiveFrom.getTime() === today.getTime()) {
      await this.prisma.$transaction(async (tx) => {
        await tx.employeeScheduleAssignment.update({
          where: { id: current.id },
          data: { scheduleId },
        });
        await tx.user.update({
          where: { id: employeeId },
          data: { workScheduleId: scheduleId, updatedBy: userId },
        });
      });
      await this.attendanceService.recalculateEmployeeAttendanceFromDate(
        employeeId,
        companyId,
        current.effectiveFrom,
      );
      return;
    }

    await this.assignToEmployee(
      scheduleId,
      {
        employeeId,
        effectiveFrom: formatDateOnly(today),
        notes: 'Assigned from employee profile',
      },
      companyId,
      userId,
    );
  }

  /**
   * Current schedule plus assignment history for an employee.
   */
  async getEmployeeSchedule(
    employeeId: string,
    companyId: string,
  ): Promise<unknown> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: USER_SELECT,
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const current = await this.getActiveSchedule(employeeId, companyId);
    const history = await this.prisma.employeeScheduleAssignment.findMany({
      where: { companyId, employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        schedule: { select: { id: true, name: true, isDefault: true, isActive: true } },
      },
    });

    return {
      employee,
      current: this.mapSchedule(current, 0),
      history: history.map((row) => ({
        id: row.id,
        scheduleId: row.scheduleId,
        scheduleName: row.schedule.name,
        isDefault: row.schedule.isDefault,
        isActive: row.schedule.isActive,
        effectiveFrom: formatDateOnly(row.effectiveFrom),
        effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
        notes: row.notes,
        createdAt: row.createdAt,
      })),
    };
  }

  /**
   * Active schedule for the signed-in employee (assignment, else company
   * default) with its days. Returns null when neither exists.
   */
  async getMySchedule(
    userId: string,
    companyId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const schedule = await this.getActiveSchedule(userId, companyId);
      return this.mapSchedule(schedule, 0);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Validates periods, calculates each via the schedule engine, and returns totals.
   */
  async resolveLeavePeriods(
    employeeId: string,
    companyId: string,
    periods: Array<{
      startDate: string;
      endDate: string;
      dayPortion?: LeaveDayPortion;
    }>,
  ): Promise<{
    startDate: Date;
    endDate: Date;
    days: number;
    periodRows: Array<{
      startDate: Date;
      endDate: Date;
      days: number;
      dayPortion: LeaveDayPortion;
    }>;
    breakdown: WorkingDaysResult['breakdown'];
  }> {
    const result = await this.calculateLeaveDays(
      employeeId,
      companyId,
      periods,
    );
    return {
      startDate: result.startDate,
      endDate: result.endDate,
      days: result.days,
      periodRows: result.periodRows.map((row) => ({
        startDate: row.startDate,
        endDate: row.endDate,
        days: row.days,
        dayPortion: row.dayPortion,
      })),
      breakdown: result.breakdown,
    };
  }

  /**
   * Loads nationality-filtered holidays and a warmed per-date schedule resolver.
   */
  private async buildLeaveDayContext(
    employeeId: string,
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<{
    resolveScheduleDay: (date: Date) => {
      isWorkingDay: boolean;
      isHalfDay: boolean;
    } | null;
    holidays: Array<{ date: Date; isRecurring: boolean; name: string }>;
  }> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true, nationality: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const holidayRows = await this.loadActiveHolidays(companyId);
    const holidays = holidayRows
      .filter((holiday) =>
        holidayAppliesToNationality(
          holiday.appliesToNationality,
          employee.nationality,
        ),
      )
      .map((holiday) => ({
        date: holiday.date,
        isRecurring: holiday.isRecurring,
        name: holiday.name,
      }));

    const resolveActive = await this.createActiveScheduleResolver(
      employeeId,
      companyId,
      from,
      to,
    );
    let weekdayFallback: ScheduleWithDays | null = null;

    const resolveScheduleDay = (date: Date) => {
      let schedule = resolveActive(date);
      if (!schedule) {
        if (!weekdayFallback) {
          weekdayFallback = this.weekdayFallbackSchedule(companyId);
        }
        schedule = weekdayFallback;
      }
      const weekday = schedule.days.find(
        (row) => row.dayOfWeek === date.getUTCDay(),
      );
      if (!weekday) {
        return null;
      }
      return {
        isWorkingDay: weekday.isWorkingDay,
        isHalfDay: weekday.isHalfDay,
      };
    };

    return { resolveScheduleDay, holidays };
  }

  private async resolvePreviewEmployee(
    requestedId: string | undefined,
    companyId: string,
    actorUserId: string,
  ): Promise<string> {
    if (!requestedId || requestedId === actorUserId) {
      return actorUserId;
    }
    const canEditSchedules = await this.permissionService.hasPermission(
      actorUserId,
      companyId,
      'work-schedule',
      'edit',
    );
    const canFileOnBehalf =
      canEditSchedules ||
      (await this.onBehalfService.isEligibleFor(
        actorUserId,
        requestedId,
        companyId,
      ));
    if (!canFileOnBehalf) {
      throw new BadRequestException(
        'You can only preview working days for your own schedule',
      );
    }
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: requestedId, companyId }),
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee.id;
  }

  assertPeriodsDoNotOverlap(
    periods: Array<{ startDate: string; endDate: string }>,
  ): void {
    const parsed = periods.map((period) => {
      const start = parseDateOnly(period.startDate);
      const end = parseDateOnly(period.endDate);
      if (end.getTime() < start.getTime()) {
        throw new BadRequestException('endDate must be on or after startDate');
      }
      return { start, end };
    });

    for (let i = 0; i < parsed.length; i += 1) {
      for (let j = i + 1; j < parsed.length; j += 1) {
        if (
          dateRangesOverlap(
            parsed[i].start,
            parsed[i].end,
            parsed[j].start,
            parsed[j].end,
          )
        ) {
          throw new BadRequestException('Leave periods must not overlap');
        }
      }
    }
  }

  private async getCachedSchedule(
    employeeId: string,
    companyId: string,
    date: Date,
    cache: Map<string, ScheduleWithDays>,
  ): Promise<ScheduleWithDays> {
    const key = formatDateOnly(date);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const schedule = await this.getActiveScheduleOrWeekdayFallback(
      employeeId,
      companyId,
      date,
    );
    cache.set(key, schedule);
    return schedule;
  }

  /**
   * Assigned or company-default schedule, else Mon–Sat (Sat half) so leave /
   * overtime day counts match legacy attendance when HR has not configured a
   * schedule yet.
   */
  private async getActiveScheduleOrWeekdayFallback(
    employeeId: string,
    companyId: string,
    date?: Date,
  ): Promise<ScheduleWithDays> {
    try {
      return await this.getActiveSchedule(employeeId, companyId, date);
    } catch (error: unknown) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
      this.logger.warn(
        `No work schedule for employee ${employeeId}; using weekday fallback`,
      );
      return this.weekdayFallbackSchedule(companyId);
    }
  }

  /**
   * Day kind for an employee on a date (assignment → company default →
   * Mon–Sat half / Sunday off fallback). Holiday wins over schedule.
   */
  async getDayKind(
    employeeId: string,
    companyId: string,
    date: Date,
    options?: { nationality?: Nationality | null },
  ): Promise<DayKind> {
    const onDate = toUtcDateOnly(date);
    const calendar = await this.isHolidayForEmployee(
      companyId,
      options?.nationality ?? null,
      onDate,
    );
    let scheduleDay: { isWorkingDay: boolean; isHalfDay: boolean } | undefined;
    try {
      const schedule = await this.getActiveScheduleOrWeekdayFallback(
        employeeId,
        companyId,
        onDate,
      );
      const weekday = schedule.days.find(
        (row) => row.dayOfWeek === onDate.getUTCDay(),
      );
      if (weekday) {
        scheduleDay = {
          isWorkingDay: weekday.isWorkingDay,
          isHalfDay: weekday.isHalfDay,
        };
      }
    } catch {
      scheduleDay = defaultScheduleDayFlags(onDate.getUTCDay());
    }
    const flags = scheduleDay ?? defaultScheduleDayFlags(onDate.getUTCDay());
    return classifyDayKind({
      isHoliday: calendar.isHoliday,
      isWorkingDay: flags.isWorkingDay,
      isHalfDay: flags.isHalfDay,
    });
  }

  /**
   * In-memory Mon–Fri full + Saturday half used only when no assignment or
   * company default exists (matches attendance fallbackWeekdaySchedule).
   */
  private weekdayFallbackSchedule(companyId: string): ScheduleWithDays {
    const now = new Date();
    const scheduleId = 'weekday-fallback';
    const days = Array.from({ length: 7 }, (_, dayOfWeek) => {
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      const isWorkingDay = !isSunday;
      const isHalfDay = isSaturday;
      return {
        id: `${scheduleId}-${dayOfWeek}`,
        scheduleId,
        dayOfWeek,
        isWorkingDay,
        isHalfDay,
        morningStart: isWorkingDay ? '08:00' : null,
        morningEnd: isWorkingDay ? '12:00' : null,
        afternoonStart: isWorkingDay && !isHalfDay ? '13:00' : null,
        afternoonEnd: isWorkingDay && !isHalfDay ? '17:00' : null,
        totalHours: new Prisma.Decimal(isWorkingDay ? (isHalfDay ? 4 : 8) : 0),
      };
    });
    return {
      id: scheduleId,
      companyId,
      name: 'Weekday fallback',
      description: null,
      isDefault: false,
      isActive: true,
      checkMode: WorkScheduleCheckMode.STANDARD,
      latestScanTime: null,
      createdAt: now,
      createdBy: 'system',
      updatedAt: now,
      updatedBy: 'system',
      deletedAt: null,
      deletedBy: null,
      days,
    };
  }

  private async loadActiveHolidays(companyId: string): Promise<HolidayRow[]> {
    return this.prisma.publicHoliday.findMany({
      where: activeOnly({ companyId, isActive: true }),
      select: {
        id: true,
        name: true,
        nameZh: true,
        date: true,
        isRecurring: true,
        appliesToNationality: true,
      },
    });
  }

  private nextOccurrence(
    holidayDate: Date,
    isRecurring: boolean,
    from: Date,
  ): Date {
    const stored = toUtcDateOnly(holidayDate);
    if (!isRecurring) {
      return stored;
    }
    const thisYear = new Date(
      Date.UTC(from.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate()),
    );
    if (thisYear.getTime() >= from.getTime()) {
      return thisYear;
    }
    return new Date(
      Date.UTC(
        from.getUTCFullYear() + 1,
        stored.getUTCMonth(),
        stored.getUTCDate(),
      ),
    );
  }

  /**
   * SCAN_ONLY requires latestScanTime (HH:mm); STANDARD never stores one.
   */
  private normalizeCheckMode(
    checkMode: WorkScheduleCheckMode | undefined,
    latestScanTime: string | null | undefined,
  ): NormalizedCheckMode {
    if (checkMode !== WorkScheduleCheckMode.SCAN_ONLY) {
      return { checkMode: WorkScheduleCheckMode.STANDARD, latestScanTime: null };
    }
    const trimmed = latestScanTime?.trim() ?? '';
    if (!HH_MM.test(trimmed)) {
      throw new BadRequestException(
        'Scan-only schedules require a latest scan time (HH:mm)',
      );
    }
    return {
      checkMode: WorkScheduleCheckMode.SCAN_ONLY,
      latestScanTime: trimmed,
    };
  }

  /**
   * Employees whose imported attendance a schedule edit can change, each with
   * the date to recalculate from: the earliest assignment start on this
   * schedule. Employees on it without an assignment row (user FK, or the
   * company-default fallback) recalculate every imported month.
   */
  private async listRecalcTargets(
    scheduleId: string,
    companyId: string,
    isDefault: boolean,
  ): Promise<Map<string, Date>> {
    const targets = new Map<string, Date>();
    const assignments = await this.prisma.employeeScheduleAssignment.findMany({
      where: { companyId, scheduleId },
      select: { employeeId: true, effectiveFrom: true },
    });
    for (const row of assignments) {
      const current = targets.get(row.employeeId);
      if (!current || row.effectiveFrom.getTime() < current.getTime()) {
        targets.set(row.employeeId, row.effectiveFrom);
      }
    }

    const fallbackUsers = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { workScheduleId: scheduleId },
          ...(isDefault
            ? [
                {
                  scheduleAssignments: { none: {} },
                  attendanceRecords: { some: {} },
                },
              ]
            : []),
        ],
      },
      select: { id: true },
    });
    for (const user of fallbackUsers) {
      if (!targets.has(user.id)) {
        targets.set(user.id, RECALC_FROM_ALL_IMPORTED);
      }
    }
    return targets;
  }

  private normalizeDays(
    days: Array<
      Pick<
        WorkScheduleDayDto,
        | 'dayOfWeek'
        | 'isWorkingDay'
        | 'isHalfDay'
        | 'morningStart'
        | 'morningEnd'
        | 'afternoonStart'
        | 'afternoonEnd'
      >
    >,
    checkMode: WorkScheduleCheckMode = WorkScheduleCheckMode.STANDARD,
  ): NormalizedScheduleDay[] {
    const allowSingleShift = checkMode === WorkScheduleCheckMode.SCAN_ONLY;
    if (days.length !== 7) {
      throw new BadRequestException('A schedule must define all 7 days of the week');
    }
    const seen = new Set<number>();
    const normalized = days.map((day) => {
      if (seen.has(day.dayOfWeek)) {
        throw new BadRequestException(
          `Duplicate dayOfWeek ${day.dayOfWeek} in schedule`,
        );
      }
      seen.add(day.dayOfWeek);
      const isWorkingDay = day.isWorkingDay;
      const isHalfDay = isWorkingDay ? Boolean(day.isHalfDay) : false;
      const hours = computeAndValidateDayHours(
        {
          isWorkingDay,
          isHalfDay,
          morningStart: day.morningStart,
          morningEnd: day.morningEnd,
          afternoonStart: day.afternoonStart,
          afternoonEnd: day.afternoonEnd,
        },
        { allowSingleShift },
      );
      return {
        dayOfWeek: day.dayOfWeek,
        isWorkingDay,
        isHalfDay,
        morningStart: isWorkingDay ? day.morningStart ?? null : null,
        morningEnd: isWorkingDay ? day.morningEnd ?? null : null,
        afternoonStart:
          isWorkingDay && !isHalfDay ? day.afternoonStart ?? null : null,
        afternoonEnd:
          isWorkingDay && !isHalfDay ? day.afternoonEnd ?? null : null,
        totalHours: new Prisma.Decimal(hours.toFixed(1)),
      };
    });

    for (let dow = 0; dow <= 6; dow += 1) {
      if (!seen.has(dow)) {
        throw new BadRequestException(
          'A schedule must include every day of the week (0–6)',
        );
      }
    }
    return normalized;
  }

  private async findScheduleOrThrow(
    id: string,
    companyId: string,
  ): Promise<ScheduleWithDays> {
    const schedule = await this.prisma.workSchedule.findFirst({
      where: activeOnly({ id, companyId }),
      include: SCHEDULE_INCLUDE,
    });
    if (!schedule) {
      throw new NotFoundException('Work schedule not found');
    }
    return schedule;
  }

  private async countAssignedEmployees(
    scheduleId: string,
    companyId: string,
  ): Promise<number> {
    const ids = await this.listAssignedEmployeeIds(scheduleId, companyId);
    return ids.length;
  }

  /**
   * Employee ids currently on this schedule (open assignment or user FK).
   */
  private async listAssignedEmployeeIds(
    scheduleId: string,
    companyId: string,
  ): Promise<string[]> {
    const today = todayUtc();
    const [fromAssignments, fromUsers] = await Promise.all([
      this.prisma.employeeScheduleAssignment.findMany({
        where: {
          companyId,
          scheduleId,
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      this.prisma.user.findMany({
        where: { companyId, workScheduleId: scheduleId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    const ids = new Set<string>();
    for (const row of fromAssignments) {
      ids.add(row.employeeId);
    }
    for (const row of fromUsers) {
      ids.add(row.id);
    }
    return [...ids];
  }

  private mapSchedule(
    row: ScheduleWithDays,
    assignedEmployeeCount: number,
  ): Record<string, unknown> {
    const workingDays = row.days.filter((day) => day.isWorkingDay).length;
    const hoursPerWeek = row.days.reduce(
      (sum, day) => sum + Number(day.totalHours),
      0,
    );
    return {
      ...row,
      days: row.days.map((day) => ({
        ...day,
        totalHours: Number(day.totalHours),
      })),
      workingDaysPerWeek: workingDays,
      hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
      assignedEmployeeCount,
    };
  }

  private mapAssignment(row: {
    id: string;
    companyId: string;
    employeeId: string;
    scheduleId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    notes: string | null;
    createdAt: Date;
    schedule?: ScheduleWithDays;
    employee?: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      scheduleId: row.scheduleId,
      effectiveFrom: formatDateOnly(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
      notes: row.notes,
      createdAt: row.createdAt,
      schedule: row.schedule ? this.mapSchedule(row.schedule, 0) : undefined,
      employee: row.employee,
    };
  }

  private throwIfUniqueName(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A work schedule with this name already exists',
      );
    }
  }
}
