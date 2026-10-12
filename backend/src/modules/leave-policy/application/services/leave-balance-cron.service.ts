import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  isEmploymentAnniversary,
  toDateOnlyUtc,
} from '../utils/leave-year.util';
import { LeaveLedgerService } from './leave-ledger.service';
import { LeavePolicyService } from './leave-policy.service';

/**
 * Leave balance refresh (ledger):
 * - daily at 06:00: employees whose employment anniversary is today open a new
 *   leave year (entitlement for their service years + annual carry-over /
 *   expiry). Idempotent per leave year, so a renewal contract on the same day
 *   never grants twice.
 * - 1 January safety net for employees with no employment date or contract
 */
@Injectable()
export class LeaveBalanceCronService {
  private readonly logger = new Logger(LeaveBalanceCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leavePolicyService: LeavePolicyService,
    private readonly leaveLedger: LeaveLedgerService,
  ) {}

  /**
   * Opens the new leave year on each employee's employment anniversary.
   */
  @Cron('0 6 * * *')
  async refreshAnniversaryBalances(): Promise<void> {
    const today = toDateOnlyUtc(new Date());

    const employees = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        excludedFromHrProcesses: false,
        employmentDate: { not: null },
      },
      select: { id: true, companyId: true, employmentDate: true },
    });

    let refreshed = 0;
    for (const employee of employees) {
      if (!isEmploymentAnniversary(employee.employmentDate, today)) {
        continue;
      }
      try {
        await this.leaveLedger.openLeaveYearForDate(
          employee.id,
          employee.companyId,
          today,
          'Leave year opened (employment anniversary)',
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
      `Anniversary leave refresh complete: ${refreshed} employee(s) on ${today.toISOString().slice(0, 10)}`,
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
