import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import {
  formatDateOnly,
  parseDateOnly,
  toUtcDateOnly,
} from '../../../work-schedule/application/services/work-schedule.dates';
import { PreviewOvertimeEntryDto } from '../dtos/overtime.dtos';
import {
  buildOvertimeScheduleNote,
  calculateOvertimeHours,
  type OvertimeDayContext,
  type OvertimeHoursBuckets,
} from '../utils/overtime-hours.util';

export interface ClassifiedOvertimeEntry extends OvertimeHoursBuckets {
  isHoliday: boolean;
  isCalendarHoliday: boolean;
  holidayName: string | null;
  isWeekend: boolean;
  isHalfDay: boolean;
  scheduleNote: string | null;
  totalHours: number;
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
    const weekday = schedule.days.find(
      (row) => row.dayOfWeek === onDate.getUTCDay(),
    );
    const isWorkingDay = Boolean(weekday?.isWorkingDay);
    const isHalfDay = Boolean(weekday?.isWorkingDay && weekday.isHalfDay);

    const context: OvertimeDayContext = {
      isHoliday,
      isWorkingDay,
      isHalfDay,
      morningStart: weekday?.morningStart ?? null,
      morningEnd: weekday?.morningEnd ?? null,
    };

    const hours = calculateOvertimeHours(
      onDate,
      startTime,
      endTime,
      context,
      Boolean(options?.isOvernight),
    );
    const totalHours = roundHours(
      hours.regularHours +
        hours.nightHours +
        hours.weekendHours +
        hours.holidayHours,
    );

    return {
      ...hours,
      totalHours,
      isHoliday,
      isCalendarHoliday,
      holidayName: isCalendarHoliday ? calendar.holidayName : null,
      isWeekend: !isWorkingDay,
      isHalfDay,
      scheduleNote: buildOvertimeScheduleNote(onDate, context),
    };
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

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
