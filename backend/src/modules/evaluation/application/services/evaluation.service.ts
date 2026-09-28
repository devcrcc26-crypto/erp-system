import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EvaluationCycleStatus,
  EvaluationDisputeStage,
  EvaluationStage,
  EvaluationStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  CreateEmployeeEvaluationDto,
  DisputeEvaluationDto,
  DLRespondToDisputeDto,
  EmployeeRespondToDLDto,
  HRDecideDisputeDto,
  SubmitAssessmentDto,
} from '../dtos/evaluation.dtos';

interface ServiceContext {
  userId: string;
  companyId: string;
}

const DISPUTE_DEADLINE_DAYS = 5;

type CriteriaWeight = { id: string; weight: number | Decimal };

@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private async getEvaluation(id: string, companyId: string) {
    const evaluation = await this.prisma.employeeEvaluation.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        cycle: {
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
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
        teamLead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
        disciplineLead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
        assessments: {
          include: {
            scores: true,
          },
        },
        disputes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }
    return evaluation;
  }

  /**
   * Calculates weighted average score from assessment scores.
   * N/A scores (null) are excluded from the average.
   */
  private calculateAverage(
    scores: Array<{ score?: number | null; criteriaId: string }>,
    criteria: CriteriaWeight[],
  ): number | null {
    const scoredItems = scores.filter((s) => s.score !== null && s.score !== undefined);
    if (scoredItems.length === 0) {
      return null;
    }

    let totalWeight = 0;
    let weightedSum = 0;

    for (const item of scoredItems) {
      const criterion = criteria.find((c) => c.id === item.criteriaId);
      if (criterion && item.score !== null && item.score !== undefined) {
        const weight = Number(criterion.weight);
        weightedSum += item.score * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) {
      return null;
    }
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }

  /**
   * Calculates the consolidated final score as average of
   * self + team lead + discipline lead assessments.
   */
  private calculateFinalScore(
    assessments: Array<{ stage: EvaluationStage; overallAvg: Decimal | null }>,
  ): number | null {
    const stages: EvaluationStage[] = [
      EvaluationStage.SELF,
      EvaluationStage.TEAM_LEAD,
      EvaluationStage.DISCIPLINE_LEAD,
    ];
    const scores = assessments
      .filter((a) => stages.includes(a.stage) && a.overallAvg !== null)
      .map((a) => Number(a.overallAvg));

    if (scores.length === 0) {
      return null;
    }
    const sum = scores.reduce((acc, s) => acc + s, 0);
    return Math.round((sum / scores.length) * 100) / 100;
  }

  private async upsertAssessmentScores(params: {
    evaluationId: string;
    stage: EvaluationStage;
    assessorId: string;
    dto: SubmitAssessmentDto;
    avg: number | null;
    existingId?: string;
    userId: string;
  }): Promise<void> {
    const { evaluationId, stage, assessorId, dto, avg, existingId, userId } =
      params;

    if (existingId) {
      await this.prisma.evaluationAssessment.update({
        where: { id: existingId },
        data: {
          comment: dto.comment,
          overallAvg: avg !== null ? new Decimal(avg) : null,
          submittedAt: new Date(),
          updatedBy: userId,
        },
      });
      await this.prisma.evaluationScore.deleteMany({
        where: { assessmentId: existingId },
      });
      await this.prisma.evaluationScore.createMany({
        data: dto.scores.map((s) => ({
          id: randomUUID(),
          assessmentId: existingId,
          criteriaId: s.criteriaId,
          score: s.score ?? null,
          comment: s.comment,
          createdBy: userId,
          updatedBy: userId,
        })),
      });
      return;
    }

    const assessment = await this.prisma.evaluationAssessment.create({
      data: {
        id: randomUUID(),
        evaluationId,
        stage,
        assessorId,
        comment: dto.comment,
        overallAvg: avg !== null ? new Decimal(avg) : null,
        submittedAt: new Date(),
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await this.prisma.evaluationScore.createMany({
      data: dto.scores.map((s) => ({
        id: randomUUID(),
        assessmentId: assessment.id,
        criteriaId: s.criteriaId,
        score: s.score ?? null,
        comment: s.comment,
        createdBy: userId,
        updatedBy: userId,
      })),
    });
  }

  // ─── List / Get ───────────────────────────────────────────────────────────

  /**
   * Lists employee evaluations with optional filters.
   */
  async listEvaluations(
    companyId: string,
    filters: {
      cycleId?: string;
      employeeId?: string;
      status?: EvaluationStatus | string;
      disciplineLeadId?: string;
      teamLeadId?: string;
    },
  ): Promise<unknown> {
    return this.prisma.employeeEvaluation.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(filters.cycleId ? { cycleId: filters.cycleId } : {}),
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.status
          ? { status: filters.status as EvaluationStatus }
          : {}),
        ...(filters.disciplineLeadId
          ? { disciplineLeadId: filters.disciplineLeadId }
          : {}),
        ...(filters.teamLeadId ? { teamLeadId: filters.teamLeadId } : {}),
      },
      include: {
        cycle: { select: { quarter: true, year: true, status: true } },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
        teamLead: {
          select: { id: true, firstName: true, lastName: true },
        },
        disciplineLead: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { assessments: true, disputes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Evaluations where the user must act as Discipline Lead or Team Lead.
   */
  async getPendingMyAction(
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const [asDl, asTl] = await Promise.all([
      this.listEvaluations(companyId, { disciplineLeadId: userId }),
      this.listEvaluations(companyId, { teamLeadId: userId }),
    ]);

    type EvaluationRow = {
      id: string;
      status: EvaluationStatus;
      disciplineLeadId: string | null;
      teamLeadId: string | null;
    };

    const all = [...(asDl as EvaluationRow[]), ...(asTl as EvaluationRow[])].filter(
      (ev, idx, arr) => arr.findIndex((e) => e.id === ev.id) === idx,
    );

    return all.filter((ev) => {
      const isDl = ev.disciplineLeadId === userId;
      const isTl = ev.teamLeadId === userId;

      if (isDl) {
        return (
          ev.status === EvaluationStatus.TEAM_LEAD_ASSESSED ||
          ev.status === EvaluationStatus.DISPUTED
        );
      }
      if (isTl) {
        return ev.status === EvaluationStatus.SELF_ASSESSED;
      }
      return false;
    });
  }

  /**
   * Returns a single evaluation by id (visibility filtering done at controller).
   */
  async getEvaluationById(
    id: string,
    companyId: string,
    _requesterId: string,
  ): Promise<unknown> {
    return this.getEvaluation(id, companyId);
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  /**
   * Creates one employee evaluation for an ACTIVE cycle.
   */
  async createEvaluation(
    dto: CreateEmployeeEvaluationDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const cycle = await this.prisma.evaluationCycle.findFirst({
      where: { id: dto.cycleId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!cycle) {
      throw new NotFoundException('Evaluation cycle not found');
    }
    if (cycle.status !== EvaluationCycleStatus.ACTIVE) {
      throw new BadRequestException(
        'Evaluations can only be created for ACTIVE cycles',
      );
    }

    const employee = await this.prisma.user.findFirst({
      where: {
        id: dto.employeeId,
        companyId: ctx.companyId,
        deletedAt: null,
      },
      include: {
        engineeringDiscipline: {
          include: {
            leader: { select: { id: true } },
            localLeader: { select: { id: true } },
          },
        },
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const existing = await this.prisma.employeeEvaluation.findFirst({
      where: {
        cycleId: dto.cycleId,
        employeeId: dto.employeeId,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'An evaluation already exists for this employee in this cycle',
      );
    }

    const teamLeadId =
      dto.teamLeadId ??
      employee.engineeringDiscipline?.localLeader?.id ??
      null;
    const disciplineLeadId =
      employee.engineeringDiscipline?.leader?.id ?? null;

    const activeContract = await this.prisma.employeeContract.findFirst({
      where: {
        employeeId: dto.employeeId,
        companyId: ctx.companyId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      orderBy: { startDate: 'desc' },
    });

    return this.prisma.employeeEvaluation.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        cycleId: dto.cycleId,
        employeeId: dto.employeeId,
        teamLeadId,
        disciplineLeadId,
        contractId: dto.contractId ?? activeContract?.id ?? null,
        status: EvaluationStatus.PENDING,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
        cycle: { select: { quarter: true, year: true } },
      },
    });
  }

  /**
   * Bulk-creates evaluations for all active employees in a cycle.
   */
  async createEvaluationsForCycle(
    cycleId: string,
    ctx: ServiceContext,
  ): Promise<{ created: number; skipped: number; total: number }> {
    const cycle = await this.prisma.evaluationCycle.findFirst({
      where: { id: cycleId, companyId: ctx.companyId, deletedAt: null },
    });
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }
    if (cycle.status !== EvaluationCycleStatus.ACTIVE) {
      throw new BadRequestException(
        'Cycle must be ACTIVE to create evaluations',
      );
    }

    const employees = await this.prisma.user.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        engineeringDiscipline: {
          include: {
            leader: { select: { id: true } },
            localLeader: { select: { id: true } },
          },
        },
      },
    });

    let created = 0;
    let skipped = 0;

    for (const employee of employees) {
      const existing = await this.prisma.employeeEvaluation.findFirst({
        where: { cycleId, employeeId: employee.id, deletedAt: null },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const activeContract = await this.prisma.employeeContract.findFirst({
        where: {
          employeeId: employee.id,
          companyId: ctx.companyId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        orderBy: { startDate: 'desc' },
      });

      await this.prisma.employeeEvaluation.create({
        data: {
          id: randomUUID(),
          companyId: ctx.companyId,
          cycleId,
          employeeId: employee.id,
          teamLeadId: employee.engineeringDiscipline?.localLeader?.id ?? null,
          disciplineLeadId: employee.engineeringDiscipline?.leader?.id ?? null,
          contractId: activeContract?.id ?? null,
          status: EvaluationStatus.PENDING,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      created++;
    }

    return { created, skipped, total: employees.length };
  }

  // ─── Stage 1: Self Assessment ─────────────────────────────────────────────

  /**
   * Submits or updates the employee's self-assessment.
   */
  async submitSelfAssessment(
    evaluationId: string,
    dto: SubmitAssessmentDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.employeeId !== ctx.userId) {
      throw new ForbiddenException(
        'You can only submit your own self-assessment',
      );
    }

    if (
      evaluation.status !== EvaluationStatus.PENDING &&
      evaluation.status !== EvaluationStatus.SELF_ASSESSED
    ) {
      throw new BadRequestException(
        `Cannot submit self-assessment in status: ${evaluation.status}`,
      );
    }

    const allCriteria = evaluation.cycle.template.sections.flatMap(
      (s) => s.criteria,
    );
    const avg = this.calculateAverage(dto.scores, allCriteria);
    const existing = evaluation.assessments.find(
      (a) => a.stage === EvaluationStage.SELF,
    );

    await this.upsertAssessmentScores({
      evaluationId,
      stage: EvaluationStage.SELF,
      assessorId: ctx.userId,
      dto,
      avg,
      existingId: existing?.id,
      userId: ctx.userId,
    });

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.SELF_ASSESSED,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Stage 2: Team Lead Assessment ────────────────────────────────────────

  /**
   * Submits or updates the Team Lead assessment.
   */
  async submitTeamLeadAssessment(
    evaluationId: string,
    dto: SubmitAssessmentDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.teamLeadId !== ctx.userId) {
      throw new ForbiddenException(
        'You are not the assigned Team Lead for this evaluation',
      );
    }

    if (evaluation.status !== EvaluationStatus.SELF_ASSESSED) {
      throw new BadRequestException(
        `Team Lead assessment requires SELF_ASSESSED status. Current: ${evaluation.status}`,
      );
    }

    const allCriteria = evaluation.cycle.template.sections.flatMap(
      (s) => s.criteria,
    );
    const avg = this.calculateAverage(dto.scores, allCriteria);
    const existing = evaluation.assessments.find(
      (a) => a.stage === EvaluationStage.TEAM_LEAD,
    );

    await this.upsertAssessmentScores({
      evaluationId,
      stage: EvaluationStage.TEAM_LEAD,
      assessorId: ctx.userId,
      dto,
      avg,
      existingId: existing?.id,
      userId: ctx.userId,
    });

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.TEAM_LEAD_ASSESSED,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Stage 3: Discipline Lead Assessment + Consolidation ──────────────────

  /**
   * Submits Discipline Lead assessment and consolidates the final score.
   */
  async submitDisciplineLeadAssessment(
    evaluationId: string,
    dto: SubmitAssessmentDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.disciplineLeadId !== ctx.userId) {
      throw new ForbiddenException(
        'You are not the assigned Discipline Lead for this evaluation',
      );
    }

    if (evaluation.status !== EvaluationStatus.TEAM_LEAD_ASSESSED) {
      throw new BadRequestException(
        `Discipline Lead assessment requires TEAM_LEAD_ASSESSED status. Current: ${evaluation.status}`,
      );
    }

    const allCriteria = evaluation.cycle.template.sections.flatMap(
      (s) => s.criteria,
    );
    const avg = this.calculateAverage(dto.scores, allCriteria);
    const existing = evaluation.assessments.find(
      (a) => a.stage === EvaluationStage.DISCIPLINE_LEAD,
    );

    await this.upsertAssessmentScores({
      evaluationId,
      stage: EvaluationStage.DISCIPLINE_LEAD,
      assessorId: ctx.userId,
      dto,
      avg,
      existingId: existing?.id,
      userId: ctx.userId,
    });

    const updatedEval = await this.getEvaluation(evaluationId, ctx.companyId);
    const finalScore = this.calculateFinalScore(updatedEval.assessments);

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.DISCIPLINE_ASSESSED,
        finalScore: finalScore !== null ? new Decimal(finalScore) : null,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Share result with employee ────────────────────────────────────────────

  /**
   * Shares the consolidated result with the employee and starts the 5-day clock.
   */
  async shareResultWithEmployee(
    evaluationId: string,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.status !== EvaluationStatus.DISCIPLINE_ASSESSED) {
      throw new BadRequestException(
        'Result can only be shared after Discipline Lead assessment',
      );
    }

    const now = new Date();
    const employeeRespondBy = this.addDays(now, DISPUTE_DEADLINE_DAYS);

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.RESULT_SHARED,
        resultSharedAt: now,
        employeeRespondBy,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Employee accepts result ───────────────────────────────────────────────

  /**
   * Employee accepts the shared (or DL-resolved) result.
   */
  async acceptResult(
    evaluationId: string,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.employeeId !== ctx.userId) {
      throw new ForbiddenException(
        'You can only accept your own evaluation result',
      );
    }

    if (
      evaluation.status !== EvaluationStatus.RESULT_SHARED &&
      evaluation.status !== EvaluationStatus.DL_UPHELD &&
      evaluation.status !== EvaluationStatus.DL_ADJUSTED
    ) {
      throw new BadRequestException(
        `Cannot accept result in status: ${evaluation.status}`,
      );
    }

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.ACCEPTED,
        lockedAt: new Date(),
        lockedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Employee disputes result ──────────────────────────────────────────────

  /**
   * Employee disputes a shared or DL-adjusted result.
   */
  async disputeResult(
    evaluationId: string,
    dto: DisputeEvaluationDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.employeeId !== ctx.userId) {
      throw new ForbiddenException(
        'You can only dispute your own evaluation result',
      );
    }

    if (
      evaluation.status !== EvaluationStatus.RESULT_SHARED &&
      evaluation.status !== EvaluationStatus.DL_ADJUSTED
    ) {
      throw new BadRequestException(
        `Cannot dispute result in status: ${evaluation.status}`,
      );
    }

    const deadline =
      evaluation.status === EvaluationStatus.DL_ADJUSTED
        ? evaluation.employeeAdjRespondBy
        : evaluation.employeeRespondBy;

    if (deadline && new Date() > deadline) {
      throw new BadRequestException(
        'Dispute deadline has passed. The result has been auto-accepted.',
      );
    }

    const now = new Date();
    const dlRespondBy = this.addDays(now, DISPUTE_DEADLINE_DAYS);

    await this.prisma.evaluationDispute.create({
      data: {
        id: randomUUID(),
        evaluationId,
        initiatedBy: ctx.userId,
        reason: dto.reason,
        stage: EvaluationDisputeStage.SUBMITTED_TO_DL,
      },
    });

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.DISPUTED,
        dlRespondBy,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── DL responds to dispute ────────────────────────────────────────────────

  /**
   * Discipline Lead upholds or adjusts a disputed evaluation.
   */
  async dlRespondToDispute(
    evaluationId: string,
    dto: DLRespondToDisputeDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.disciplineLeadId !== ctx.userId) {
      throw new ForbiddenException(
        'You are not the assigned Discipline Lead for this evaluation',
      );
    }

    if (evaluation.status !== EvaluationStatus.DISPUTED) {
      throw new BadRequestException(
        `DL can only respond to disputes in DISPUTED status. Current: ${evaluation.status}`,
      );
    }

    const activeDispute = evaluation.disputes.find(
      (d) => d.stage === EvaluationDisputeStage.SUBMITTED_TO_DL,
    );
    if (!activeDispute) {
      throw new NotFoundException('Active dispute not found');
    }

    const now = new Date();
    const employeeAdjRespondBy = this.addDays(now, DISPUTE_DEADLINE_DAYS);

    await this.prisma.evaluationDispute.update({
      where: { id: activeDispute.id },
      data: {
        dlRespondedAt: now,
        dlRespondedBy: ctx.userId,
        dlDecision: dto.decision,
        dlComment: dto.comment,
        dlAdjustedScore:
          dto.decision === 'ADJUSTED' && dto.adjustedScore != null
            ? new Decimal(dto.adjustedScore)
            : null,
        stage: EvaluationDisputeStage.DL_RESPONDED,
      },
    });

    const newStatus =
      dto.decision === 'UPHELD'
        ? EvaluationStatus.DL_UPHELD
        : EvaluationStatus.DL_ADJUSTED;

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: newStatus,
        adjustedScore:
          dto.decision === 'ADJUSTED' && dto.adjustedScore != null
            ? new Decimal(dto.adjustedScore)
            : undefined,
        dlAdjustedAt: dto.decision === 'ADJUSTED' ? now : undefined,
        employeeAdjRespondBy:
          dto.decision === 'ADJUSTED' ? employeeAdjRespondBy : undefined,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Employee responds to DL decision ─────────────────────────────────────

  /**
   * Employee accepts a DL decision or escalates to HR.
   */
  async employeeRespondToDL(
    evaluationId: string,
    dto: EmployeeRespondToDLDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.employeeId !== ctx.userId) {
      throw new ForbiddenException(
        'You can only respond to your own evaluation',
      );
    }

    if (
      evaluation.status !== EvaluationStatus.DL_UPHELD &&
      evaluation.status !== EvaluationStatus.DL_ADJUSTED
    ) {
      throw new BadRequestException(
        `Cannot respond to DL decision in status: ${evaluation.status}`,
      );
    }

    if (dto.decision === 'ACCEPTED') {
      await this.prisma.employeeEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: EvaluationStatus.ACCEPTED,
          lockedAt: new Date(),
          lockedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
    } else {
      const activeDispute = evaluation.disputes[0];
      if (activeDispute) {
        await this.prisma.evaluationDispute.update({
          where: { id: activeDispute.id },
          data: {
            stage: EvaluationDisputeStage.ESCALATED_TO_HR,
            employeeAcknowledgedAt: new Date(),
            employeeDecision: 'ESCALATED',
            employeeEscalationReason: dto.escalationReason,
          },
        });
      }

      await this.prisma.employeeEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: EvaluationStatus.ESCALATED,
          updatedBy: ctx.userId,
        },
      });
    }

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── HR decides escalated dispute ─────────────────────────────────────────

  /**
   * HR makes a final decision on an escalated dispute.
   */
  async hrDecideDispute(
    evaluationId: string,
    dto: HRDecideDisputeDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (evaluation.status !== EvaluationStatus.ESCALATED) {
      throw new BadRequestException(
        `HR can only decide on ESCALATED evaluations. Current: ${evaluation.status}`,
      );
    }

    const activeDispute = evaluation.disputes.find(
      (d) => d.stage === EvaluationDisputeStage.ESCALATED_TO_HR,
    );
    if (!activeDispute) {
      throw new NotFoundException('Escalated dispute not found');
    }

    const now = new Date();

    await this.prisma.evaluationDispute.update({
      where: { id: activeDispute.id },
      data: {
        hrRespondedAt: now,
        hrRespondedBy: ctx.userId,
        hrDecision: dto.decision,
        hrComment: dto.comment,
        hrFinalScore:
          dto.decision === 'ADJUSTED' && dto.adjustedScore != null
            ? new Decimal(dto.adjustedScore)
            : null,
        stage: EvaluationDisputeStage.HR_DECIDED,
      },
    });

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.HR_DECIDED,
        adjustedScore:
          dto.decision === 'ADJUSTED' && dto.adjustedScore != null
            ? new Decimal(dto.adjustedScore)
            : undefined,
        lockedAt: now,
        lockedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Lock evaluation (HR files it) ────────────────────────────────────────

  /**
   * Locks an accepted or HR-decided evaluation for archival.
   */
  async lockEvaluation(
    evaluationId: string,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const evaluation = await this.getEvaluation(evaluationId, ctx.companyId);

    if (
      evaluation.status !== EvaluationStatus.ACCEPTED &&
      evaluation.status !== EvaluationStatus.HR_DECIDED
    ) {
      throw new BadRequestException(
        `Can only lock ACCEPTED or HR_DECIDED evaluations. Current: ${evaluation.status}`,
      );
    }

    await this.prisma.employeeEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: EvaluationStatus.LOCKED,
        lockedAt: evaluation.lockedAt ?? new Date(),
        lockedBy: evaluation.lockedBy ?? ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return this.getEvaluation(evaluationId, ctx.companyId);
  }

  // ─── Auto-resolve expired deadlines ───────────────────────────────────────

  /**
   * Auto-resolves evaluations whose dispute / response deadlines have expired.
   */
  async autoResolveExpiredDeadlines(
    companyId: string,
  ): Promise<{ resolved: number }> {
    const now = new Date();
    let resolved = 0;

    const expiredResultShared = await this.prisma.employeeEvaluation.findMany({
      where: {
        companyId,
        status: EvaluationStatus.RESULT_SHARED,
        employeeRespondBy: { lt: now },
        deletedAt: null,
      },
    });

    for (const ev of expiredResultShared) {
      await this.prisma.employeeEvaluation.update({
        where: { id: ev.id },
        data: {
          status: EvaluationStatus.ACCEPTED,
          lockedAt: now,
          lockedBy: ev.updatedBy,
          updatedBy: ev.updatedBy,
        },
      });
      resolved++;
    }

    const expiredDisputed = await this.prisma.employeeEvaluation.findMany({
      where: {
        companyId,
        status: EvaluationStatus.DISPUTED,
        dlRespondBy: { lt: now },
        deletedAt: null,
      },
    });

    for (const ev of expiredDisputed) {
      await this.prisma.evaluationDispute.updateMany({
        where: {
          evaluationId: ev.id,
          stage: EvaluationDisputeStage.SUBMITTED_TO_DL,
        },
        data: {
          dlRespondedAt: now,
          dlDecision: 'UPHELD',
          dlComment: 'Auto-upheld: no response within 5 days',
          stage: EvaluationDisputeStage.DL_RESPONDED,
        },
      });
      await this.prisma.employeeEvaluation.update({
        where: { id: ev.id },
        data: {
          status: EvaluationStatus.DL_UPHELD,
          updatedBy: ev.updatedBy,
        },
      });
      resolved++;
    }

    const expiredDLAdjusted = await this.prisma.employeeEvaluation.findMany({
      where: {
        companyId,
        status: EvaluationStatus.DL_ADJUSTED,
        employeeAdjRespondBy: { lt: now },
        deletedAt: null,
      },
    });

    for (const ev of expiredDLAdjusted) {
      await this.prisma.employeeEvaluation.update({
        where: { id: ev.id },
        data: {
          status: EvaluationStatus.ACCEPTED,
          lockedAt: now,
          lockedBy: ev.updatedBy,
          updatedBy: ev.updatedBy,
        },
      });
      resolved++;
    }

    return { resolved };
  }

  // ─── Contract renewal view ────────────────────────────────────────────────

  /**
   * Returns locked/accepted evaluations linked to a contract (renewal view).
   */
  async getEvaluationHistoryForContract(
    contractId: string,
    companyId: string,
  ): Promise<unknown> {
    return this.prisma.employeeEvaluation.findMany({
      where: {
        contractId,
        companyId,
        deletedAt: null,
        status: {
          in: [
            EvaluationStatus.ACCEPTED,
            EvaluationStatus.HR_DECIDED,
            EvaluationStatus.LOCKED,
          ],
        },
      },
      include: {
        cycle: { select: { quarter: true, year: true } },
        assessments: {
          include: {
            scores: {
              include: {
                criteria: {
                  include: { section: true },
                },
              },
            },
          },
          orderBy: { stage: 'asc' },
        },
        disputes: true,
      },
      orderBy: [
        { cycle: { year: 'asc' } },
        { cycle: { quarter: 'asc' } },
      ],
    });
  }
}
