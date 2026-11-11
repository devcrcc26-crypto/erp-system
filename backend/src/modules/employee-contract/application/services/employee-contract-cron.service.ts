import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmployeeContractStatus } from '@prisma/client';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

const EXPIRING_SOON_DAYS = 90;
const WARN_COOLDOWN_DAYS = 7;
const HR_OFFICER_ROLE = 'HR Officer';
const CONTRACT_EXPIRY_EVENT = 'employee_contract.expiry_warning';

/**
 * Daily job: warn HR when active employee contracts expire within 90 days.
 */
@Injectable()
export class EmployeeContractCronService {
  private readonly logger = new Logger(EmployeeContractCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Runs every day at 08:00 - notifies HR Officers about contracts expiring soon.
   */
  @Cron('0 8 * * *')
  async checkExpiringContracts(): Promise<void> {
    const today = this.todayUtc();
    const in90Days = this.addDays(today, EXPIRING_SOON_DAYS);

    const expiringContracts = await this.prisma.employeeContract.findMany({
      where: {
        status: EmployeeContractStatus.ACTIVE,
        deletedAt: null,
        endDate: {
          gte: today,
          lte: in90Days,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyId: true,
          },
        },
      },
    });

    let notified = 0;

    for (const contract of expiringContracts) {
      if (!contract.endDate) {
        continue;
      }

      const daysRemaining = this.differenceInDays(
        this.toDateOnlyUtc(contract.endDate),
        today,
      );

      if (contract.lastWarnedAt) {
        const daysSinceWarning = this.differenceInDays(
          today,
          this.toDateOnlyUtc(contract.lastWarnedAt),
        );
        if (daysSinceWarning < WARN_COOLDOWN_DAYS) {
          continue;
        }
      }

      const employeeName = `${contract.employee.firstName} ${contract.employee.lastName}`;
      const endDateLabel = this.formatDateOnly(contract.endDate);
      const subject = `Contract Expiry Warning - ${employeeName}`;
      const body = `${employeeName}'s contract (${contract.contractNumber}) expires in ${daysRemaining} days on ${endDateLabel}. Please review and take action.`;

      const hrOfficer = await this.prisma.user.findFirst({
        where: activeOnly({
          companyId: contract.employee.companyId,
          isActive: true,
          userRoles: {
            some: activeOnly({
              role: activeOnly({
                companyId: contract.employee.companyId,
                name: HR_OFFICER_ROLE,
              }),
            }),
          },
        }),
        select: { id: true },
      });

      if (!hrOfficer) {
        this.logger.warn(
          `No HR Officer found for company ${contract.employee.companyId} - skipping contract ${contract.contractNumber}`,
        );
        continue;
      }

      try {
        await this.notificationService.send(
          { companyId: contract.employee.companyId, userId: hrOfficer.id },
          {
            recipientId: hrOfficer.id,
            eventType: CONTRACT_EXPIRY_EVENT,
            channel: 'IN_APP',
            subject,
            body,
            link: `/hr/employee-contract/${contract.id}`,
          },
        );

        await this.prisma.employeeContract.update({
          where: { id: contract.id },
          data: { lastWarnedAt: today },
        });

        notified += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed contract expiry warning for ${contract.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Contract expiry check complete: ${notified} notification(s) sent (${expiringContracts.length} expiring within ${EXPIRING_SOON_DAYS} days)`,
    );
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private toDateOnlyUtc(value: Date): Date {
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
      ),
    );
  }

  private differenceInDays(later: Date, earlier: Date): number {
    const msPerDay = 86_400_000;
    return Math.round((later.getTime() - earlier.getTime()) / msPerDay);
  }

  private formatDateOnly(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
