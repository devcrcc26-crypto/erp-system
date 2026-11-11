import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../../application/services/notification.service';

@Injectable()
export class NotificationRetentionCron {
  private readonly logger = new Logger(NotificationRetentionCron.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Purges notifications past the configured retention period (daily at 2am).
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeOldNotifications(): Promise<void> {
    const retentionDays = this.configService.get<number>(
      'NOTIFICATION_RETENTION_DAYS',
      90,
    );
    const deleted = await this.notificationService.purgeExpired(retentionDays);
    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} expired notifications`);
    }
  }
}
