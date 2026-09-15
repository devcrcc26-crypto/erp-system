import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HolidayNationality,
  Nationality,
  Prisma,
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

type ScheduleWithDays = Prisma.WorkScheduleGetPayload<{
  include: { days: true };
}>;

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
 * Leave, overtime, and attendance must call this service — never hardcode weekends or holidays.
 */
@Injectable()
export class WorkScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
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

    const assignment = await this.prisma.employeeScheduleAssignment.findFirst({
      where: {
        companyId,
        employeeId,
        effectiveFrom: { lte: onDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
        schedule: activeOnly({ companyId, isActive: true }),
      },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        schedule: { include: SCHEDULE_INCLUDE },
      },
    });

    if (assignment?.schedule) {
      return assignment.schedule;
    }

    const fallback = await this.prisma.workSchedule.findFirst({
      where: activeOnly({ companyId, isDefault: true, isActive: true }),
      include: SCHEDULE_INCLUDE,
    });
    if (!fallback) {
      throw new NotFoundException(
        'No work schedule found for this employee and no company default is set',
      );
    }
    return fallback;
  }

  /**
   * Working-day weights between two inclusive dates for one employee.
   */
  async calculateWorkingDays(
    employeeId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<WorkingDaysResult> {
    const start = toUtcDateOnly(startDate);
    const end = toUtcDateOnly(endDate);
    const calendarDays = iterateUtcDays(start, end);

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true, nationality: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const holidays = await this.loadActiveHolidays(companyId);
    const applicable = holidays.filter((holiday) =>
      holidayAppliesToNationality(
        holiday.appliesToNationality,
        employee.nationality,
      ),
    );

    const scheduleCache = new Map<string, ScheduleWithDays>();
    const breakdown: DayBreakdown[] = [];
    let total = 0;

    for (const day of calendarDays) {
      const schedule = await this.getCachedSchedule(
        employeeId,
        companyId,
        day,
        scheduleCache,
      );
      const weekday = schedule.days.find((row) => row.dayOfWeek === day.getUTCDay());
      const holiday = applicable.find((row) =>
        holidayFallsOnDate(row.date, row.isRecurring, day),
      );

      if (holiday) {
        breakdown.push({
          date: day,
          type: 'holiday',
          holidayName: holiday.name,
          weight: 0,
        });
        continue;
      }

      if (!weekday || !weekday.isWorkingDay) {
        breakdown.push({ date: day, type: 'weekend', weight: 0 });
        continue;
      }

      if (weekday.isHalfDay) {
        breakdown.push({ date: day, type: 'half', weight: 0.5 });
        total += 0.5;
        continue;
      }

      breakdown.push({ date: day, type: 'working', weight: 1 });
      total += 1;
    }

    return {
      totalDays: new Prisma.Decimal(total.toFixed(1)),
      breakdown,
    };
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

    const schedule = await this.getActiveSchedule(employeeId, companyId, onDate);
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
      breakdown: Array<{
        date: string;
        type: DayBreakdown['type'];
        holidayName?: string;
        weight: number;
      }>;
    }>;
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
      const result = await this.calculateWorkingDays(
        employeeId,
        companyId,
        start,
        end,
      );
      const days = Number(result.totalDays);
      totalDays += days;
      periods.push({
        startDate: formatDateOnly(start),
        endDate: formatDateOnly(end),
        days,
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
    const days = this.normalizeDays(dto.days);

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
      this.throwIfUniqueName(error);
      throw error;
    }
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
    const days = dto.days ? this.normalizeDays(dto.days) : null;

    if (dto.isActive === false && existing.isDefault) {
      throw new BadRequestException(
        'Set another schedule as default before deactivating the company default',
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
            updatedBy: userId,
          },
          include: SCHEDULE_INCLUDE,
        });
      });

      const assignedCount = await this.countAssignedEmployees(id, companyId);
      return this.mapSchedule(updated, assignedCount);
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

    if (current && current.effectiveFrom.getTime() >= effectiveFrom.getTime()) {
      throw new BadRequestException(
        'New assignment must start after the current assignment effective-from date',
      );
    }

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

    return this.mapAssignment(created);
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
   * Validates periods, calculates each via the schedule engine, and returns totals.
   */
  async resolveLeavePeriods(
    employeeId: string,
    companyId: string,
    periods: Array<{ startDate: string; endDate: string }>,
  ): Promise<{
    startDate: Date;
    endDate: Date;
    days: number;
    periodRows: Array<{ startDate: Date; endDate: Date; days: number }>;
    breakdown: WorkingDaysResult['breakdown'];
  }> {
    if (periods.length === 0) {
      throw new BadRequestException('At least one leave period is required');
    }
    this.assertPeriodsDoNotOverlap(periods);

    const periodRows: Array<{ startDate: Date; endDate: Date; days: number }> =
      [];
    const breakdown: WorkingDaysResult['breakdown'] = [];
    let totalDays = 0;

    for (const period of periods) {
      const start = parseDateOnly(period.startDate);
      const end = parseDateOnly(period.endDate);
      const result = await this.calculateWorkingDays(
        employeeId,
        companyId,
        start,
        end,
      );
      const days = Number(result.totalDays);
      if (days <= 0) {
        throw new BadRequestException(
          `Leave period ${period.startDate} to ${period.endDate} covers no working days`,
        );
      }
      periodRows.push({ startDate: start, endDate: end, days });
      breakdown.push(...result.breakdown);
      totalDays += days;
    }

    periodRows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return {
      startDate: periodRows[0].startDate,
      endDate: periodRows[periodRows.length - 1].endDate,
      days: Math.round(totalDays * 10) / 10,
      periodRows,
      breakdown,
    };
  }

  private async resolvePreviewEmployee(
    requestedId: string | undefined,
    companyId: string,
    actorUserId: string,
  ): Promise<string> {
    if (!requestedId || requestedId === actorUserId) {
      return actorUserId;
    }
    const isHr = await this.permissionService.hasPermission(
      actorUserId,
      companyId,
      'hr',
      'view',
    );
    if (!isHr) {
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
    const schedule = await this.getActiveSchedule(employeeId, companyId, date);
    cache.set(key, schedule);
    return schedule;
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

  private normalizeDays(
    days: WorkScheduleDayDto[],
  ): Array<{
    dayOfWeek: number;
    isWorkingDay: boolean;
    isHalfDay: boolean;
    morningStart: string | null;
    morningEnd: string | null;
    afternoonStart: string | null;
    afternoonEnd: string | null;
    totalHours: Prisma.Decimal;
  }> {
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
      const hours = computeAndValidateDayHours({
        isWorkingDay,
        isHalfDay,
        morningStart: day.morningStart,
        morningEnd: day.morningEnd,
        afternoonStart: day.afternoonStart,
        afternoonEnd: day.afternoonEnd,
      });
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
    const today = todayUtc();
    const [fromAssignments, fromUserFk] = await Promise.all([
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
      this.prisma.user.count({
        where: { companyId, workScheduleId: scheduleId, deletedAt: null },
      }),
    ]);
    const ids = new Set(fromAssignments.map((row) => row.employeeId));
    return Math.max(ids.size, fromUserFk);
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
