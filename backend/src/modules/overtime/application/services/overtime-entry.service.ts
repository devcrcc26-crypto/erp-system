import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveRequestStatus, SiteAssignmentStatus } from '@prisma/client';
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
  calculateOvertimeHoursDetailed,
  CROSSES_SCHEDULE_MESSAGE,
  NO_SELECTABLE_OT_MESSAGE,
  OUTSIDE_SELECTABLE_WINDOW_MESSAGE,
  OVERLAPS_LEAVE_MESSAGE,
  overtimeEntrySpanMinutes,
  SAME_DAY_END_BEFORE_START_MESSAGE,
  START_INSIDE_SCHEDULE_MESSAGE,
  totalOvertimeHours,
  SITE_ASSIGNMENT_FULL_DAY_OT_MESSAGE,
  WITHIN_SCHEDULE_MESSAGE,
  type OvertimeDayContext,
  type OvertimeHoursBuckets,
} from '../utils/overtime-hours.util';
import {
  buildAttendanceWarning,
  buildFullDayLeaveExcludedWindows,
  buildLeaveExcludedWindows,
  overlapsWeekdayLunchBreak,
  WEEKDAY_LUNCH_OT_MESSAGE,
  type LeaveDayPortionInput,
  type WeekdayScheduleSlice,
} from '../utils/overtime-entry-guards.util';
import {
  computeSelectableOvertimeWindows,
  entryToSameDayOccupiedWindow,
  explainOutsideSelectableWindow,
  isSameDayOvertimeIntervalAllowed,
  minutesToHhMm,
  subtractOccupiedFromWindows,
  type SelectableWindowsResult,
  type TimeWindowHhMm,
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
  /** Approved site assignment covering the entry date, if any. */
  siteAssignmentId: string | null;
  siteName: string | null;
  /** Hours inside scheduled time made claimable by the site assignment. */
  siteWithinScheduleHours: number;
}

/** Approved site assignment on a date and whether it unlocks scheduled hours. */
export interface SiteDayContext {
  siteAssignmentId: string | null;
  siteName: string | null;
  scheduledHoursClaimable: boolean;
}

