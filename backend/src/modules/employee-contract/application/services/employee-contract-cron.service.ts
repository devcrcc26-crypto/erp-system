import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmployeeContractStatus } from '@prisma/client';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

/** Same window as the contract list's "Ends within 3 months" filter. */
const EXPIRING_SOON_MONTHS = 3;
const WARN_COOLDOWN_DAYS = 7;
const HR_OFFICER_ROLE = 'HR Officer';
const LOCAL_HR_MANAGER_ROLE = 'Local HR Manager';
const CONTRACT_EXPIRY_EVENT = 'employee_contract.expiry_warning';

/**
 * Daily job: warn HR when active employee contracts end within the next
 * 3 calendar months. Recipients per company: the HR Officer and every active
 * Local HR Manager (deduplicated). Each contract is re-sent at most weekly.
 */
@Injectable()
export class EmployeeContractCronService {
  private readonly logger = new Logger(EmployeeContractCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Runs every day at 08:00 - notifies the HR Officer and Local HR Managers
   * about contracts ending within the next 3 months.
   */
  @Cron('0 8 * * *')
  async checkExpiringContracts(): Promise<void> {
    const today = this.todayUtc();
    const windowEnd = this.addMonths(today, EXPIRING_SOON_MONTHS);
    const recipientsByCompany = new Map<string, string[]>();

    const expiringContracts = await this.prisma.employeeContract.findMany({
      where: {
        status: EmployeeContractStatus.ACTIVE,
        deletedAt: null,
        endDate: {
          gte: today,
          lte: windowEnd,
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
      const whenLabel =
        daysRemaining === 0
          ? 'today'
          : daysRemaining === 1
            ? 'in 1 day'
            : `in ${daysRemaining} days`;
      const subject = `Contract Expiry Warning - ${employeeName}`;
      const body = `${employeeName}'s contract (${contract.contractNumber}) expires ${whenLabel} on ${endDateLabel}. Please review and take action.`;

      const companyId = contract.employee.companyId;
      let recipients = recipientsByCompany.get(companyId);
      if (!recipients) {
        recipients = await this.findRecipients(companyId);
        recipientsByCompany.set(companyId, recipients);
      }

      if (recipients.length === 0) {
        this.logger.warn(
          `No HR Officer or Local HR Manager found for company ${companyId} - skipping contract ${contract.contractNumber}`,
        );
        continue;
      }

      let sent = 0;
      for (const recipientId of recipients) {
        try {
          await this.notificationService.send(
            { companyId, userId: recipientId },
            {
              recipientId,
              eventType: CONTRACT_EXPIRY_EVENT,
              channel: 'IN_APP',
              subject,
              body,
              link: `/hr/employee-contract/${contract.id}`,
            },
          );
          sent += 1;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed contract expiry warning for ${contract.id} to ${recipientId}: ${message}`,
          );
        }
      }

      // Start the weekly cooldown once at least one recipient was reached.
      if (sent > 0) {
        try {
          await this.prisma.employeeContract.update({
            where: { id: contract.id },
            data: { lastWarnedAt: today },
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to record expiry warning for ${contract.id}: ${message}`,
          );
        }
        notified += sent;
      }
    }

    this.logger.log(
      `Contract expiry check complete: ${notified} notification(s) sent (${expiringContracts.length} ending within ${EXPIRING_SOON_MONTHS} months)`,
    );
  }

  /**
   * The company HR Officer (first match, as before) plus every active
   * Local HR Manager, without duplicates.
   */
  private async findRecipients(companyId: string): Promise<string[]> {
    const hrOfficer = await this.prisma.user.findFirst({
      where: activeOnly({
        companyId,
        isActive: true,
        userRoles: {
          some: activeOnly({
            role: activeOnly({ companyId, name: HR_OFFICER_ROLE }),
          }),
        },
      }),
      select: { id: true },
    });

    const localHrManagers = await this.prisma.user.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        employmentStatus: 'ACTIVE' as const,
        userRoles: {
          some: activeOnly({
            role: activeOnly({ companyId, name: LOCAL_HR_MANAGER_ROLE }),
          }),
        },
      }),
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const ids = [
      ...(hrOfficer ? [hrOfficer.id] : []),
      ...localHrManagers.map((user) => user.id),
    ];
    return [...new Set(ids)];
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  /** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
  private addMonths(date: Date, months: number): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(
      Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)),
    );
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
