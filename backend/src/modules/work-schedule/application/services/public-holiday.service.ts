import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HolidayNationality, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
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
 */
@Injectable()
export class PublicHolidayService {
  constructor(private readonly prisma: PrismaService) {}

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
      return this.mapHoliday(created);
    } catch (error: unknown) {
      this.throwIfUnique(error);
      throw error;
    }
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
    await this.findOrThrow(id, companyId);
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
      return this.mapHoliday(updated);
    } catch (error: unknown) {
      this.throwIfUnique(error);
      throw error;
    }
  }

  /**
   * Deactivates a holiday (does not hard-delete). Ignored by leave calculations.
   */
  async deactivate(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    return this.update(id, { isActive: false }, companyId, userId);
  }

  /**
   * Bulk activate / deactivate holidays.
   */
  async bulkSetActive(
    dto: BulkHolidayStatusDto,
    companyId: string,
    userId: string,
  ): Promise<{ updated: number }> {
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
    return rows.map((row) => this.mapHoliday(row));
  }

  /**
   * One holiday (company-scoped).
   */
  async get(id: string, companyId: string): Promise<unknown> {
    const holiday = await this.findOrThrow(id, companyId);
    return this.mapHoliday(holiday);
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
