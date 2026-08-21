import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { LeavePolicyService } from './leave-policy.service';

/**
 * Leave balance refresh:
 * - daily at 06:00 for employees whose first contract anniversary is today
 * - 1 January safety net for employees with no contract start date
 */
@Injectable()
export class LeaveBalanceCronService {
  private readonly logger = new Logger(LeaveBalanceCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leavePolicyService: LeavePolicyService,
  ) {}

  /**
   * Refreshes balances on the anniversary of each employee's first contract.
   */
  @Cron('0 6 * * *')
  async refreshAnniversaryBalances(): Promise<void> {
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    const currentYear = today.getFullYear();

    const employees = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        leavePolicyId: { not: null },
        employeeContractEmployee: {
          some: {
            status: 'ACTIVE',
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        companyId: true,
        employeeContractEmployee: {
          where: { deletedAt: null },
          orderBy: { startDate: 'asc' },
          take: 1,
          select: { startDate: true },
        },
      },
    });

    let refreshed = 0;
    for (const employee of employees) {
      const firstContract = employee.employeeContractEmployee[0];
      if (!firstContract?.startDate) {
        continue;
      }

      const startDate = firstContract.startDate;
      const contractMonth = startDate.getUTCMonth() + 1;
      const contractDay = startDate.getUTCDate();
      if (contractMonth !== todayMonth || contractDay !== todayDay) {
        continue;
      }
      if (startDate.getUTCFullYear() === currentYear) {
        continue;
      }

      try {
        await this.leavePolicyService.refreshEmployeeBalances(
          employee.id,
          employee.companyId,
          currentYear,
          startDate,
        );
        refreshed += 1;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed anniversary leave refresh for employee ${employee.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Anniversary leave refresh complete: ${refreshed} employee(s) for ${currentYear}`,
    );
  }

  /**
   * 1 January fallback for active employees who have no contract start date.
   */
  @Cron('0 0 1 1 *')
  async refreshBalancesForNewYear(): Promise<void> {
    const year = new Date().getFullYear();
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true },
    });

    this.logger.log(
      `Refreshing leave balances (no-contract safety net) for ${companies.length} companies (year ${year})`,
    );

    for (const company of companies) {
      try {
        const result = await this.leavePolicyService.refreshAllBalances(
          company.id,
          year,
        );
        this.logger.log(
          `Company ${company.legalName}: refreshed ${result.refreshed} employees without a contract start date`,
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
