import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveRequestStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { getPolicy } from '../../../../shared/policy/policy-reader.util';
import {
  assertNotInUnpaidInactivePeriod,
  assertWithinEmploymentWindow,
} from '../../../../shared/employment/employment-guard.util';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import {
  addUtcDays,
  formatDateOnly,
  parseDateOnly,
  toUtcDateOnly,
} from '../../../work-schedule/application/services/work-schedule.dates';
import {
  PreviewOvertimeEntryDto,
  SelectableOvertimeWindowsQueryDto,
} from '../dtos/overtime.dtos';
import {
  buildOvertimeScheduleNote,
  calculateOvertimeHours,
  OUTSIDE_SELECTABLE_WINDOW_MESSAGE,
  overtimeEntrySpanMinutes,
  totalOvertimeHours,
  WITHIN_SCHEDULE_MESSAGE,
  type OvertimeDayContext,
  type OvertimeHoursBuckets,
} from '../utils/overtime-hours.util';
import {
  buildAttendanceWarning,
  buildLeaveExcludedWindows,
  FULL_DAY_LEAVE_MESSAGE,
  type LeaveDayPortionInput,
  type WeekdayScheduleSlice,
} from '../utils/overtime-entry-guards.util';
import {
  computeSelectableOvertimeWindows,
  isIntervalInsideSelectableWindows,
  type SelectableWindowsResult,
} from '../utils/overtime-selectable-windows.util';

export interface ClassifiedOvertimeEntry extends OvertimeHoursBuckets {
  isHoliday: boolean;
  isCalendarHoliday: boolean;
  holidayName: string | null;
  isWeekend: boolean;
  isHalfDay: boolean;
  scheduleNote: string | null;
  totalHours: number;
  attendanceWarning: string | null;
}

/**
 * Resolves work-schedule + public-holiday context and classifies overtime hours.
 */
