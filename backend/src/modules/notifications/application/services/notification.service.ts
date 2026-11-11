import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildOrderBy,
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  NOTIFICATION_QUEUE,
  SEND_NOTIFICATION_JOB,
  SendNotificationJobData,
} from '../constants/queue.constants';
import { notificationLinkMatchesRoute } from '../utils/notification-route-match.util';
import {
  CreateNotificationTemplateDto,
  SendNotificationDto,
  UpdateNotificationTemplateDto,
  UpsertNotificationPreferenceDto,
} from '../dtos/notification.dtos';
import { TemplateRendererService } from './template-renderer.service';
import { ResendEmailService } from '../../../../shared/mail/resend-email.service';

type AuditContext = { companyId: string; userId: string };

/** Seed-mode suppression counters (process-local). */
let seedSuppressedNotifications = 0;

/**
 * Returns how many notifications were suppressed under SEED_MODE.
 */
export function getSeedSuppressedNotificationCount(): number {
  return seedSuppressedNotifications;
}

/**
 * Resets seed-mode notification suppression counters.
 */
export function resetSeedSuppressedNotificationCount(): void {
  seedSuppressedNotifications = 0;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly seedMode: boolean;
  private readonly emailDisabled: boolean;
  skippedInactiveRecipients = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly resendEmailService: ResendEmailService,
    private readonly configService: ConfigService,
    @Optional()
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue?: Queue<SendNotificationJobData>,
  ) {
    this.seedMode = this.configService.get<boolean>('SEED_MODE') === true;
    this.emailDisabled =
      this.configService.get<boolean>('EMAIL_DISABLED') === true;
  }

  /**
   * Sends a notification respecting user preferences and optional templates.
   * SEED_MODE suppresses the notification entirely. EMAIL_DISABLED still
   * creates the in-app notification and does not queue or send email.
   */
  async send(
    ctx: AuditContext,
    dto: SendNotificationDto,
  ): Promise<{ inAppId?: string; emailQueued: boolean }> {
    if (this.seedMode) {
      seedSuppressedNotifications += 1;
      this.logger.debug(
        `SEED_MODE: suppressed notification (${dto.eventType}) to ${dto.recipientId}`,
      );
      return { emailQueued: false };
    }

    const recipient = await this.prisma.user.findFirst({
      where: activeOnly({ id: dto.recipientId, companyId: ctx.companyId }),
    });
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }
    // Login disabled (separated, deactivated): no in-app row, no email.
    if (!recipient.isActive) {
      this.skippedInactiveRecipients += 1;
      this.logger.log(
        `Skipped notification (${dto.eventType}) to inactive user ${dto.recipientId}; ` +
          `${this.skippedInactiveRecipients} skipped since start`,
      );
      return { emailQueued: false };
    }

    const preference = await this.prisma.notificationPreference.findFirst({
      where: activeOnly({ userId: dto.recipientId, eventType: dto.eventType }),
    });

    const sendInApp =
      dto.channel === undefined || dto.channel === 'IN_APP';
    const sendEmail =
      dto.channel === undefined || dto.channel === 'EMAIL';

    const inAppEnabled = sendInApp && (preference?.inApp ?? true);
    const emailEnabled =
      !this.emailDisabled && sendEmail && (preference?.email ?? true);
    const variables = dto.variables ?? {};

    let inAppId: string | undefined;
    let emailQueued = false;

    if (inAppEnabled) {
      const { subject, body, templateId } = await this.resolveContent(
        ctx.companyId,
        dto.eventType,
        NotificationChannel.IN_APP,
        dto.subject,
        dto.body,
        variables,
      );

      const notification = await this.prisma.notification.create({
        data: {
          companyId: ctx.companyId,
          recipientId: dto.recipientId,
          templateId,
          channel: NotificationChannel.IN_APP,
          subject,
          body,
          link: dto.link,
          status: NotificationStatus.SENT,
          readAt: null,
          sentAt: new Date(),
        },
      });
      inAppId = notification.id;
    }

    if (emailEnabled && !this.notificationQueue) {
      const { subject, body, templateId } = await this.resolveContent(
        ctx.companyId,
        dto.eventType,
        NotificationChannel.EMAIL,
        dto.subject,
        dto.body,
        variables,
      );

      const notification = await this.prisma.notification.create({
        data: {
          companyId: ctx.companyId,
          recipientId: dto.recipientId,
          templateId,
          channel: NotificationChannel.EMAIL,
          subject,
          body,
          status: NotificationStatus.PENDING,
        },
      });

      try {
        const sent = await this.resendEmailService.send({
          to: recipient.email ?? '',
          subject,
          html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
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
          `Failed to send email notification ${notification.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.FAILED },
        });
      }
    }

    if (emailEnabled && this.notificationQueue) {
      const { subject, body, templateId } = await this.resolveContent(
        ctx.companyId,
        dto.eventType,
        NotificationChannel.EMAIL,
        dto.subject,
        dto.body,
        variables,
      );

      const notification = await this.prisma.notification.create({
        data: {
          companyId: ctx.companyId,
          recipientId: dto.recipientId,
          templateId,
          channel: NotificationChannel.EMAIL,
          subject,
          body,
          status: NotificationStatus.PENDING,
        },
      });

      try {
        await this.notificationQueue.add(SEND_NOTIFICATION_JOB, {
          notificationId: notification.id,
        });
        emailQueued = true;
      } catch (error: unknown) {
        this.logger.error(
          `Failed to queue email notification ${notification.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.FAILED },
        });
      }
    }

    return { inAppId, emailQueued };
  }

  async listInbox(
    ctx: AuditContext,
    query: PaginationQueryDto,
    unreadOnly = false,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      companyId: ctx.companyId,
      recipientId: ctx.userId,
      channel: NotificationChannel.IN_APP,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getUnreadCount(ctx: AuditContext): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: {
        companyId: ctx.companyId,
        recipientId: ctx.userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
      },
    });
    return { count };
  }

  async markRead(ctx: AuditContext, id: string): Promise<unknown> {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        companyId: ctx.companyId,
        recipientId: ctx.userId,
        channel: NotificationChannel.IN_APP,
      },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date(), status: NotificationStatus.READ },
    });
  }

  /**
   * Marks unread in-app notifications whose deep link matches the current route.
   */
  async markReadForRoute(
    ctx: AuditContext,
    path: string,
  ): Promise<{ updated: number }> {
    const trimmed = path.trim();
    if (!trimmed.startsWith('/')) {
      throw new BadRequestException('path must start with /');
    }

    const unread = await this.prisma.notification.findMany({
      where: {
        companyId: ctx.companyId,
        recipientId: ctx.userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
        link: { not: null },
      },
      select: { id: true, link: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    const ids = unread
      .filter((row) => {
        const link = row.link;
        return (
          link != null &&
          notificationLinkMatchesRoute(link, trimmed)
        );
      })
      .map((row) => row.id);

    if (ids.length === 0) {
      return { updated: 0 };
    }

    const result = await this.prisma.notification.updateMany({
      where: {
        id: { in: ids },
        companyId: ctx.companyId,
        recipientId: ctx.userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
      },
      data: { readAt: new Date(), status: NotificationStatus.READ },
    });
    return { updated: result.count };
  }

  async markAllRead(ctx: AuditContext): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        companyId: ctx.companyId,
        recipientId: ctx.userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
      },
      data: { readAt: new Date(), status: NotificationStatus.READ },
    });
    return { updated: result.count };
  }

  async listTemplates(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where = activeOnly({ companyId: ctx.companyId });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.notificationTemplate.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.notificationTemplate.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async createTemplate(
    ctx: AuditContext,
    dto: CreateNotificationTemplateDto,
  ): Promise<unknown> {
    return this.prisma.notificationTemplate.create({
      data: {
        companyId: ctx.companyId,
        eventType: dto.eventType,
        channel: dto.channel,
        subjectTemplate: dto.subjectTemplate,
        bodyTemplate: dto.bodyTemplate,
        isActive: dto.isActive ?? true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateTemplate(
    ctx: AuditContext,
    id: string,
    dto: UpdateNotificationTemplateDto,
  ): Promise<unknown> {
    await this.assertTemplate(id, ctx.companyId);
    return this.prisma.notificationTemplate.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteTemplate(ctx: AuditContext, id: string): Promise<void> {
    await this.assertTemplate(id, ctx.companyId);
    await this.prisma.notificationTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async listPreferences(ctx: AuditContext): Promise<unknown[]> {
    return this.prisma.notificationPreference.findMany({
      where: activeOnly({ userId: ctx.userId }),
    });
  }

  async upsertPreference(
    ctx: AuditContext,
    dto: UpsertNotificationPreferenceDto,
  ): Promise<unknown> {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_eventType: {
          userId: ctx.userId,
          eventType: dto.eventType,
        },
      },
      update: {
        inApp: dto.inApp,
        email: dto.email,
        sms: dto.sms,
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      },
      create: {
        userId: ctx.userId,
        eventType: dto.eventType,
        inApp: dto.inApp ?? true,
        email: dto.email ?? true,
        sms: dto.sms ?? false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Hard-deletes notifications older than the retention period.
   */
  async purgeExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const result = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  private async resolveContent(
    companyId: string,
    eventType: string,
    channel: NotificationChannel,
    subjectOverride: string | undefined,
    bodyOverride: string | undefined,
    variables: Record<string, string>,
  ): Promise<{ subject: string; body: string; templateId: string | null }> {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: activeOnly({
        companyId,
        eventType,
        channel,
        isActive: true,
      }),
    });

    if (template) {
      return {
        subject: this.templateRenderer.render(
          subjectOverride ?? template.subjectTemplate,
          variables,
        ),
        body: this.templateRenderer.render(
          bodyOverride ?? template.bodyTemplate,
          variables,
        ),
        templateId: template.id,
      };
    }

    return {
      subject: subjectOverride ?? eventType,
      body: bodyOverride ?? '',
      templateId: null,
    };
  }

  private async assertTemplate(id: string, companyId: string): Promise<void> {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!template) {
      throw new NotFoundException('Notification template not found');
    }
  }
}
