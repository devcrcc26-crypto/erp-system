import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HolidayNationality, Nationality, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import {
  CreatePublicHolidayDto,
  UpdatePublicHolidayDto,
} from '../dtos/create-public-holiday.dto';
import {
  BulkHolidayStatusDto,
  DuplicateHolidayYearDto,
  ListPublicHolidaysDto,
} from '../dtos/list-public-holidays.dto';
import {
  formatDateOnly,
  parseDateOnly,
  todayUtc,
  toUtcDateOnly,
} from './work-schedule.dates';

/**
 * HR-managed public holidays. Inactive holidays are ignored by calculations.
 * Create / update / remove / activate recalculates attendance for the affected month(s)
 * so daily logs stop treating the day as absent.
 */
@Injectable()
export class PublicHolidayService {
  private readonly logger = new Logger(PublicHolidayService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Creates a public holiday for the company.
   */
  async create(
    dto: CreatePublicHolidayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    try {
      const created = await this.prisma.publicHoliday.create({
        data: {
          id: randomUUID(),
          companyId,
          name: dto.name.trim(),
          nameZh: dto.nameZh?.trim() || null,
          date: parseDateOnly(dto.date),
          isRecurring: dto.isRecurring ?? false,
          appliesToNationality:
            dto.appliesToNationality ?? HolidayNationality.ALL,
          isActive: dto.isActive ?? true,
          notes: dto.notes?.trim() || null,
          notifyDaysBefore: dto.notifyDaysBefore ?? 2,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await this.recalculateAffectedMonths(companyId, [created.date]);
      return this.mapHoliday(created);
    } catch (error: unknown) {
      const revived = await this.reviveDeleted(dto, companyId, userId, error);
      if (revived) {
        return revived;
      }
      this.throwIfUnique(error);
      throw error;
    }
  }

  /**
   * The company+date+nationality unique key ignores `deletedAt`, so a deleted
   * holiday still occupies its slot. Re-adding the same date reuses that row
   * instead of failing as a duplicate.
   */
  private async reviveDeleted(
    dto: CreatePublicHolidayDto,
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

    const deleted = await this.prisma.publicHoliday.findFirst({
      where: {
        companyId,
        date: parseDateOnly(dto.date),
        appliesToNationality:
          dto.appliesToNationality ?? HolidayNationality.ALL,
        deletedAt: { not: null },
      },
    });
    if (!deleted) {
      return null;
    }

    const revived = await this.prisma.publicHoliday.update({
      where: { id: deleted.id },
      data: {
        name: dto.name.trim(),
        nameZh: dto.nameZh?.trim() || null,
        isRecurring: dto.isRecurring ?? false,
        isActive: dto.isActive ?? true,
        notes: dto.notes?.trim() || null,
        notifyDaysBefore: dto.notifyDaysBefore ?? 2,
        deletedAt: null,
        deletedBy: null,
        updatedBy: userId,
      },
    });
    await this.recalculateAffectedMonths(companyId, [revived.date]);
    return this.mapHoliday(revived);
  }

  /**
   * Updates a public holiday.
   */
  async update(
    id: string,
    dto: UpdatePublicHolidayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const existing = await this.findOrThrow(id, companyId);
    try {
      const updated = await this.prisma.publicHoliday.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.nameZh !== undefined
            ? { nameZh: dto.nameZh?.trim() || null }
            : {}),
          ...(dto.date !== undefined ? { date: parseDateOnly(dto.date) } : {}),
          ...(dto.isRecurring !== undefined
            ? { isRecurring: dto.isRecurring }
            : {}),
          ...(dto.appliesToNationality !== undefined
            ? { appliesToNationality: dto.appliesToNationality }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes?.trim() || null }
            : {}),
          ...(dto.notifyDaysBefore !== undefined
            ? { notifyDaysBefore: dto.notifyDaysBefore }
            : {}),
          updatedBy: userId,
        },
      });
      await this.recalculateAffectedMonths(companyId, [
        existing.date,
        updated.date,
      ]);
      return this.mapHoliday(updated);
    } catch (error: unknown) {
      this.throwIfUnique(error);
      throw error;
    }
  }

  /**
   * Deactivates a holiday (keeps the row). Ignored by leave calculations.
   */
  async deactivate(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    return this.update(id, { isActive: false }, companyId, userId);
  }

  /**
   * Removes a holiday from the calendar (soft delete) and recalculates
   * attendance for that month so the day reverts to absent/present rules.
   */
  async remove(id: string, companyId: string, userId: string): Promise<void> {
    const existing = await this.findOrThrow(id, companyId);
    await this.prisma.publicHoliday.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
    });
    await this.recalculateAffectedMonths(companyId, [existing.date]);
  }

  /**
   * Bulk activate / deactivate holidays.
   */
  async bulkSetActive(
    dto: BulkHolidayStatusDto,
    companyId: string,
    userId: string,
  ): Promise<{ updated: number }> {
    const rows = await this.prisma.publicHoliday.findMany({
      where: activeOnly({
        companyId,
        id: { in: dto.ids },
      }),
      select: { id: true, date: true },
    });
    const result = await this.prisma.publicHoliday.updateMany({
      where: activeOnly({
        companyId,
        id: { in: dto.ids },
      }),
      data: {
        isActive: dto.isActive,
        updatedBy: userId,
      },
    });
    await this.recalculateAffectedMonths(
      companyId,
      rows.map((row) => row.date),
    );
    return { updated: result.count };
  }

  /**
   * Copies non-deleted holidays from one calendar year into another.
   * Skips rows that would violate the company+date+nationality unique constraint.
   */
  async duplicateYear(
    dto: DuplicateHolidayYearDto,
    companyId: string,
    userId: string,
  ): Promise<{ copied: number; skipped: number }> {
    if (dto.fromYear === dto.toYear) {
      throw new BadRequestException('fromYear and toYear must be different');
    }

    const source = await this.prisma.publicHoliday.findMany({
      where: activeOnly({
        companyId,
        date: {
          gte: new Date(Date.UTC(dto.fromYear, 0, 1)),
          lt: new Date(Date.UTC(dto.fromYear + 1, 0, 1)),
        },
      }),
    });

    let copied = 0;
    let skipped = 0;
    const copiedDates: Date[] = [];

    for (const holiday of source) {
      const nextDate = new Date(
        Date.UTC(
          dto.toYear,
          holiday.date.getUTCMonth(),
          holiday.date.getUTCDate(),
        ),
      );
      try {
        await this.prisma.publicHoliday.create({
          data: {
            id: randomUUID(),
            companyId,
            name: holiday.name,
            nameZh: holiday.nameZh,
            date: nextDate,
            isRecurring: holiday.isRecurring,
            appliesToNationality: holiday.appliesToNationality,
            isActive: true,
            notes: holiday.notes,
            notifyDaysBefore: holiday.notifyDaysBefore,
            createdBy: userId,
            updatedBy: userId,
          },
        });
        copied += 1;
        copiedDates.push(nextDate);
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    await this.recalculateAffectedMonths(companyId, copiedDates);
    return { copied, skipped };
  }

  /**
   * Lists holidays (including inactive) with optional year / nationality filters.
   */
  async list(
    query: ListPublicHolidaysDto,
    companyId: string,
  ): Promise<unknown[]> {
    const where: Prisma.PublicHolidayWhereInput = activeOnly({
      companyId,
      ...(query.nationality
        ? { appliesToNationality: query.nationality }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.year
        ? {
            date: {
              gte: new Date(Date.UTC(query.year, 0, 1)),
              lt: new Date(Date.UTC(query.year + 1, 0, 1)),
            },
          }
        : {}),
    });

    const rows = await this.prisma.publicHoliday.findMany({
      where,
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });

    if (query.upcoming === undefined) {
      return rows.map((row) => this.mapHoliday(row));
    }
    return this.upcomingWithin(rows, query.upcoming).map(
      ({ row, occurrence }) => ({
        ...this.mapHoliday(row),
        occurrenceDate: formatDateOnly(occurrence),
      }),
    );
  }

  /**
   * Active holidays in the next `days` days that apply to the employee
   * (nationality ALL, or matching the employee's own nationality).
   * Self-service: returns only display fields, never HR notes.
   */
  async listUpcomingForEmployee(
    userId: string,
    companyId: string,
    days: number,
  ): Promise<Record<string, unknown>[]> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId }),
      select: { nationality: true },
    });
    if (!employee) {
      throw new NotFoundException('User not found');
    }

    const nationalities: HolidayNationality[] = [HolidayNationality.ALL];
    if (employee.nationality === Nationality.ETHIOPIAN) {
      nationalities.push(HolidayNationality.ETHIOPIAN);
    } else if (employee.nationality === Nationality.CHINESE) {
      nationalities.push(HolidayNationality.CHINESE);
    }

    const rows = await this.prisma.publicHoliday.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        appliesToNationality: { in: nationalities },
      }),
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });

    return this.upcomingWithin(rows, days).map(
      ({ row, occurrence, daysUntil }) => ({
        id: row.id,
        name: row.name,
        nameZh: row.nameZh,
        date: formatDateOnly(occurrence),
        isRecurring: row.isRecurring,
        appliesToNationality: row.appliesToNationality,
        daysUntil,
      }),
    );
  }

  /** Next occurrence of each holiday, kept when it is 0..days away, soonest first. */
  private upcomingWithin(
    rows: Prisma.PublicHolidayGetPayload<object>[],
    days: number,
  ): Array<{
    row: Prisma.PublicHolidayGetPayload<object>;
    occurrence: Date;
    daysUntil: number;
  }> {
    const today = todayUtc();
    return rows
      .map((row) => {
        const occurrence = this.nextOccurrence(row.date, row.isRecurring, today);
        const daysUntil = Math.round(
          (occurrence.getTime() - today.getTime()) / 86_400_000,
        );
        return { row, occurrence, daysUntil };
      })
      .filter(({ daysUntil }) => daysUntil >= 0 && daysUntil <= days)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }

  /**
   * One holiday (company-scoped).
   */
  async get(id: string, companyId: string): Promise<unknown> {
    const holiday = await this.findOrThrow(id, companyId);
    return this.mapHoliday(holiday);
  }

  /**
   * Recomputes attendance for each distinct calendar month touched by the dates.
   */
  private async recalculateAffectedMonths(
    companyId: string,
    dates: Date[],
  ): Promise<void> {
    const months = new Map<string, { month: number; year: number }>();
    for (const date of dates) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      months.set(`${year}-${month}`, { month, year });
    }
    for (const { month, year } of months.values()) {
      try {
        const result =
          await this.attendanceService.recalculateCompanyAttendanceMonth(
            companyId,
            month,
            year,
          );
        this.logger.log(
          `Recalculated attendance after public-holiday change: ${year}-${String(month).padStart(2, '0')} (${result.updated} records)`,
        );
      } catch (error: unknown) {
        this.logger.error(
          `Failed to recalculate attendance for ${year}-${month} after public-holiday change`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    }
  }

  private async findOrThrow(
    id: string,
    companyId: string,
  ): Promise<Prisma.PublicHolidayGetPayload<object>> {
    const holiday = await this.prisma.publicHoliday.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!holiday) {
      throw new NotFoundException('Public holiday not found');
    }
    return holiday;
  }

  private mapHoliday(
    row: Prisma.PublicHolidayGetPayload<object>,
  ): Record<string, unknown> {
    const today = todayUtc();
    const occurrence = this.nextOccurrence(row.date, row.isRecurring, today);
    const daysUntil = Math.round(
      (occurrence.getTime() - today.getTime()) / 86_400_000,
    );
    return {
      ...row,
      date: formatDateOnly(row.date),
      daysUntil,
      isPast: daysUntil < 0 && !row.isRecurring,
    };
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

  private throwIfUnique(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A holiday already exists on this date for the selected nationality',
      );
    }
  }
}
