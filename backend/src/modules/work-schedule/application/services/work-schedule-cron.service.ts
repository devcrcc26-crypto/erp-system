import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { formatDateOnly, todayUtc } from './work-schedule.dates';
import { WorkScheduleService } from './work-schedule.service';

const HR_OFFICER_ROLE = 'HR Officer';
const HOLIDAY_EVENT = 'public_holiday.upcoming';
const LOOKAHEAD_DAYS = 90;

/**
 * Daily 07:00 job: notify HR Officers of holidays within each holiday's notifyDaysBefore window.
 */
@Injectable()
export class WorkScheduleCronService {
  private readonly logger = new Logger(WorkScheduleCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workScheduleService: WorkScheduleService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Runs every day at 07:00 - upcoming-holiday reminders for HR.
   */
  @Cron('0 7 * * *')
  async notifyUpcomingHolidays(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    let notified = 0;

    for (const company of companies) {
      const upcoming = await this.workScheduleService.getUpcomingHolidays(
        company.id,
        LOOKAHEAD_DAYS,
      );
      const due = upcoming.filter(
        (holiday) => holiday.daysUntil <= holiday.notifyDaysBefore,
      );
      if (due.length === 0) {
        continue;
      }

      const officers = await this.findHrOfficers(company.id);
      if (officers.length === 0) {
        this.logger.warn(
          `No HR Officer found for company ${company.id} - skipping holiday reminders`,
        );
        continue;
      }

      for (const holiday of due) {
        const occurrenceLabel = formatDateOnly(holiday.occurrenceDate);
        const appliesLabel = this.appliesToLabel(holiday.appliesToNationality);
        const subject = `Upcoming holiday: ${holiday.name} on ${occurrenceLabel}`;
        const body = `${holiday.name} applies to ${appliesLabel} on ${occurrenceLabel}.`;
        const link = `/hr/public-holidays?holidayId=${holiday.id}`;

        for (const officer of officers) {
          const alreadySent = await this.alreadyNotifiedToday(
            company.id,
            officer.id,
            holiday.id,
          );
          if (alreadySent) {
            continue;
          }

          try {
            await this.notificationService.send(
              { companyId: company.id, userId: officer.id },
              {
                recipientId: officer.id,
                eventType: HOLIDAY_EVENT,
                channel: 'IN_APP',
                subject,
                body,
                link,
              },
            );
            notified += 1;
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Failed holiday reminder for ${holiday.id} → ${officer.id}: ${message}`,
            );
          }
        }
      }
    }

    this.logger.log(
      `Holiday reminder check complete: ${notified} notification(s) sent`,
    );
  }

  private async findHrOfficers(
    companyId: string,
  ): Promise<Array<{ id: string }>> {
    return this.prisma.user.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        userRoles: {
          some: activeOnly({
            role: activeOnly({
              companyId,
              name: HR_OFFICER_ROLE,
            }),
          }),
        },
      }),
      select: { id: true },
    });
  }

  private async alreadyNotifiedToday(
    companyId: string,
    recipientId: string,
    holidayId: string,
  ): Promise<boolean> {
    const today = todayUtc();
    const existing = await this.prisma.notification.findFirst({
      where: {
        companyId,
        recipientId,
        link: `/hr/public-holidays?holidayId=${holidayId}`,
        createdAt: { gte: today },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private appliesToLabel(value: string): string {
    switch (value) {
      case 'ETHIOPIAN':
        return 'Ethiopian employees';
      case 'CHINESE':
        return 'Chinese employees';
      default:
        return 'all employees';
    }
  }
}
