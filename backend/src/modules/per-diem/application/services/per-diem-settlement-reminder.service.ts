import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PerDiemStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';

const REMINDER_AFTER_DAYS = 7;
const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Daily reminders for paid per diem advances that still need a settlement.
 */
@Injectable()
export class PerDiemSettlementReminderService {
  private readonly logger = new Logger(PerDiemSettlementReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Runs daily at 08:00 Ethiopia time (05:00 UTC).
   * Notifies employees whose paid, unsettled advance ended more than 7 days ago.
   * At most one reminder per advance every 7 days.
   */
  @Cron('0 5 * * *', {
    name: 'per-diem-settlement-reminder',
    timeZone: 'UTC',
  })
  async handleDailyReminders(): Promise<void> {
    this.logger.log(
      '[PerDiemSettlementReminder] Running unsettled advance reminder check...',
    );
    try {
      const result = await this.sendDueReminders();
      this.logger.log(
        `[PerDiemSettlementReminder] Sent ${result.sent} reminder(s); skipped ${result.skipped}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `[PerDiemSettlementReminder] Failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Sends due settlement reminders. Exposed for tests and manual triggers.
   */
  async sendDueReminders(now: Date = new Date()): Promise<{
    sent: number;
    skipped: number;
  }> {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - REMINDER_AFTER_DAYS);
    cutoff.setUTCHours(23, 59, 59, 999);

    const cooldownBefore = new Date(now.getTime() - REMINDER_COOLDOWN_MS);

    const advances = await this.prisma.perDiemRequest.findMany({
      where: activeOnly({
        status: { in: [PerDiemStatus.APPROVED, PerDiemStatus.ACTIVE] },
        settlementId: null,
        disbursements: { some: {} },
        endDate: { lte: cutoff },
        OR: [
          { lastSettlementReminderAt: null },
          { lastSettlementReminderAt: { lte: cooldownBefore } },
        ],
      }),
      select: {
        id: true,
        companyId: true,
        employeeId: true,
        destination: true,
        lastSettlementReminderAt: true,
      },
      orderBy: { endDate: 'asc' },
    });

    // One notification per employee per run (prefer the earliest trip destination).
    const byEmployee = new Map<
      string,
      {
        id: string;
        companyId: string;
        employeeId: string;
        destination: string;
      }
    >();
    for (const advance of advances) {
      const key = `${advance.companyId}:${advance.employeeId}`;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, advance);
      }
    }

    let sent = 0;
    let skipped = advances.length - byEmployee.size;

    for (const advance of byEmployee.values()) {
      const message = `Please submit your per diem settlement for ${advance.destination}.`;
      try {
        await this.notifications.send(
          { companyId: advance.companyId, userId: advance.employeeId },
          {
            recipientId: advance.employeeId,
            eventType: 'per_diem.settlement_reminder',
            channel: 'IN_APP',
            subject: message,
            body: message,
            link: '/hr/per-diem/settlements/new',
          },
        );

        // Stamp every due advance for this employee so weekly cooldown applies.
        await this.prisma.perDiemRequest.updateMany({
          where: {
            companyId: advance.companyId,
            employeeId: advance.employeeId,
            status: { in: [PerDiemStatus.APPROVED, PerDiemStatus.ACTIVE] },
            settlementId: null,
            disbursements: { some: {} },
            endDate: { lte: cutoff },
            OR: [
              { lastSettlementReminderAt: null },
              { lastSettlementReminderAt: { lte: cooldownBefore } },
            ],
          },
          data: {
            lastSettlementReminderAt: now,
            updatedBy: advance.employeeId,
          },
        });
        sent += 1;
      } catch (error: unknown) {
        skipped += 1;
        this.logger.warn(
          `[PerDiemSettlementReminder] Failed for ${advance.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { sent, skipped };
  }
}
