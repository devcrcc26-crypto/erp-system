import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EvaluationCycleStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  CreateEvaluationCycleDto,
  UpdateEvaluationCycleDto,
} from '../dtos/evaluation-cycle.dtos';

interface ServiceContext {
  userId: string;
  companyId: string;
}

@Injectable()
export class EvaluationCycleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns period dates for a given quarter and year.
   * Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
   */
  getQuarterDates(
    quarter: number,
    year: number,
  ): { periodStart: Date; periodEnd: Date } {
    const starts = [
      new Date(`${year}-01-01`),
      new Date(`${year}-04-01`),
      new Date(`${year}-07-01`),
      new Date(`${year}-10-01`),
    ];
    const ends = [
      new Date(`${year}-03-31`),
      new Date(`${year}-06-30`),
      new Date(`${year}-09-30`),
      new Date(`${year}-12-31`),
    ];
    return {
      periodStart: starts[quarter - 1],
      periodEnd: ends[quarter - 1],
    };
  }

  /**
   * Lists evaluation cycles for a company (newest first).
   */
  async listCycles(companyId: string): Promise<unknown> {
    return this.prisma.evaluationCycle.findMany({
      where: { companyId, deletedAt: null },
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { evaluations: true } },
      },
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
    });
  }

  /**
   * Returns a single evaluation cycle with its template structure.
   */
  async getCycle(id: string, companyId: string): Promise<{
    id: string;
    status: EvaluationCycleStatus;
    evalStart: Date | null;
    evalEnd: Date | null;
    notes: string | null;
  }> {
    const cycle = await this.prisma.evaluationCycle.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        template: {
          include: {
            sections: {
              orderBy: { sortOrder: 'asc' },
              include: {
                criteria: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
        _count: { select: { evaluations: true } },
      },
    });
    if (!cycle) {
      throw new NotFoundException('Evaluation cycle not found');
    }
    return cycle;
  }

  /**
   * Creates a DRAFT evaluation cycle for a quarter/year.
   */
  async createCycle(
    dto: CreateEvaluationCycleDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const existing = await this.prisma.evaluationCycle.findFirst({
      where: {
        companyId: ctx.companyId,
        quarter: dto.quarter,
        year: dto.year,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Evaluation cycle for Q${dto.quarter} ${dto.year} already exists`,
      );
    }

    let templateId = dto.templateId;
    if (!templateId) {
      const activeTemplate = await this.prisma.evaluationTemplate.findFirst({
        where: {
          companyId: ctx.companyId,
          isActive: true,
          deletedAt: null,
        },
      });
      if (!activeTemplate) {
        throw new BadRequestException(
          'No active evaluation template found. Please create one first.',
        );
      }
      templateId = activeTemplate.id;
    }

    const { periodStart, periodEnd } = this.getQuarterDates(
      dto.quarter,
      dto.year,
    );

    return this.prisma.evaluationCycle.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        templateId,
        quarter: dto.quarter,
        year: dto.year,
        periodStart,
        periodEnd,
        evalStart: dto.evalStart ? new Date(dto.evalStart) : null,
        evalEnd: dto.evalEnd ? new Date(dto.evalEnd) : null,
        status: EvaluationCycleStatus.DRAFT,
        notes: dto.notes,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: {
        template: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Updates cycle status, evaluation window, or notes.
   */
  async updateCycle(
    id: string,
    dto: UpdateEvaluationCycleDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const cycle = await this.getCycle(id, ctx.companyId);

    if (
      cycle.status === EvaluationCycleStatus.CLOSED &&
      dto.status === EvaluationCycleStatus.ACTIVE
    ) {
      throw new BadRequestException('Cannot reopen a closed evaluation cycle');
    }

    return this.prisma.evaluationCycle.update({
      where: { id: cycle.id },
      data: {
        status: dto.status ?? cycle.status,
        evalStart: dto.evalStart ? new Date(dto.evalStart) : cycle.evalStart,
        evalEnd: dto.evalEnd ? new Date(dto.evalEnd) : cycle.evalEnd,
        notes: dto.notes ?? cycle.notes,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Activates a DRAFT cycle so evaluations can be created.
   */
  async activateCycle(id: string, ctx: ServiceContext): Promise<unknown> {
    const cycle = await this.getCycle(id, ctx.companyId);
    if (cycle.status !== EvaluationCycleStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT cycles can be activated');
    }
    return this.prisma.evaluationCycle.update({
      where: { id },
      data: {
        status: EvaluationCycleStatus.ACTIVE,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Closes an ACTIVE cycle.
   */
  async closeCycle(id: string, ctx: ServiceContext): Promise<unknown> {
    const cycle = await this.getCycle(id, ctx.companyId);
    if (cycle.status !== EvaluationCycleStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE cycles can be closed');
    }
    return this.prisma.evaluationCycle.update({
      where: { id },
      data: {
        status: EvaluationCycleStatus.CLOSED,
        updatedBy: ctx.userId,
      },
    });
  }
}
