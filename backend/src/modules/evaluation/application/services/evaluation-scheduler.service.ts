import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EvaluationCycleStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { EvaluationService } from './evaluation.service';

@Injectable()
export class EvaluationSchedulerService {
  private readonly logger = new Logger(EvaluationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationService: EvaluationService,
  ) {}

  /**
   * Runs daily at 08:00 Ethiopia time (05:00 UTC).
   * Auto-resolves evaluations where deadlines have passed.
   *
   * Rules:
   * - Employee didn't respond in 5 days after result shared → ACCEPTED
   * - DL didn't respond to dispute in 5 days → DL_UPHELD
   * - Employee didn't respond to DL adjustment in 5 days → ACCEPTED
   */
  @Cron('0 5 * * *', {
    name: 'evaluation-auto-resolve',
    timeZone: 'UTC',
  })
  async handleAutoResolve(): Promise<void> {
    this.logger.log('[EvaluationScheduler] Running auto-resolve check...');

    try {
      const activeCompanies = await this.prisma.evaluationCycle.findMany({
        where: {
          status: EvaluationCycleStatus.ACTIVE,
          deletedAt: null,
        },
        select: { companyId: true },
        distinct: ['companyId'],
      });

      let totalResolved = 0;

      for (const { companyId } of activeCompanies) {
        const result =
          await this.evaluationService.autoResolveExpiredDeadlines(companyId);
        totalResolved += result.resolved;

        if (result.resolved > 0) {
          this.logger.log(
            `[EvaluationScheduler] Auto-resolved ${result.resolved} evaluation(s) for company ${companyId}`,
          );
          for (const item of result.resolutions) {
            this.logger.log(
              `[EvaluationScheduler] ${item.evaluationId} ${item.oldStatus}→${item.newStatus} (${item.reason}) employee=${item.employeeId}`,
            );
          }
        }
      }

      this.logger.log(
        `[EvaluationScheduler] Auto-resolve complete. Total resolved: ${totalResolved}`,
      );
    } catch (error) {
      this.logger.error(
        `[EvaluationScheduler] Auto-resolve failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Manual trigger for HR - returns how many evaluations were auto-resolved.
   */
  async triggerManualAutoResolve(companyId: string): Promise<{
    resolved: number;
    details: string;
  }> {
    this.logger.log(
      `[EvaluationScheduler] Manual auto-resolve triggered for company ${companyId}`,
    );

    const result =
      await this.evaluationService.autoResolveExpiredDeadlines(companyId);

    for (const item of result.resolutions) {
      this.logger.log(
        `[EvaluationScheduler] ${item.evaluationId} ${item.oldStatus}→${item.newStatus} (${item.reason}) employee=${item.employeeId}`,
      );
    }

    return {
      resolved: result.resolved,
      details: `Auto-resolved ${result.resolved} evaluation(s)`,
    };
  }
}
