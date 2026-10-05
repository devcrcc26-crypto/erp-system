import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkFromHomeScope } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { parseDateOnly } from './work-schedule.dates';
import type { CreateWorkFromHomeDayDto } from '../dtos/work-from-home-day.dto';
import type { UpdateWorkFromHomeDayDto } from '../dtos/work-from-home-day.dto';

/**
 * Company-wide work-from-home calendar days (attendance/payroll only — not leave balance).
 */
@Injectable()
export class WorkFromHomeDayService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
  ) {}

  async list(
    companyId: string,
    month?: number,
    year?: number,
  ): Promise<unknown[]> {
    const where: Prisma.WorkFromHomeDayWhereInput = activeOnly({ companyId });
    if (month != null && year != null) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      where.date = { gte: start, lte: end };
    }
    const rows = await this.prisma.workFromHomeDay.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => this.mapRow(row));
  }

  async create(
    dto: CreateWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const date = parseDateOnly(dto.date);
    try {
      const created = await this.prisma.workFromHomeDay.create({
        data: {
          id: randomUUID(),
          companyId,
          date,
          reason: dto.reason.trim(),
          scope: dto.scope ?? WorkFromHomeScope.ALL,
          departmentIds: dto.departmentIds ?? [],
          employeeIds: dto.employeeIds ?? [],
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await this.recalculateMonth(companyId, date);
      return this.mapRow(created);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A work-from-home day already exists for this date',
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateWorkFromHomeDayDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const existing = await this.findOrThrow(id, companyId);
    const updated = await this.prisma.workFromHomeDay.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: parseDateOnly(dto.date) } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.departmentIds !== undefined
          ? { departmentIds: dto.departmentIds }
          : {}),
        ...(dto.employeeIds !== undefined
          ? { employeeIds: dto.employeeIds }
          : {}),
        updatedBy: userId,
      },
    });
    await this.recalculateMonth(companyId, existing.date);
    if (dto.date !== undefined) {
      await this.recalculateMonth(companyId, parseDateOnly(dto.date));
    }
    return this.mapRow(updated);
  }

  async remove(id: string, companyId: string, userId: string): Promise<void> {
    const existing = await this.findOrThrow(id, companyId);
    await this.prisma.workFromHomeDay.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });
    await this.recalculateMonth(companyId, existing.date);
  }

  private async findOrThrow(id: string, companyId: string) {
    const row = await this.prisma.workFromHomeDay.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Work-from-home day not found');
    }
    return row;
  }

  private async recalculateMonth(companyId: string, date: Date): Promise<void> {
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    await this.attendanceService.recalculateCompanyAttendanceMonth(
      companyId,
      month,
      year,
    );
  }

  private mapRow(row: Prisma.WorkFromHomeDayGetPayload<object>): unknown {
    return {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      reason: row.reason,
      scope: row.scope,
      departmentIds: row.departmentIds,
      employeeIds: row.employeeIds,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
