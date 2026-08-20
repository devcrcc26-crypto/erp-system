import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { LeavePolicyService } from './leave-policy.service';

/**
 * Annual leave balance roll-forward on 1 January.
 */
@Injectable()
export class LeaveBalanceCronService {
  private readonly logger = new Logger(LeaveBalanceCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leavePolicyService: LeavePolicyService,
  ) {}

  @Cron('0 0 1 1 *')
  async refreshBalancesForNewYear(): Promise<void> {
    const year = new Date().getFullYear();
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true },
    });

    this.logger.log(
      `Refreshing leave balances for ${companies.length} companies (year ${year})`,
    );

    for (const company of companies) {
      try {
        const result = await this.leavePolicyService.refreshAllBalances(
          company.id,
          year,
        );
        this.logger.log(
          `Company ${company.legalName}: refreshed ${result.refreshed} employees`,
        );
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed leave balance refresh for company ${company.id}: ${message}`,
        );
      }
    }
  }
}
