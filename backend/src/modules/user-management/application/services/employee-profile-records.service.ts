import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSource, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  CreatePositionHistoryDto,
  EducationRecordInputDto,
  PriorEmploymentInputDto,
  UpdatePositionHistoryDto,
} from '../dtos/employee-profile-records.dtos';

const MODULE = 'users';

type Ctx = { companyId: string; userId: string };

type HistoryDb = PrismaService | Prisma.TransactionClient;

export interface EducationRecordView {
  id: string;
  userId: string;
  instituteName: string;
  graduationYear: number | null;
  subjectMajor: string | null;
  certificateType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriorEmploymentView {
  id: string;
  userId: string;
  employerName: string;
  dateFrom: string | null;
  dateTo: string | null;
  lastPosition: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PositionHistoryView {
  id: string;
  userId: string;
  positionId: string | null;
  positionTitle: string | null;
  positionTitleZh: string | null;
  salaryOverride: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HireSeedInput {
  companyId: string;
  userId: string;
  positionId?: string | null;
  salary?: number | null;
  effectiveFrom: Date;
  createdBy: string;
  note?: string;
  /** Rehire closes the open row. First hire does nothing when history already exists. */
  closePrevious?: boolean;
}

/**
 * Writes the first position-history row at hire when a position or starting
 * salary is known. Payroll uses salaryOverride when the row covers the pay date.
 */
export async function seedHirePositionHistory(
  db: HistoryDb,
  input: HireSeedInput,
): Promise<void> {
  const positionId = input.positionId?.trim() || null;
  const salary =
    input.salary != null && Number.isFinite(input.salary) ? input.salary : null;
  if (!positionId && salary == null) {
    return;
  }

  const open = await db.positionHistory.findFirst({
    where: {
      companyId: input.companyId,
      userId: input.userId,
      deletedAt: null,
      effectiveTo: null,
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, effectiveFrom: true },
  });

  if (!input.closePrevious && open) {
    return;
  }

  if (open && input.closePrevious) {
    if (open.effectiveFrom.getTime() >= input.effectiveFrom.getTime()) {
      return;
    }
    await db.positionHistory.update({
      where: { id: open.id },
      data: { effectiveTo: input.effectiveFrom, updatedBy: input.createdBy },
    });
  }

  await db.positionHistory.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      userId: input.userId,
      positionId,
      salaryOverride: salary,
      effectiveFrom: input.effectiveFrom,
      note: input.note?.trim() || 'Hired',
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function jsonSafe(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function money(value: Prisma.Decimal | null): number | null {
  if (value == null) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

@Injectable()
export class EmployeeProfileRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Replaces the employee's education rows with the form payload.
   * Undefined leaves existing rows unchanged. An empty array clears them.
   */
  async syncEducation(
    ctx: Ctx,
    userId: string,
    rows: EducationRecordInputDto[] | undefined,
  ): Promise<void> {
    if (rows === undefined) {
      return;
    }
    await this.requireUser(ctx, userId);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.educationRecord.findMany({
        where: { companyId: ctx.companyId, userId, deletedAt: null },
        select: { id: true },
      });
      const kept = new Set(
        rows.map((row) => row.id).filter((id): id is string => Boolean(id)),
      );
      const removed = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
      if (removed.length > 0) {
        await tx.educationRecord.updateMany({
          where: { id: { in: removed }, companyId: ctx.companyId, userId },
          data: { deletedAt: new Date(), deletedBy: ctx.userId, updatedBy: ctx.userId },
        });
      }
      for (const row of rows) {
        const data = {
          instituteName: row.instituteName.trim(),
          graduationYear: row.graduationYear ?? null,
          subjectMajor: row.subjectMajor?.trim() || null,
          certificateType: row.certificateType?.trim() || null,
          updatedBy: ctx.userId,
        };
        if (!data.instituteName) {
          continue;
        }
        if (row.id) {
          const updated = await tx.educationRecord.updateMany({
            where: {
              id: row.id,
              companyId: ctx.companyId,
              userId,
              deletedAt: null,
            },
            data,
          });
          if (updated.count === 0) {
            throw new NotFoundException('Education record not found');
          }
        } else {
          await tx.educationRecord.create({
            data: {
              id: randomUUID(),
              companyId: ctx.companyId,
              userId,
              createdBy: ctx.userId,
              ...data,
            },
          });
        }
      }
    });
  }

  /**
   * Replaces prior-employment rows. Undefined leaves them unchanged.
   */
  async syncPriorEmployment(
    ctx: Ctx,
    userId: string,
    rows: PriorEmploymentInputDto[] | undefined,
  ): Promise<void> {
    if (rows === undefined) {
      return;
    }
    await this.requireUser(ctx, userId);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.priorEmployment.findMany({
        where: { companyId: ctx.companyId, userId, deletedAt: null },
        select: { id: true },
      });
      const kept = new Set(
        rows.map((row) => row.id).filter((id): id is string => Boolean(id)),
      );
      const removed = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
      if (removed.length > 0) {
        await tx.priorEmployment.updateMany({
          where: { id: { in: removed }, companyId: ctx.companyId, userId },
          data: { deletedAt: new Date(), deletedBy: ctx.userId, updatedBy: ctx.userId },
        });
      }
      for (const row of rows) {
        const employerName = row.employerName.trim();
        if (!employerName) {
          continue;
        }
        const data = {
          employerName,
          dateFrom: row.dateFrom ? parseDateOnly(row.dateFrom) : null,
          dateTo: row.dateTo ? parseDateOnly(row.dateTo) : null,
          lastPosition: row.lastPosition?.trim() || null,
          updatedBy: ctx.userId,
        };
        if (row.id) {
          const updated = await tx.priorEmployment.updateMany({
            where: {
              id: row.id,
              companyId: ctx.companyId,
              userId,
              deletedAt: null,
            },
            data,
          });
          if (updated.count === 0) {
            throw new NotFoundException('Prior employment record not found');
          }
        } else {
          await tx.priorEmployment.create({
            data: {
              id: randomUUID(),
              companyId: ctx.companyId,
              userId,
              createdBy: ctx.userId,
              ...data,
            },
          });
        }
      }
    });
  }

  /** Lists higher-education rows, newest graduation year first. */
  async listEducation(ctx: Ctx, userId: string): Promise<EducationRecordView[]> {
    await this.requireUser(ctx, userId);
    const rows = await this.prisma.educationRecord.findMany({
      where: { companyId: ctx.companyId, userId, deletedAt: null },
      orderBy: [{ graduationYear: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.mapEducation(row));
  }

  /** Adds one education row. */
  async createEducation(
    ctx: Ctx,
    userId: string,
    dto: EducationRecordInputDto,
  ): Promise<EducationRecordView> {
    await this.requireUser(ctx, userId);
    const created = await this.prisma.educationRecord.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        userId,
        instituteName: dto.instituteName.trim(),
        graduationYear: dto.graduationYear ?? null,
        subjectMajor: dto.subjectMajor?.trim() || null,
        certificateType: dto.certificateType?.trim() || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    await this.audit(ctx, 'EDUCATION_CREATED', 'EducationRecord', created.id, null, created);
    return this.mapEducation(created);
  }

  /** Updates one education row owned by this employee. */
  async updateEducation(
    ctx: Ctx,
    userId: string,
    recordId: string,
    dto: EducationRecordInputDto,
  ): Promise<EducationRecordView> {
    const existing = await this.requireEducation(ctx, userId, recordId);
    const updated = await this.prisma.educationRecord.update({
      where: { id: existing.id },
      data: {
        instituteName: dto.instituteName.trim(),
        graduationYear: dto.graduationYear ?? null,
        subjectMajor: dto.subjectMajor?.trim() || null,
        certificateType: dto.certificateType?.trim() || null,
        updatedBy: ctx.userId,
      },
    });
    await this.audit(ctx, 'EDUCATION_UPDATED', 'EducationRecord', updated.id, existing, updated);
    return this.mapEducation(updated);
  }

  /** Soft-deletes one education row. */
  async deleteEducation(ctx: Ctx, userId: string, recordId: string): Promise<void> {
    const existing = await this.requireEducation(ctx, userId, recordId);
    await this.prisma.educationRecord.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId, updatedBy: ctx.userId },
    });
    await this.audit(ctx, 'EDUCATION_DELETED', 'EducationRecord', existing.id, existing, null);
  }

  /** Lists prior employers, most recent start date first. */
  async listPriorEmployment(ctx: Ctx, userId: string): Promise<PriorEmploymentView[]> {
    await this.requireUser(ctx, userId);
    const rows = await this.prisma.priorEmployment.findMany({
      where: { companyId: ctx.companyId, userId, deletedAt: null },
      orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.mapPrior(row));
  }

  /** Adds one prior-employment row. */
  async createPriorEmployment(
    ctx: Ctx,
    userId: string,
    dto: PriorEmploymentInputDto,
  ): Promise<PriorEmploymentView> {
    await this.requireUser(ctx, userId);
    const created = await this.prisma.priorEmployment.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        userId,
        employerName: dto.employerName.trim(),
        dateFrom: dto.dateFrom ? parseDateOnly(dto.dateFrom) : null,
        dateTo: dto.dateTo ? parseDateOnly(dto.dateTo) : null,
        lastPosition: dto.lastPosition?.trim() || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    await this.audit(ctx, 'PRIOR_EMPLOYMENT_CREATED', 'PriorEmployment', created.id, null, created);
    return this.mapPrior(created);
  }

  /** Updates one prior-employment row. */
  async updatePriorEmployment(
    ctx: Ctx,
    userId: string,
    recordId: string,
    dto: PriorEmploymentInputDto,
  ): Promise<PriorEmploymentView> {
    const existing = await this.requirePrior(ctx, userId, recordId);
    const updated = await this.prisma.priorEmployment.update({
      where: { id: existing.id },
      data: {
        employerName: dto.employerName.trim(),
        dateFrom: dto.dateFrom ? parseDateOnly(dto.dateFrom) : null,
        dateTo: dto.dateTo ? parseDateOnly(dto.dateTo) : null,
        lastPosition: dto.lastPosition?.trim() || null,
        updatedBy: ctx.userId,
      },
    });
    await this.audit(
      ctx,
      'PRIOR_EMPLOYMENT_UPDATED',
      'PriorEmployment',
      updated.id,
      existing,
      updated,
    );
    return this.mapPrior(updated);
  }

  /** Soft-deletes one prior-employment row. */
  async deletePriorEmployment(
    ctx: Ctx,
    userId: string,
    recordId: string,
  ): Promise<void> {
    const existing = await this.requirePrior(ctx, userId, recordId);
    await this.prisma.priorEmployment.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId, updatedBy: ctx.userId },
    });
    await this.audit(
      ctx,
      'PRIOR_EMPLOYMENT_DELETED',
      'PriorEmployment',
      existing.id,
      existing,
      null,
    );
  }

  /** Position and salary timeline, newest effective date first. */
  async listPositionHistory(ctx: Ctx, userId: string): Promise<PositionHistoryView[]> {
    await this.requireUser(ctx, userId);
    const rows = await this.prisma.positionHistory.findMany({
      where: { companyId: ctx.companyId, userId, deletedAt: null },
      include: { position: { select: { title: true, titleZh: true } } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.mapHistory(row));
  }

  /**
   * Opens a new position-history row and closes the previously active one
   * on the new effective date (exclusive end).
   */
  async createPositionHistory(
    ctx: Ctx,
    userId: string,
    dto: CreatePositionHistoryDto,
  ): Promise<PositionHistoryView> {
    await this.requireUser(ctx, userId);
    const effectiveFrom = parseDateOnly(dto.effectiveFrom);
    await this.assertPosition(ctx, dto.positionId);
    const created = await this.prisma.$transaction(async (tx) => {
      const open = await tx.positionHistory.findFirst({
        where: {
          companyId: ctx.companyId,
          userId,
          deletedAt: null,
          effectiveTo: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (open && open.effectiveFrom.getTime() >= effectiveFrom.getTime()) {
        throw new BadRequestException(
          'The effective date must be after the current position history start',
        );
      }
      if (open) {
        await tx.positionHistory.update({
          where: { id: open.id },
          data: { effectiveTo: effectiveFrom, updatedBy: ctx.userId },
        });
      }
      return tx.positionHistory.create({
        data: {
          id: randomUUID(),
          companyId: ctx.companyId,
          userId,
          positionId: dto.positionId || null,
          salaryOverride: dto.salaryOverride ?? null,
          effectiveFrom,
          note: dto.note?.trim() || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        include: { position: { select: { title: true, titleZh: true } } },
      });
    });
    await this.audit(
      ctx,
      'POSITION_HISTORY_CREATED',
      'PositionHistory',
      created.id,
      null,
      created,
    );
    return this.mapHistory(created);
  }

  /** Updates fields on one history row without moving the active window. */
  async updatePositionHistory(
    ctx: Ctx,
    userId: string,
    recordId: string,
    dto: UpdatePositionHistoryDto,
  ): Promise<PositionHistoryView> {
    const existing = await this.requireHistory(ctx, userId, recordId);
    if (dto.positionId !== undefined) {
      await this.assertPosition(ctx, dto.positionId);
    }
    const updated = await this.prisma.positionHistory.update({
      where: { id: existing.id },
      data: {
        positionId:
          dto.positionId !== undefined ? dto.positionId || null : undefined,
        salaryOverride:
          dto.salaryOverride !== undefined ? dto.salaryOverride : undefined,
        effectiveFrom: dto.effectiveFrom ? parseDateOnly(dto.effectiveFrom) : undefined,
        note: dto.note !== undefined ? dto.note?.trim() || null : undefined,
        updatedBy: ctx.userId,
      },
      include: { position: { select: { title: true, titleZh: true } } },
    });
    await this.audit(
      ctx,
      'POSITION_HISTORY_UPDATED',
      'PositionHistory',
      updated.id,
      existing,
      updated,
    );
    return this.mapHistory(updated);
  }

  /** Soft-deletes one history row. */
  async deletePositionHistory(
    ctx: Ctx,
    userId: string,
    recordId: string,
  ): Promise<void> {
    const existing = await this.requireHistory(ctx, userId, recordId);
    await this.prisma.positionHistory.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId, updatedBy: ctx.userId },
    });
    await this.audit(
      ctx,
      'POSITION_HISTORY_DELETED',
      'PositionHistory',
      existing.id,
      existing,
      null,
    );
  }

  private async requireUser(ctx: Ctx, userId: string): Promise<{ id: string }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async assertPosition(
    ctx: Ctx,
    positionId: string | null | undefined,
  ): Promise<void> {
    if (!positionId) {
      return;
    }
    const position = await this.prisma.position.findFirst({
      where: activeOnly({ id: positionId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!position) {
      throw new BadRequestException('Position not found');
    }
  }

  private async requireEducation(ctx: Ctx, userId: string, recordId: string) {
    const row = await this.prisma.educationRecord.findFirst({
      where: { id: recordId, userId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Education record not found');
    }
    return row;
  }

  private async requirePrior(ctx: Ctx, userId: string, recordId: string) {
    const row = await this.prisma.priorEmployment.findFirst({
      where: { id: recordId, userId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Prior employment record not found');
    }
    return row;
  }

  private async requireHistory(ctx: Ctx, userId: string, recordId: string) {
    const row = await this.prisma.positionHistory.findFirst({
      where: { id: recordId, userId, companyId: ctx.companyId, deletedAt: null },
      include: { position: { select: { title: true, titleZh: true } } },
    });
    if (!row) {
      throw new NotFoundException('Position history record not found');
    }
    return row;
  }

  private mapEducation(row: {
    id: string;
    userId: string;
    instituteName: string;
    graduationYear: number | null;
    subjectMajor: string | null;
    certificateType: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): EducationRecordView {
    return {
      id: row.id,
      userId: row.userId,
      instituteName: row.instituteName,
      graduationYear: row.graduationYear,
      subjectMajor: row.subjectMajor,
      certificateType: row.certificateType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapPrior(row: {
    id: string;
    userId: string;
    employerName: string;
    dateFrom: Date | null;
    dateTo: Date | null;
    lastPosition: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PriorEmploymentView {
    return {
      id: row.id,
      userId: row.userId,
      employerName: row.employerName,
      dateFrom: toDateOnly(row.dateFrom),
      dateTo: toDateOnly(row.dateTo),
      lastPosition: row.lastPosition,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapHistory(row: {
    id: string;
    userId: string;
    positionId: string | null;
    salaryOverride: Prisma.Decimal | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    note: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    position?: { title: string; titleZh: string | null } | null;
  }): PositionHistoryView {
    return {
      id: row.id,
      userId: row.userId,
      positionId: row.positionId,
      positionTitle: row.position?.title ?? null,
      positionTitleZh: row.position?.titleZh ?? null,
      salaryOverride: money(row.salaryOverride),
      effectiveFrom: toDateOnly(row.effectiveFrom) ?? '',
      effectiveTo: toDateOnly(row.effectiveTo),
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async audit(
    ctx: Ctx,
    action: string,
    recordType: string,
    recordId: string,
    beforeValue: unknown,
    afterValue: unknown,
  ): Promise<void> {
    await this.auditService.create({
      userId: ctx.userId,
      companyId: ctx.companyId,
      module: MODULE,
      action,
      recordType,
      recordId,
      beforeValue: jsonSafe(beforeValue),
      afterValue: jsonSafe(afterValue),
      source: AuditLogSource.USER_ACTION,
    });
  }
}
