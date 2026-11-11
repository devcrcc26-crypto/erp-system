import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { StateProjectionService } from '../../application/services/state-projection.service';
import { WorkflowTransactionRunner } from '../../application/services/workflow-transaction-runner.service';

const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000001';

/**
 * Nightly projection drift reconciliation across all companies.
 */
@Injectable()
export class ProjectionReconciliationCron {
  private readonly logger = new Logger(ProjectionReconciliationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateProjection: StateProjectionService,
    private readonly workflowTransactionRunner: WorkflowTransactionRunner,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async reconcileAllCompanies(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: activeOnly({}),
      select: { id: true },
    });

    for (const company of companies) {
      const { corrections } = await this.workflowTransactionRunner.runPhaseABOnly(
        async (tx) =>
          this.stateProjection.reconcileCompanyInTx(tx, company.id, SYSTEM_ACTOR),
      );
      if (corrections.length > 0) {
        this.logger.warn(
          `Reconciled ${corrections.length} projection drifts for company ${company.id}`,
        );
      }
    }
  }
}