/** Merge single + comma-separated exclude ids for occupied-window carving. */
export function parseExcludeEntryIds(
  excludeEntryId: string | undefined,
  excludeEntryIds: string | undefined,
): string[] {
  const ids = new Set<string>();
  if (excludeEntryId?.trim()) {
    ids.add(excludeEntryId.trim());
  }
  if (excludeEntryIds) {
    for (const part of excludeEntryIds.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        ids.add(trimmed);
      }
    }
  }
  return [...ids];
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
   * `enforceSelectableWindows: false` re-prices an existing entry (site
   * assignment changed) without rejecting time that is no longer selectable.
   */
  async classifyEntry(
    employeeId: string,
    companyId: string,
    date: Date,
    startTime: string,
    endTime: string,
    options?: {
      holidayOverride?: boolean;
      isOvernight?: boolean;
      enforceSelectableWindows?: boolean;
    },
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
    const siteDay = await this.resolveSiteDay(employeeId, companyId, onDate);

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
    // UI midnight end 00:00 (after a later start) = end of calendar day 24:00.
    if (
      !isOvernight &&
      endTime === '00:00' &&
      startTime !== '00:00' &&
      startTime !== '24:00'
    ) {
      endTime = '24:00';
    }
    const weekday = schedule.days.find(
      (row) => row.dayOfWeek === onDate.getUTCDay(),
    );
    const leaveResolved = await this.resolveLeaveForDate(
      employeeId,
      companyId,
      onDate,
      weekday,
    );
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
      siteDay.scheduledHoursClaimable,
    );

    if (!isOvernight && options?.enforceSelectableWindows !== false) {
      const selectable = computeSelectableOvertimeWindows({
        isHoliday,
        isWorkingDay: context.isWorkingDay,
        isHalfDay: context.isHalfDay,
        morningStart: context.morningStart,
        morningEnd: context.morningEnd,
        afternoonStart: context.afternoonStart,
        afternoonEnd: context.afternoonEnd,
        leaveExcludedWindows: leaveWindowsStart,
        lunchCountsAsOvertime,
        scheduledHoursClaimable: siteDay.scheduledHoursClaimable,
      });
      if (
        !isSameDayOvertimeIntervalAllowed(
          startTime,
          endTime,
          selectable.windows,
        )
      ) {
        throw new BadRequestException(
          selectable.message ??
            this.messageForOutsideSelectable(
              startTime,
              endTime,
              selectable.windows,
              leaveWindowsStart,
            ),
        );
      }
      // Weekday lunch 12:30–13:30 is never OT-eligible (after selectable check).
      // Site assignment / holiday / Sat–Sun skip; Saturday has no lunch block.
      if (
        overlapsWeekdayLunchBreak(startTime, endTime, onDate, {
          skip: siteDay.scheduledHoursClaimable || isHoliday,
        })
      ) {
        throw new BadRequestException(WEEKDAY_LUNCH_OT_MESSAGE);
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
      const nextSiteDay = await this.resolveSiteDay(
        employeeId,
        companyId,
        nextDate,
      );
      nextDayContext = this.buildDayContext(
        nextWeekday,
        nextCalendar.isHoliday,
        leaveNext.excludedWindows,
        await getPolicy(this.prisma, companyId, 'lunchCountsAsOvertime', nextDate),
        nextSiteDay.scheduledHoursClaimable,
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

    const detailed = calculateOvertimeHoursDetailed(
      onDate,
      startTime,
      endTime,
      context,
      isOvernight,
      nextDayContext,
    );
    const hours = detailed.buckets;
    const totalHours = totalOvertimeHours(hours);
    const spanMinutes = overtimeEntrySpanMinutes(
      startTime,
      endTime,
      isOvernight,
    );

    let scheduleNote: string | null = null;
    if (siteDay.siteAssignmentId && siteDay.scheduledHoursClaimable) {
      scheduleNote = siteDay.siteName
        ? `${SITE_ASSIGNMENT_FULL_DAY_OT_MESSAGE} (${siteDay.siteName})`
        : SITE_ASSIGNMENT_FULL_DAY_OT_MESSAGE;
    } else if (totalHours === 0 && spanMinutes > 0) {
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
      siteAssignmentId: siteDay.siteAssignmentId,
      siteName: siteDay.siteName,
      siteWithinScheduleHours: detailed.withinScheduleHours,
    };
  }

  /**
   * Approved (not deleted) site assignment whose inclusive date range covers
   * `onDate`. Scheduled office hours are claimable as OT only when the
   * `siteDayScheduledHoursClaimable` policy is on (default: off — same
   * outside-schedule rule as office days for all employees).
   */
  async resolveSiteDay(
    employeeId: string,
    companyId: string,
    onDate: Date,
  ): Promise<SiteDayContext> {
    const day = toUtcDateOnly(onDate);
    const assignment = await this.prisma.siteAssignment.findFirst({
      where: {
        companyId,
        employeeId,
        status: SiteAssignmentStatus.APPROVED,
        deletedAt: null,
        startDate: { lte: day },
        endDate: { gte: day },
      },
      select: { id: true, siteName: true },
      orderBy: { startDate: 'desc' },
    });
    if (!assignment) {
      return {
        siteAssignmentId: null,
        siteName: null,
        scheduledHoursClaimable: false,
      };
    }
    const scheduledHoursClaimable = await getPolicy(
      this.prisma,
      companyId,
      'siteDayScheduledHoursClaimable',
      day,
    );
    return {
      siteAssignmentId: assignment.id,
      siteName: assignment.siteName,
      scheduledHoursClaimable: Boolean(scheduledHoursClaimable),
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
    const siteDay = await this.resolveSiteDay(employeeId, companyId, onDate);
    const context = this.buildDayContext(
      weekday,
      calendar.isHoliday,
      leaveResolved.excludedWindows,
      lunchCountsAsOvertime,
      siteDay.scheduledHoursClaimable,
    );

    const base = this.attachSiteDayToWindows(
      computeSelectableOvertimeWindows({
        isHoliday: calendar.isHoliday,
        isWorkingDay: context.isWorkingDay,
        isHalfDay: context.isHalfDay,
        morningStart: context.morningStart,
        morningEnd: context.morningEnd,
        afternoonStart: context.afternoonStart,
        afternoonEnd: context.afternoonEnd,
        leaveExcludedWindows: leaveResolved.excludedWindows,
        lunchCountsAsOvertime,
        scheduledHoursClaimable: siteDay.scheduledHoursClaimable,
      }),
      siteDay,
    );

    if (!dto.sheetId || base.windows.length === 0) {
      return base;
    }

    const occupied = await this.loadOccupiedWindowsForSheetDate(
      dto.sheetId,
      companyId,
      onDate,
      parseExcludeEntryIds(dto.excludeEntryId, dto.excludeEntryIds),
    );
    if (occupied.length === 0) {
      return base;
    }

    const windows = subtractOccupiedFromWindows(base.windows, occupied);
    return this.attachSiteDayToWindows(
      {
        ...base,
        windows,
        message:
          windows.length === 0 && !base.blockedReason
            ? 'All selectable times on this day are already used by other entries.'
            : base.message,
      },
      siteDay,
    );
  }

  private attachSiteDayToWindows(
    result: SelectableWindowsResult,
    siteDay: SiteDayContext,
  ): SelectableWindowsResult {
    return {
      ...result,
      siteAssignmentDay: Boolean(siteDay.siteAssignmentId),
      siteName: siteDay.siteName,
    };
  }

  /**
   * Existing overtime intervals on a sheet/date, for carving out of pickers.
   */
  private async loadOccupiedWindowsForSheetDate(
    sheetId: string,
    companyId: string,
    onDate: Date,
    excludeEntryIds: string[],
  ): Promise<TimeWindowHhMm[]> {
    const sheet = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ id: sheetId, companyId }),
      select: { id: true },
    });
    if (!sheet) {
      return [];
    }

    const entries = await this.prisma.overtimeEntry.findMany({
      where: {
        sheetId,
        date: onDate,
        ...(excludeEntryIds.length > 0
          ? { id: { notIn: excludeEntryIds } }
          : {}),
      },
      select: {
        startTime: true,
        endTime: true,
        endsAtEndOfDay: true,
        isOvernight: true,
      },
    });

    const occupied: TimeWindowHhMm[] = [];
    for (const entry of entries) {
      const window = entryToSameDayOccupiedWindow({
        startHhMm: this.formatTimeOfDay(entry.startTime),
        endHhMm: entry.endsAtEndOfDay
          ? '24:00'
          : this.formatTimeOfDay(entry.endTime),
        endsAtEndOfDay: entry.endsAtEndOfDay,
        isOvernight: entry.isOvernight,
      });
      if (window) {
        occupied.push(window);
      }
    }
    return occupied;
  }

  private formatTimeOfDay(value: Date): string {
    return minutesToHhMm(value.getUTCHours() * 60 + value.getUTCMinutes());
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
    siteName: string | null;
    siteWithinScheduleHours: number;
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
      siteName: classified.siteName,
      siteWithinScheduleHours: classified.siteWithinScheduleHours,
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
    scheduledHoursClaimable = false,
  ): OvertimeDayContext {
    const isWorkingDay = Boolean(weekday?.isWorkingDay);
    const isHalfDay = Boolean(weekday?.isWorkingDay && weekday?.isHalfDay);
    return {
      lunchCountsAsOvertime,
      scheduledHoursClaimable,
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
    /** True when approved full-day leave applies (duty hours excluded only). */
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
        excludedWindows.push(...buildFullDayLeaveExcludedWindows(weekday));
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

  /**
   * Maps selectable-window rejection to a specific user-facing reason.
   */
  private messageForOutsideSelectable(
    startTime: string,
    endTime: string,
    windows: TimeWindowHhMm[],
    leaveExcludedWindows: Array<{ start: string; end: string }>,
  ): string {
    const reason = explainOutsideSelectableWindow(
      startTime,
      endTime,
      windows,
      leaveExcludedWindows,
    );
    switch (reason) {
      case 'END_BEFORE_START':
        return SAME_DAY_END_BEFORE_START_MESSAGE;
      case 'NO_WINDOWS':
        return NO_SELECTABLE_OT_MESSAGE;
      case 'OVERLAPS_LEAVE':
        return OVERLAPS_LEAVE_MESSAGE;
      case 'START_IN_SCHEDULE':
        return START_INSIDE_SCHEDULE_MESSAGE;
      case 'CROSSES_SCHEDULE':
        return CROSSES_SCHEDULE_MESSAGE;
      default:
        return OUTSIDE_SELECTABLE_WINDOW_MESSAGE;
    }
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
      'overtime',
      'manage',
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

