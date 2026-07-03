import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ResendEmailService } from '../../../../shared/mail/resend-email.service';
import {
  NOTIFICATION_QUEUE,
  SEND_NOTIFICATION_JOB,
  SendNotificationJobData,
} from '../constants/queue.constants';

@Processor(NOTIFICATION_QUEUE)
export class SendNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(SendNotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resendEmailService: ResendEmailService,
  ) {
    super();
  }

  /**
   * Processes queued email notifications.
   */
  async process(job: Job<SendNotificationJobData>): Promise<void> {
    if (job.name !== SEND_NOTIFICATION_JOB) {
      return;
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: {
        recipient: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!notification) {
      this.logger.warn(`Notification ${job.data.notificationId} not found`);
      return;
    }

    try {
      const sent = await this.resendEmailService.send({
        to: notification.recipient.email ?? '',
        subject: notification.subject,
        html: `<p>${notification.body.replace(/\n/g, '<br>')}</p>`,
      });

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: sent ? NotificationStatus.SENT : NotificationStatus.FAILED,
          ...(sent ? { sentAt: new Date() } : {}),
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send notification ${notification.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED },
      });
    }
  }
}