@Injectable()
export class OvertimeEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScheduleService: WorkScheduleService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Classifies an overtime interval for an employee on a date.
   * Pass `holidayOverride: true` to force holiday hours (Excel import).
   */
  async classifyEntry(
    employeeId: string,
    companyId: string,
    date: Date,
    startTime: string,
    endTime: string,
    options?: { holidayOverride?: boolean; isOvernight?: boolean },
  ): Promise<ClassifiedOvertimeEntry> {
    const onDate = toUtcDateOnly(date);
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true, nationality: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    await assertWithinEmploymentWindow(this.prisma, employeeId, [onDate]);
    await assertNotInUnpaidInactivePeriod(this.prisma, companyId, employeeId, [onDate]);

    const calendar = await this.workScheduleService.isHolidayForEmployee(
      companyId,
      employee.nationality,
      onDate,
    );
    const isCalendarHoliday = calendar.isHoliday;
    const isHoliday =
      isCalendarHoliday || Boolean(options?.holidayOverride);

    const schedule = await this.workScheduleService.getActiveSchedule(
      employeeId,
      companyId,
      onDate,
    );
    const isOvernight = Boolean(options?.isOvernight);
    const weekday = schedule.days.find(
      (row) => row.dayOfWeek === onDate.getUTCDay(),
    );
    const leaveResolved = await this.resolveLeaveForDate(
      employeeId,
      companyId,
      onDate,
      weekday,
    );
    if (leaveResolved.hasFullDayLeave && !isOvernight) {
      throw new BadRequestException(FULL_DAY_LEAVE_MESSAGE);
    }
    const leaveWindowsStart = leaveResolved.excludedWindows;
    const lunchCountsAsOvertime = await getPolicy(
      this.prisma,
      companyId,
      'lunchCountsAsOvertime',
      onDate,
    );
    const context = this.buildDayContext(
      weekday,
      isHoliday,
      leaveWindowsStart,
      lunchCountsAsOvertime,
    );

    if (!isOvernight) {
      const selectable = computeSelectableOvertimeWindows({
        isHoliday,
        isWorkingDay: context.isWorkingDay,
        isHalfDay: context.isHalfDay,
        morningStart: context.morningStart,
        morningEnd: context.morningEnd,
        afternoonStart: context.afternoonStart,
        afternoonEnd: context.afternoonEnd,
        leaveExcludedWindows: leaveWindowsStart,
        hasFullDayLeave: leaveResolved.hasFullDayLeave,
        lunchCountsAsOvertime,
      });
      if (
        selectable.blockedReason === 'FULL_DAY_LEAVE' ||
        !isIntervalInsideSelectableWindows(
          startTime,
          endTime,
          selectable.windows,
        )
      ) {
        throw new BadRequestException(
          selectable.message ?? OUTSIDE_SELECTABLE_WINDOW_MESSAGE,
        );
      }
    }

    let nextDayContext: OvertimeDayContext | undefined;
    if (isOvernight && this.crossesMidnight(startTime, endTime)) {
      const nextDate = addUtcDays(onDate, 1);
      const nextCalendar = await this.workScheduleService.isHolidayForEmployee(
        companyId,
        employee.nationality,
        nextDate,
      );
      const nextSchedule = await this.workScheduleService.getActiveSchedule(
        employeeId,
        companyId,
        nextDate,
      );
      const nextWeekday = nextSchedule.days.find(
        (row) => row.dayOfWeek === nextDate.getUTCDay(),
      );
      const leaveNext = await this.resolveLeaveForDate(
        employeeId,
        companyId,
        nextDate,
        nextWeekday,
      );
      nextDayContext = this.buildDayContext(
        nextWeekday,
        nextCalendar.isHoliday,
        leaveNext.excludedWindows,
        await getPolicy(this.prisma, companyId, 'lunchCountsAsOvertime', nextDate),
      );
    }

    const attendanceLog = await this.findAttendanceDailyLog(
      employeeId,
      companyId,
      onDate,
    );
    const attendanceWarning = buildAttendanceWarning(attendanceLog, {
      startTime,
      endTime,
      isOvernight,
    });

    const hours = calculateOvertimeHours(
      onDate,
      startTime,
      endTime,
      context,
      isOvernight,
      nextDayContext,
    );
    const totalHours = totalOvertimeHours(hours);
    const spanMinutes = overtimeEntrySpanMinutes(
      startTime,
      endTime,
      isOvernight,
    );

    let scheduleNote = buildOvertimeScheduleNote(onDate, context);
    if (totalHours === 0 && spanMinutes > 0) {
      scheduleNote = WITHIN_SCHEDULE_MESSAGE;
    }

    return {
      ...hours,
      totalHours,
      isHoliday,
      isCalendarHoliday,
      holidayName: isCalendarHoliday ? calendar.holidayName : null,
      isWeekend: !context.isWorkingDay,
      isHalfDay: context.isHalfDay,
      scheduleNote,
      attendanceWarning,
    };
  }

  /**
   * Selectable same-day overtime windows for the entry form time pickers.
   * Non-HR callers may only query their own schedule.
   */
  async getSelectableWindows(
    dto: SelectableOvertimeWindowsQueryDto,
    companyId: string,
    actorUserId: string,
  ): Promise<SelectableWindowsResult> {
    const employeeId = await this.resolvePreviewEmployee(
      dto.employeeId,
      companyId,
      actorUserId,
    );
    const onDate = parseDateOnly(dto.date);
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true, nationality: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const calendar = await this.workScheduleService.isHolidayForEmployee(
      companyId,
      employee.nationality,
      onDate,
    );
    const schedule = await this.workScheduleService.getActiveSchedule(
      employeeId,
      companyId,
      onDate,
    );
    const weekday = schedule.days.find(
      (row) => row.dayOfWeek === onDate.getUTCDay(),
    );
    const leaveResolved = await this.resolveLeaveForDate(
      employeeId,
      companyId,
      onDate,
      weekday,
    );
    const lunchCountsAsOvertime = await getPolicy(
      this.prisma,
      companyId,
      'lunchCountsAsOvertime',
      onDate,
    );
    const context = this.buildDayContext(
      weekday,
      calendar.isHoliday,
      leaveResolved.excludedWindows,
      lunchCountsAsOvertime,
    );

    return computeSelectableOvertimeWindows({
      isHoliday: calendar.isHoliday,
      isWorkingDay: context.isWorkingDay,
      isHalfDay: context.isHalfDay,
      morningStart: context.morningStart,
      morningEnd: context.morningEnd,
      afternoonStart: context.afternoonStart,
      afternoonEnd: context.afternoonEnd,
      leaveExcludedWindows: leaveResolved.excludedWindows,
      hasFullDayLeave: leaveResolved.hasFullDayLeave,
      lunchCountsAsOvertime,
    });
  }

  /**
   * Live hours preview for the overtime entry form.
   * Non-HR callers may only preview their own schedule.
   */
  async previewEntry(
    dto: PreviewOvertimeEntryDto,
    companyId: string,
    actorUserId: string,
  ): Promise<{
    regularHours: number;
    nightHours: number;
    weekendHours: number;
    holidayHours: number;
    totalHours: number;
    holidayName: string | null;
    isWeekend: boolean;
    isHalfDay: boolean;
    scheduleNote: string | null;
    attendanceWarning: string | null;
  }> {
    const employeeId = await this.resolvePreviewEmployee(
      dto.employeeId,
      companyId,
      actorUserId,
    );
    const date = parseDateOnly(dto.date);
    const classified = await this.classifyEntry(
      employeeId,
      companyId,
      date,
      dto.startTime,
      dto.endTime,
      { isOvernight: dto.isOvernight },
    );

    return {
      regularHours: classified.regularHours,
      nightHours: classified.nightHours,
      weekendHours: classified.weekendHours,
      holidayHours: classified.holidayHours,
      totalHours: classified.totalHours,
      holidayName: classified.holidayName,
      isWeekend: classified.isWeekend,
      isHalfDay: classified.isHalfDay,
      scheduleNote: classified.scheduleNote,
      attendanceWarning: classified.attendanceWarning,
    };
  }

  /**
   * Dates on the sheet whose isHoliday flag is not backed by PublicHoliday.
   */
  async collectUnregisteredHolidayDates(
    employeeId: string,
    companyId: string,
    entries: Array<{ date: Date; isHoliday: boolean }>,
  ): Promise<string[]> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { nationality: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const flagged = new Set<string>();
    for (const entry of entries) {
      if (!entry.isHoliday) {
        continue;
      }
      const calendar = await this.workScheduleService.isHolidayForEmployee(
        companyId,
        employee.nationality,
        entry.date,
      );
      if (!calendar.isHoliday) {
        flagged.add(formatDateOnly(toUtcDateOnly(entry.date)));
      }
    }
    return [...flagged].sort();
  }

  private buildDayContext(
    weekday:
      | {
          isWorkingDay: boolean;
          isHalfDay: boolean;
          morningStart: string | null;
          morningEnd: string | null;
          afternoonStart: string | null;
          afternoonEnd: string | null;
        }
      | undefined,
    isHoliday: boolean,
    leaveExcludedWindows: Array<{ start: string; end: string }> = [],
    lunchCountsAsOvertime?: boolean,
  ): OvertimeDayContext {
    const isWorkingDay = Boolean(weekday?.isWorkingDay);
    const isHalfDay = Boolean(weekday?.isWorkingDay && weekday?.isHalfDay);
    return {
      lunchCountsAsOvertime,
      isHoliday,
      isWorkingDay,
      isHalfDay,
      morningStart: weekday?.morningStart ?? null,
      morningEnd: weekday?.morningEnd ?? null,
      afternoonStart:
        isWorkingDay && !isHalfDay ? weekday?.afternoonStart ?? null : null,
      afternoonEnd:
        isWorkingDay && !isHalfDay ? weekday?.afternoonEnd ?? null : null,
      excludedWindows:
        leaveExcludedWindows.length > 0 ? leaveExcludedWindows : undefined,
    };
  }

  private async resolveLeaveForDate(
    employeeId: string,
    companyId: string,
    onDate: Date,
    weekday: WeekdayScheduleSlice | undefined,
  ): Promise<{
    hasFullDayLeave: boolean;
    excludedWindows: Array<{ start: string; end: string }>;
  }> {
    const periods = await this.prisma.leaveRequestPeriod.findMany({
      where: {
        startDate: { lte: onDate },
        endDate: { gte: onDate },
        leaveRequest: {
          companyId,
          employeeId,
          status: LeaveRequestStatus.APPROVED,
          deletedAt: null,
        },
      },
      select: { dayPortion: true },
    });

    let hasFullDayLeave = false;
    const excludedWindows: Array<{ start: string; end: string }> = [];
    for (const period of periods) {
      const portion = period.dayPortion as LeaveDayPortionInput;
      if (portion === 'FULL') {
        hasFullDayLeave = true;
        continue;
      }
      if (portion === 'MORNING' || portion === 'AFTERNOON') {
        excludedWindows.push(buildLeaveExcludedWindows(portion, weekday));
      }
    }
    return { hasFullDayLeave, excludedWindows };
  }

  private async findAttendanceDailyLog(
    employeeId: string,
    companyId: string,
    onDate: Date,
  ): Promise<{
    clockInLocal: string | null;
    clockOutLocal: string | null;
    correctedClockInLocal: string | null;
    correctedClockOutLocal: string | null;
  } | null> {
    const month = onDate.getUTCMonth() + 1;
    const year = onDate.getUTCFullYear();
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { companyId, employeeId, month, year },
      select: { id: true },
    });
    if (!record) {
      return null;
    }
    return this.prisma.attendanceDailyLog.findFirst({
      where: { attendanceRecordId: record.id, date: onDate },
      select: {
        clockInLocal: true,
        clockOutLocal: true,
        correctedClockInLocal: true,
        correctedClockOutLocal: true,
      },
    });
  }

  private crossesMidnight(startTime: string, endTime: string): boolean {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    return endH * 60 + endM <= startH * 60 + startM;
  }

  private async resolvePreviewEmployee(
    requestedId: string,
    companyId: string,
    actorUserId: string,
  ): Promise<string> {
    if (requestedId === actorUserId) {
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
        'You can only preview overtime hours for your own schedule',
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
}

