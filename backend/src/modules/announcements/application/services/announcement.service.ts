import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Announcement,
  AnnouncementPriority,
  AnnouncementScope,
  AnnouncementStatus,
  AnnouncementType,
  FolderContextType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PermissionFlags } from '../../../../shared/permissions/permission.types';
import { isTrueSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from '../../../../shared/storage/storage.constants';
import { IStorageService } from '../../../../shared/storage/storage.interface';
import {
  finishDocumentSheet,
  startDocumentSheet,
} from '../../../../shared/utils/excel-document.util';
import { buildPaginatedResult } from '../../../../shared/utils/pagination.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  AudiencePreviewDto,
  CreateAnnouncementDto,
  ListAnnouncementsDto,
  ListMyAnnouncementsDto,
  ListRecipientsDto,
  PublishAnnouncementDto,
  UpdateAnnouncementDto,
} from '../dtos/announcement.dtos';
import { markdownToPlainText, sanitizeAnnouncementMarkdown } from '../utils/announcement-markdown.util';
import { AnnouncementAudience, AnnouncementAudienceService } from './announcement-audience.service';

export type AnnouncementCtx = { companyId: string; userId: string };

export interface UploadedAnnouncementFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface ManageAccess {
  flags: PermissionFlags;
  isSystemAdmin: boolean;
}

const USER_SUMMARY = {
  id: true,
  firstName: true,
  lastName: true,
  chineseName: true,
  employeeId: true,
} as const;

const DOCUMENT_SUMMARY = {
  id: true,
  name: true,
  fileType: true,
  fileSizeBytes: true,
  createdAt: true,
} as const;

/** Statuses an announcement can be published from. */
const PUBLISHABLE: AnnouncementStatus[] = [AnnouncementStatus.DRAFT, AnnouncementStatus.SCHEDULED];

/** Treat a publishAt this close to now as "publish now". */
const SCHEDULE_GRACE_MS = 30_000;

export const ANNOUNCEMENT_EVENT_PUBLISHED = 'announcement.published';
export const ANNOUNCEMENT_EVENT_REMINDER = 'announcement.reminder';
export const ANNOUNCEMENT_EVENT_UPDATED = 'announcement.updated';

@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AnnouncementAudienceService,
    private readonly notifications: NotificationService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
  ) {}

  // ─── HR / admin management ────────────────────────────────────────────────

  async create(ctx: AnnouncementCtx, dto: CreateAnnouncementDto) {
    const access = await this.access(ctx);
    const type = dto.type ?? AnnouncementType.COMPANY;
    this.assertCanManageType(access, type);
    if (!access.flags.canCreate) {
      throw new ForbiddenException('You do not have permission to create announcements.');
    }

    const body = sanitizeAnnouncementMarkdown(dto.body);
    if (!dto.title.trim() || !body) {
      throw new BadRequestException('Title and body are required.');
    }

    const number = await this.nextNumber();
    const data = this.normaliseForType(type, {
      title: dto.title.trim(),
      titleZh: dto.titleZh?.trim() || null,
      body,
      bodyZh: dto.bodyZh ? sanitizeAnnouncementMarkdown(dto.bodyZh) || null : null,
      priority: dto.priority ?? AnnouncementPriority.NORMAL,
      audienceScope: dto.audienceScope ?? AnnouncementScope.ALL,
      departmentIds: dto.departmentIds ?? [],
      disciplineIds: dto.disciplineIds ?? [],
      roleIds: dto.roleIds ?? [],
      employeeIds: dto.employeeIds ?? [],
      requireAcknowledgement: dto.requireAcknowledgement ?? false,
      sendEmail: dto.sendEmail ?? false,
      pinned: dto.pinned ?? false,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    const created = await this.prisma.announcement.create({
      data: {
        ...data,
        companyId: ctx.companyId,
        number,
        type,
        status: AnnouncementStatus.DRAFT,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return this.getManaged(ctx, created.id);
  }

  async update(ctx: AnnouncementCtx, id: string, dto: UpdateAnnouncementDto) {
    const access = await this.access(ctx);
    const existing = await this.findManaged(ctx, id, access);

    if (existing.status === AnnouncementStatus.ARCHIVED) {
      throw new BadRequestException('Archived announcements cannot be edited.');
    }
    if (existing.status === AnnouncementStatus.DRAFT) {
      if (!access.flags.canEdit) {
        throw new ForbiddenException('You do not have permission to edit announcements.');
      }
    } else if (!access.flags.canApprove) {
      // Scheduled and published posts belong to whoever can publish them.
      throw new ForbiddenException('Only publishers can edit a scheduled or published announcement.');
    }

    const data: Prisma.AnnouncementUpdateInput = { updatedBy: ctx.userId };
    let contentChanged = false;
    let messageChanged = false;

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException('Title is required.');
      }
      data.title = title;
      contentChanged ||= title !== existing.title;
    }
    if (dto.titleZh !== undefined) {
      data.titleZh = dto.titleZh?.trim() || null;
      contentChanged ||= (data.titleZh ?? null) !== existing.titleZh;
    }
    if (dto.body !== undefined) {
      const body = sanitizeAnnouncementMarkdown(dto.body);
      if (!body) {
        throw new BadRequestException('Body is required.');
      }
      data.body = body;
      messageChanged ||= body !== existing.body;
      contentChanged ||= messageChanged;
    }
    if (dto.bodyZh !== undefined) {
      data.bodyZh = dto.bodyZh ? sanitizeAnnouncementMarkdown(dto.bodyZh) || null : null;
      messageChanged ||= (data.bodyZh ?? null) !== existing.bodyZh;
      contentChanged ||= messageChanged;
    }
    if (dto.pinned !== undefined) {
      data.pinned = dto.pinned;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    const audienceFields = [
      'priority',
      'audienceScope',
      'departmentIds',
      'disciplineIds',
      'roleIds',
      'employeeIds',
      'requireAcknowledgement',
      'sendEmail',
    ] as const;

    if (existing.status === AnnouncementStatus.PUBLISHED) {
      const locked = audienceFields.filter((field) => dto[field] !== undefined);
      if (locked.length > 0) {
        throw new BadRequestException(
          `The audience and delivery options can't change after publishing (${locked.join(', ')}).`,
        );
      }
      if (contentChanged) {
        data.contentEditedAt = new Date();
      }
    } else {
      const merged = this.normaliseForType(existing.type, {
        priority: dto.priority ?? existing.priority,
        audienceScope: dto.audienceScope ?? existing.audienceScope,
        departmentIds: dto.departmentIds ?? existing.departmentIds,
        disciplineIds: dto.disciplineIds ?? existing.disciplineIds,
        roleIds: dto.roleIds ?? existing.roleIds,
        employeeIds: dto.employeeIds ?? existing.employeeIds,
        requireAcknowledgement: dto.requireAcknowledgement ?? existing.requireAcknowledgement,
        sendEmail: dto.sendEmail ?? existing.sendEmail,
      });
      Object.assign(data, merged);
    }

    // An acknowledgement refers to the text people saw. When the message of
    // a published post that asks for one changes, everyone reviews it again.
    const reacknowledge =
      existing.status === AnnouncementStatus.PUBLISHED &&
      existing.requireAcknowledgement &&
      messageChanged;

    let acknowledgementsReset = 0;
    let recipientIds: string[] = [];
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.announcement.update({ where: { id }, data });
      if (!reacknowledge) {
        return;
      }
      acknowledgementsReset = await tx.announcementRecipient.count({
        where: { announcementId: id, acknowledgedAt: { not: null } },
      });
      const recipients = await tx.announcementRecipient.findMany({
        where: { announcementId: id },
        select: { userId: true },
      });
      recipientIds = recipients.map((recipient) => recipient.userId);
      await tx.announcementRecipient.updateMany({
        where: { announcementId: id },
        data: { readAt: null, acknowledgedAt: null },
      });
    });

    if (reacknowledge && recipientIds.length > 0) {
      const updated = await this.prisma.announcement.findUniqueOrThrow({ where: { id } });
      await this.notifyRecipients(updated, recipientIds, 'updated', ctx.userId);
    }
    return { ...(await this.getManaged(ctx, id)), acknowledgementsReset };
  }

  /**
   * Publishes now, or schedules when `publishAt` is in the future. Requires
   * announcements.approve; the audience must be complete.
   */
  async publish(ctx: AnnouncementCtx, id: string, dto: PublishAnnouncementDto, now = new Date()) {
    const access = await this.access(ctx);
    const existing = await this.findManaged(ctx, id, access);
    if (!access.flags.canApprove) {
      throw new ForbiddenException('You do not have permission to publish announcements.');
    }
    if (!PUBLISHABLE.includes(existing.status)) {
      throw new BadRequestException(`An announcement in status ${existing.status} can't be published.`);
    }
    if (!existing.title.trim() || !existing.body.trim()) {
      throw new BadRequestException('Title and body are required before publishing.');
    }
    this.audience.assertComplete(existing);

    const publishAt = dto.publishAt ? new Date(dto.publishAt) : null;
    const goLive = publishAt && publishAt.getTime() > now.getTime() + SCHEDULE_GRACE_MS ? publishAt : now;
    if (existing.expiresAt && existing.expiresAt.getTime() <= goLive.getTime()) {
      throw new BadRequestException('The expiry must be after the publish time.');
    }

    if (goLive !== now) {
      await this.prisma.announcement.update({
        where: { id },
        data: { status: AnnouncementStatus.SCHEDULED, publishAt: goLive, updatedBy: ctx.userId },
      });
      return this.getManaged(ctx, id);
    }

    await this.publishNow(id, ctx.userId, now);
    return this.getManaged(ctx, id);
  }

  /** Moves a scheduled post back to draft. */
  async unschedule(ctx: AnnouncementCtx, id: string) {
    const access = await this.access(ctx);
    const existing = await this.findManaged(ctx, id, access);
    if (!access.flags.canApprove) {
      throw new ForbiddenException('You do not have permission to change the schedule.');
    }
    if (existing.status !== AnnouncementStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled announcements can be unscheduled.');
    }
    await this.prisma.announcement.update({
      where: { id },
      data: { status: AnnouncementStatus.DRAFT, publishAt: null, updatedBy: ctx.userId },
    });
    return this.getManaged(ctx, id);
  }

  /** Hides a published post from employees; read statistics are kept. */
  async archive(ctx: AnnouncementCtx, id: string) {
    const access = await this.access(ctx);
    const existing = await this.findManaged(ctx, id, access);
    if (!access.flags.canApprove) {
      throw new ForbiddenException('You do not have permission to archive announcements.');
    }
    if (existing.status !== AnnouncementStatus.PUBLISHED) {
      throw new BadRequestException('Only published announcements can be archived.');
    }
    await this.prisma.announcement.update({
      where: { id },
      data: { status: AnnouncementStatus.ARCHIVED, archivedAt: new Date(), updatedBy: ctx.userId },
    });
    return this.getManaged(ctx, id);
  }

  /** Soft-deletes a draft. */
  async remove(ctx: AnnouncementCtx, id: string): Promise<void> {
    const access = await this.access(ctx);
    const existing = await this.findManaged(ctx, id, access);
    if (!access.flags.canEdit) {
      throw new ForbiddenException('You do not have permission to delete announcements.');
    }
    if (existing.status !== AnnouncementStatus.DRAFT) {
      throw new BadRequestException('Only drafts can be deleted. Archive published announcements instead.');
    }
    await this.prisma.announcement.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId, updatedBy: ctx.userId },
    });
  }

  async listManaged(ctx: AnnouncementCtx, query: ListAnnouncementsDto) {
    const access = await this.access(ctx);
    const types = this.manageableTypes(access);
    if (query.type && !types.includes(query.type)) {
      throw new ForbiddenException('You cannot manage this type of announcement.');
    }
    const search = query.search?.trim();
    const where: Prisma.AnnouncementWhereInput = {
      companyId: ctx.companyId,
      deletedAt: null,
      type: query.type ? query.type : { in: types },
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { titleZh: { contains: search, mode: 'insensitive' } },
              { number: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { creator: { select: USER_SUMMARY } },
      }),
    ]);

    const stats = await this.statsFor(rows.map((row) => row.id));
    const data = rows.map((row) => ({
      ...this.managedSummary(row),
      creator: row.creator,
      stats: stats.get(row.id) ?? { recipients: 0, read: 0, acknowledged: 0 },
    }));
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getManaged(ctx: AnnouncementCtx, id: string) {
    const access = await this.access(ctx);
    const row = await this.findManaged(ctx, id, access);
    const [stats, labels] = await Promise.all([
      this.statsFor([row.id]),
      this.audienceLabels(ctx.companyId, row),
    ]);
    return {
      ...row,
      attachments: row.attachmentFolder?.documents ?? [],
      attachmentFolder: undefined,
      audienceLabels: labels,
      stats: stats.get(row.id) ?? { recipients: 0, read: 0, acknowledged: 0 },
      permissions: {
        canEdit:
          row.status === AnnouncementStatus.DRAFT
            ? access.flags.canEdit
            : row.status !== AnnouncementStatus.ARCHIVED && access.flags.canApprove,
        canPublish: access.flags.canApprove && PUBLISHABLE.includes(row.status),
        canArchive: access.flags.canApprove && row.status === AnnouncementStatus.PUBLISHED,
        canDelete: access.flags.canEdit && row.status === AnnouncementStatus.DRAFT,
        canExport: access.flags.canExport,
        canRemind: access.flags.canApprove && row.status === AnnouncementStatus.PUBLISHED,
      },
    };
  }

  async listRecipients(ctx: AnnouncementCtx, id: string, query: ListRecipientsDto) {
    const access = await this.access(ctx);
    await this.findManaged(ctx, id, access);
    const search = query.search?.trim();
    const where: Prisma.AnnouncementRecipientWhereInput = {
      announcementId: id,
      ...(query.filter === 'unread' ? { readAt: null } : {}),
      ...(query.filter === 'unacknowledged' ? { acknowledgedAt: null } : {}),
      ...(search
        ? {
            user: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { chineseName: { contains: search, mode: 'insensitive' } },
                { employeeId: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.announcementRecipient.count({ where }),
      this.prisma.announcementRecipient.findMany({
        where,
        orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: {
            select: {
              ...USER_SUMMARY,
              department: { select: { id: true, name: true, nameZh: true } },
            },
          },
        },
      }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        user: row.user,
        readAt: row.readAt,
        acknowledgedAt: row.acknowledgedAt,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  /** Sends one in-app reminder to every recipient who hasn't opened the post. */
  async remindUnread(ctx: AnnouncementCtx, id: string): Promise<{ notified: number }> {
    const access = await this.access(ctx);
    const row = await this.findManaged(ctx, id, access);
    if (!access.flags.canApprove) {
      throw new ForbiddenException('You do not have permission to send reminders.');
    }
    if (row.status !== AnnouncementStatus.PUBLISHED) {
      throw new BadRequestException('Only published announcements can be reminded.');
    }
    const unread = await this.prisma.announcementRecipient.findMany({
      where: { announcementId: id, readAt: null },
      select: { userId: true },
    });
    const notified = await this.notifyRecipients(
      row,
      unread.map((recipient) => recipient.userId),
      'reminder',
      ctx.userId,
    );
    return { notified };
  }

  async exportStats(
    ctx: AnnouncementCtx,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const access = await this.access(ctx);
    const row = await this.findManaged(ctx, id, access);
    if (!access.flags.canExport) {
      throw new ForbiddenException('You do not have permission to export announcement statistics.');
    }
    const recipients = await this.prisma.announcementRecipient.findMany({
      where: { announcementId: id },
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
      include: {
        user: { select: { ...USER_SUMMARY, department: { select: { name: true } } } },
      },
    });

    const read = recipients.filter((recipient) => recipient.readAt).length;
    const acknowledged = recipients.filter((recipient) => recipient.acknowledgedAt).length;
    const [company, preparer] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: { legalName: true },
      }),
      this.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = company?.legalName ?? 'CRCC International Consulting';
    const sheet = workbook.addWorksheet('Read statistics');
    const layout = startDocumentSheet(
      sheet,
      {
        companyName: company?.legalName ?? 'CRCC International Consulting',
        title: `${row.number} · ${row.title}`,
        preparedBy: preparer
          ? `${preparer.firstName} ${preparer.lastName}`.trim()
          : null,
        details: [
          ['Published', row.publishedAt ? formatDateTime(row.publishedAt) : '-'],
          ['Read', `${read} of ${recipients.length}`],
          ...(row.requireAcknowledgement
            ? ([['Acknowledged', String(acknowledged)]] as Array<[string, string]>)
            : []),
        ],
      },
      [['Name', 'Employee ID', 'Department', 'Read at', 'Acknowledged at']],
      [30, 14, 32, 20, 20],
    );
    for (const recipient of recipients) {
      sheet.addRow([
        `${recipient.user.firstName} ${recipient.user.lastName}`.trim(),
        recipient.user.employeeId ?? '',
        recipient.user.department?.name ?? '',
        recipient.readAt ? formatDateTime(recipient.readAt) : '',
        recipient.acknowledgedAt ? formatDateTime(recipient.acknowledgedAt) : '',
      ]);
    }
    finishDocumentSheet(sheet, layout);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, filename: `Announcement_${row.number}_read_stats.xlsx` };
  }

  async audiencePreview(ctx: AnnouncementCtx, dto: AudiencePreviewDto): Promise<{ count: number }> {
    const access = await this.access(ctx);
    if (!access.flags.canCreate && !access.isSystemAdmin) {
      throw new ForbiddenException('You do not have permission to manage announcements.');
    }
    const count = await this.audience.count(ctx.companyId, {
      audienceScope: dto.audienceScope,
      departmentIds: dto.departmentIds ?? [],
      disciplineIds: dto.disciplineIds ?? [],
      roleIds: dto.roleIds ?? [],
      employeeIds: dto.employeeIds ?? [],
    });
    return { count };
  }

  /** Picker options for the audience selector. */
  async audienceOptions(ctx: AnnouncementCtx) {
    const access = await this.access(ctx);
    if (!access.flags.canCreate && !access.isSystemAdmin) {
      throw new ForbiddenException('You do not have permission to manage announcements.');
    }
    const [departments, disciplines, roles, employees] = await Promise.all([
      this.prisma.department.findMany({
        where: { companyId: ctx.companyId, deletedAt: null, isActive: true },
        select: { id: true, name: true, nameZh: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.discipline.findMany({
        where: { companyId: ctx.companyId, deletedAt: null, isActive: true },
        select: { id: true, name: true, nameZh: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.role.findMany({
        where: { companyId: ctx.companyId, deletedAt: null, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { companyId: ctx.companyId, deletedAt: null, isActive: true },
        select: {
          ...USER_SUMMARY,
          department: { select: { id: true, name: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
    return { departments, disciplines, roles, employees };
  }

  async uploadAttachments(ctx: AnnouncementCtx, id: string, files: UploadedAnnouncementFile[]) {
    const access = await this.access(ctx);
    const row = await this.findManaged(ctx, id, access);
    const editable =
      row.status === AnnouncementStatus.DRAFT ? access.flags.canEdit : access.flags.canApprove;
    if (!editable || row.status === AnnouncementStatus.ARCHIVED) {
      throw new ForbiddenException('You cannot change the attachments of this announcement.');
    }
    const folderId = await this.ensureAttachmentFolder(row, ctx);
    for (const file of files) {
      if (!file?.buffer?.length) {
        continue;
      }
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${ctx.companyId}/announcements/${row.id}/${randomUUID()}_${safeName}`;
      try {
        await this.storage.upload({
          bucket: STORAGE_BUCKETS.HR,
          key: fileKey,
          body: file.buffer,
          contentType: file.mimetype,
          contentLength: file.size,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`[Announcement] Storage upload failed for ${row.number}: ${reason}`);
        throw new ServiceUnavailableException('The file could not be stored right now. Please try again.');
      }
      const documentId = randomUUID();
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.document.create({
          data: {
            id: documentId,
            companyId: ctx.companyId,
            folderId,
            name: file.originalname,
            fileKey,
            fileType: file.mimetype,
            fileSizeBytes: file.size,
            version: 1,
            isCurrent: true,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          },
        });
        await tx.documentVersion.create({
          data: {
            documentId,
            uploadedBy: ctx.userId,
            versionNumber: 1,
            fileKey,
            fileSizeBytes: file.size,
          },
        });
      });
    }
    return this.getManaged(ctx, id);
  }

  async deleteAttachment(ctx: AnnouncementCtx, id: string, documentId: string) {
    const access = await this.access(ctx);
    const row = await this.findManaged(ctx, id, access);
    const editable =
      row.status === AnnouncementStatus.DRAFT ? access.flags.canEdit : access.flags.canApprove;
    if (!editable || row.status === AnnouncementStatus.ARCHIVED) {
      throw new ForbiddenException('You cannot change the attachments of this announcement.');
    }
    const document = await this.findAttachment(row, documentId);
    await this.prisma.document.update({
      where: { id: document.id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId, updatedBy: ctx.userId },
    });
    return this.getManaged(ctx, id);
  }

  /** HR download (any status). */
  async getManagedAttachmentUrl(ctx: AnnouncementCtx, id: string, documentId: string) {
    const access = await this.access(ctx);
    const row = await this.findManaged(ctx, id, access);
    return this.attachmentUrl(row, documentId);
  }

  // ─── Scheduler ────────────────────────────────────────────────────────────

  /**
   * Publishes every scheduled announcement whose publishAt has passed.
   * Each one flips status atomically, so overlapping runs notify once.
   */
  async publishDue(now = new Date()): Promise<{ published: number }> {
    const due = await this.prisma.announcement.findMany({
      where: {
        status: AnnouncementStatus.SCHEDULED,
        deletedAt: null,
        publishAt: { lte: now },
      },
      select: { id: true, updatedBy: true },
      orderBy: { publishAt: 'asc' },
    });
    let published = 0;
    for (const item of due) {
      try {
        const result = await this.publishNow(item.id, item.updatedBy, now, [AnnouncementStatus.SCHEDULED]);
        if (result.published) {
          published += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to publish scheduled announcement ${item.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return { published };
  }

  // ─── Recipient (employee) side ───────────────────────────────────────────

  async listMine(ctx: AnnouncementCtx, query: ListMyAnnouncementsDto, now = new Date()) {
    await this.ensurePinnedCompanyWideReceipts(ctx);
    const where: Prisma.AnnouncementRecipientWhereInput = {
      userId: ctx.userId,
      ...(query.filter === 'unread' ? { readAt: null } : {}),
      announcement: this.visibleToRecipients(ctx.companyId, query.type),
    };
    const [total, rows] = await Promise.all([
      this.prisma.announcementRecipient.count({ where }),
      this.prisma.announcementRecipient.findMany({
        where,
        orderBy: [{ announcement: { pinned: 'desc' } }, { announcement: { publishedAt: 'desc' } }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { announcement: { include: { creator: { select: USER_SUMMARY } } } },
      }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => this.recipientSummary(row.announcement, row, now)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Everything the shell needs in one call: unread badge, urgent banner,
   * acknowledgement modal, What's new modal and the dashboard widget.
   */
  async summary(ctx: AnnouncementCtx, now = new Date()) {
    await this.ensurePinnedCompanyWideReceipts(ctx);
    const unexpired: Prisma.AnnouncementWhereInput = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const company = (extra: Prisma.AnnouncementWhereInput = {}) => ({
      AND: [this.visibleToRecipients(ctx.companyId, AnnouncementType.COMPANY), extra],
    });
    const include = { announcement: { include: { creator: { select: USER_SUMMARY } } } } as const;

    const [unreadCount, urgent, pendingAck, whatsNew, latest] = await Promise.all([
      this.prisma.announcementRecipient.count({
        where: { userId: ctx.userId, readAt: null, announcement: company() },
      }),
      this.prisma.announcementRecipient.findMany({
        where: {
          userId: ctx.userId,
          readAt: null,
          announcement: company({ ...unexpired, priority: AnnouncementPriority.URGENT }),
        },
        orderBy: { announcement: { publishedAt: 'desc' } },
        take: 5,
        include,
      }),
      this.prisma.announcementRecipient.findMany({
        where: {
          userId: ctx.userId,
          acknowledgedAt: null,
          announcement: company({
            ...unexpired,
            priority: AnnouncementPriority.URGENT,
            requireAcknowledgement: true,
          }),
        },
        orderBy: { announcement: { publishedAt: 'asc' } },
        take: 5,
        include,
      }),
      this.prisma.announcementRecipient.findMany({
        where: {
          userId: ctx.userId,
          readAt: null,
          announcement: {
            AND: [this.visibleToRecipients(ctx.companyId, AnnouncementType.SYSTEM_UPDATE), unexpired],
          },
        },
        orderBy: { announcement: { publishedAt: 'desc' } },
        take: 10,
        include,
      }),
      this.prisma.announcementRecipient.findMany({
        where: { userId: ctx.userId, announcement: company(unexpired) },
        orderBy: [{ announcement: { publishedAt: 'desc' } }],
        take: 20,
        include,
      }),
    ]);

    const latestSorted = [...latest]
      .sort((a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)))
      .slice(0, 3);

    return {
      unreadCount,
      urgent: urgent.map((row) => this.recipientSummary(row.announcement, row, now)),
      pendingAcknowledgement: pendingAck.map((row) =>
        this.recipientDetail(row.announcement, row, now, []),
      ),
      whatsNew: whatsNew.map((row) => this.recipientDetail(row.announcement, row, now, [])),
      latest: latestSorted.map((row) => this.recipientSummary(row.announcement, row, now)),
    };
  }

  async getMine(ctx: AnnouncementCtx, id: string, now = new Date()) {
    const { announcement, recipient } = await this.findForRecipient(ctx, id);
    return this.recipientDetail(
      announcement,
      recipient,
      now,
      announcement.attachmentFolder?.documents ?? [],
    );
  }

  async markRead(ctx: AnnouncementCtx, id: string, now = new Date()) {
    const { recipient } = await this.findForRecipient(ctx, id);
    if (recipient.readAt) {
      return { readAt: recipient.readAt, acknowledgedAt: recipient.acknowledgedAt };
    }
    const updated = await this.prisma.announcementRecipient.update({
      where: { id: recipient.id },
      data: { readAt: now },
    });
    return { readAt: updated.readAt, acknowledgedAt: updated.acknowledgedAt };
  }

  /** Batch read (What's new modal). Ignores ids the user did not receive. */
  async markManyRead(ctx: AnnouncementCtx, ids: string[], now = new Date()) {
    const result = await this.prisma.announcementRecipient.updateMany({
      where: {
        userId: ctx.userId,
        readAt: null,
        announcementId: { in: ids },
        announcement: { companyId: ctx.companyId },
      },
      data: { readAt: now },
    });
    return { updated: result.count };
  }

  async acknowledge(ctx: AnnouncementCtx, id: string, now = new Date()) {
    const { announcement, recipient } = await this.findForRecipient(ctx, id);
    if (!announcement.requireAcknowledgement) {
      throw new BadRequestException('This announcement does not ask for an acknowledgement.');
    }
    if (recipient.acknowledgedAt) {
      return { readAt: recipient.readAt, acknowledgedAt: recipient.acknowledgedAt };
    }
    const updated = await this.prisma.announcementRecipient.update({
      where: { id: recipient.id },
      data: { acknowledgedAt: now, readAt: recipient.readAt ?? now },
    });
    return { readAt: updated.readAt, acknowledgedAt: updated.acknowledgedAt };
  }

  async getMyAttachmentUrl(ctx: AnnouncementCtx, id: string, documentId: string) {
    const { announcement } = await this.findForRecipient(ctx, id);
    return this.attachmentUrl(announcement, documentId);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Flips the status to PUBLISHED (only from `from`), snapshots recipients and
   * notifies them. Returns published=false when another run already did it.
   */
  async publishNow(
    id: string,
    actorId: string,
    now: Date,
    from: AnnouncementStatus[] = PUBLISHABLE,
  ): Promise<{ published: boolean; recipients: number }> {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const flipped = await tx.announcement.updateMany({
        where: { id, status: { in: from }, deletedAt: null },
        data: { status: AnnouncementStatus.PUBLISHED, publishedAt: now, updatedBy: actorId },
      });
      if (flipped.count === 0) {
        return null;
      }
      const announcement = await tx.announcement.findUniqueOrThrow({ where: { id } });
      const userIds = await this.audience.resolveUserIds(announcement.companyId, announcement, tx);
      if (userIds.length > 0) {
        await tx.announcementRecipient.createMany({
          data: userIds.map((userId) => ({ announcementId: id, userId })),
          skipDuplicates: true,
        });
      }
      return { announcement, userIds };
    });

    if (!result) {
      return { published: false, recipients: 0 };
    }
    await this.notifyRecipients(result.announcement, result.userIds, 'published', actorId);
    return { published: true, recipients: result.userIds.length };
  }

  /**
   * In-app notification per recipient ("📢 {title}"), plus email when the
   * post asks for it. NotificationService applies SEED_MODE / EMAIL_DISABLED.
   * System updates surface through the What's new modal instead.
   */
  private async notifyRecipients(
    announcement: Announcement,
    userIds: string[],
    kind: 'published' | 'reminder' | 'updated',
    actorId: string,
  ): Promise<number> {
    if (announcement.type === AnnouncementType.SYSTEM_UPDATE || userIds.length === 0) {
      return 0;
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, preferredLanguage: true },
    });
    const language = new Map(users.map((user) => [user.id, user.preferredLanguage ?? '']));
    const link = `/announcements/${announcement.id}`;
    const appUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    const ctx = { companyId: announcement.companyId, userId: actorId };
    const withEmail = kind === 'published' && announcement.sendEmail;

    let notified = 0;
    for (const userId of userIds) {
      const zh = language.get(userId)?.toLowerCase().startsWith('zh') ?? false;
      const title = (zh && announcement.titleZh) || announcement.title;
      const excerpt =
        kind === 'updated'
          ? zh
            ? '此公告已更新，请重新阅读并确认。'
            : 'This announcement was updated - please review and acknowledge again.'
          : markdownToPlainText((zh && announcement.bodyZh) || announcement.body);
      const subject =
        kind === 'reminder'
          ? `📢 ${zh ? '提醒' : 'Reminder'}: ${title}`
          : kind === 'updated'
            ? `📢 ${zh ? '已更新' : 'Updated'}: ${title}`
            : `📢 ${title}`;
      const eventType =
        kind === 'reminder'
          ? ANNOUNCEMENT_EVENT_REMINDER
          : kind === 'updated'
            ? ANNOUNCEMENT_EVENT_UPDATED
            : ANNOUNCEMENT_EVENT_PUBLISHED;
      try {
        await this.notifications.send(ctx, {
          recipientId: userId,
          eventType,
          channel: 'IN_APP',
          subject,
          body: excerpt,
          link,
        });
        notified += 1;
        if (withEmail) {
          await this.notifications.send(ctx, {
            recipientId: userId,
            eventType,
            channel: 'EMAIL',
            subject,
            body: `${excerpt}\n\n${zh ? '阅读全文' : 'Read the full announcement'}: ${appUrl}${link}`,
          });
        }
      } catch (error) {
        this.logger.warn(
          `[Announcement] Failed to notify ${userId} about ${announcement.number}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return notified;
  }

  /**
   * Company-wide pinned posts reach people who joined after publishing: their
   * recipient row is created the first time they load announcements.
   */
  private async ensurePinnedCompanyWideReceipts(ctx: AnnouncementCtx): Promise<void> {
    const missing = await this.prisma.announcement.findMany({
      where: {
        ...this.visibleToRecipients(ctx.companyId, AnnouncementType.COMPANY),
        pinned: true,
        audienceScope: AnnouncementScope.ALL,
        recipients: { none: { userId: ctx.userId } },
      },
      select: { id: true },
    });
    if (missing.length === 0) {
      return;
    }
    await this.prisma.announcementRecipient.createMany({
      data: missing.map((row) => ({ announcementId: row.id, userId: ctx.userId })),
      skipDuplicates: true,
    });
  }

  private visibleToRecipients(
    companyId: string,
    type: AnnouncementType,
  ): Prisma.AnnouncementWhereInput {
    return { companyId, type, status: AnnouncementStatus.PUBLISHED, deletedAt: null };
  }

  private async findForRecipient(ctx: AnnouncementCtx, id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        companyId: ctx.companyId,
        deletedAt: null,
        status: AnnouncementStatus.PUBLISHED,
      },
      include: {
        creator: { select: USER_SUMMARY },
        attachmentFolder: {
          include: { documents: { where: { deletedAt: null }, select: DOCUMENT_SUMMARY } },
        },
      },
    });
    if (!announcement) {
      throw new NotFoundException('Announcement not found.');
    }
    let recipient = await this.prisma.announcementRecipient.findUnique({
      where: { announcementId_userId: { announcementId: id, userId: ctx.userId } },
    });
    if (
      !recipient &&
      announcement.type === AnnouncementType.COMPANY &&
      announcement.pinned &&
      announcement.audienceScope === AnnouncementScope.ALL
    ) {
      recipient = await this.prisma.announcementRecipient.create({
        data: { announcementId: id, userId: ctx.userId },
      });
    }
    if (!recipient) {
      throw new ForbiddenException('You are not a recipient of this announcement.');
    }
    return { announcement, recipient };
  }

  private async findManaged(ctx: AnnouncementCtx, id: string, access: ManageAccess) {
    const row = await this.prisma.announcement.findFirst({
      where: { id, companyId: ctx.companyId, deletedAt: null },
      include: {
        creator: { select: USER_SUMMARY },
        attachmentFolder: {
          include: { documents: { where: { deletedAt: null }, select: DOCUMENT_SUMMARY } },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    this.assertCanManageType(access, row.type);
    return row;
  }

  private async access(ctx: AnnouncementCtx): Promise<ManageAccess> {
    const [flags, roleNames] = await Promise.all([
      this.permissions.getUserModulePermissions(ctx.userId, ctx.companyId, 'announcements'),
      this.permissions.getUserRoleNames(ctx.userId, ctx.companyId),
    ]);
    return { flags, isSystemAdmin: isTrueSystemAdministrator(roleNames) };
  }

  private manageableTypes(access: ManageAccess): AnnouncementType[] {
    const types: AnnouncementType[] = [];
    if (access.flags.canCreate || access.flags.canEdit || access.flags.canApprove) {
      types.push(AnnouncementType.COMPANY);
    }
    if (access.isSystemAdmin) {
      types.push(AnnouncementType.SYSTEM_UPDATE);
    }
    if (types.length === 0) {
      throw new ForbiddenException('You do not have permission to manage announcements.');
    }
    return types;
  }

  private assertCanManageType(access: ManageAccess, type: AnnouncementType): void {
    if (type === AnnouncementType.SYSTEM_UPDATE && !access.isSystemAdmin) {
      throw new ForbiddenException('Only System Administrators can manage system updates.');
    }
    if (
      type === AnnouncementType.COMPANY &&
      !access.flags.canCreate &&
      !access.flags.canEdit &&
      !access.flags.canApprove
    ) {
      throw new ForbiddenException('You do not have permission to manage announcements.');
    }
  }

  /** System updates always go to everyone, with no email or acknowledgement. */
  private normaliseForType<T extends Partial<AnnouncementAudience> & Record<string, unknown>>(
    type: AnnouncementType,
    data: T,
  ): T {
    const base = {
      ...data,
      departmentIds: [...(data.departmentIds ?? [])],
      disciplineIds: [...(data.disciplineIds ?? [])],
      roleIds: [...(data.roleIds ?? [])],
      employeeIds: [...(data.employeeIds ?? [])],
    };
    if (type !== AnnouncementType.SYSTEM_UPDATE) {
      return base;
    }
    return {
      ...base,
      audienceScope: AnnouncementScope.ALL,
      departmentIds: [],
      disciplineIds: [],
      roleIds: [],
      employeeIds: [],
      requireAcknowledgement: false,
      sendEmail: false,
    };
  }

  private async statsFor(
    ids: string[],
  ): Promise<Map<string, { recipients: number; read: number; acknowledged: number }>> {
    const result = new Map<string, { recipients: number; read: number; acknowledged: number }>();
    if (ids.length === 0) {
      return result;
    }
    const groups = await this.prisma.announcementRecipient.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: ids } },
      _count: { _all: true, readAt: true, acknowledgedAt: true },
    });
    for (const group of groups) {
      result.set(group.announcementId, {
        recipients: group._count._all,
        read: group._count.readAt,
        acknowledged: group._count.acknowledgedAt,
      });
    }
    return result;
  }

  private async audienceLabels(companyId: string, row: AnnouncementAudience): Promise<string[]> {
    switch (row.audienceScope) {
      case AnnouncementScope.DEPARTMENTS:
        return (
          await this.prisma.department.findMany({
            where: { companyId, id: { in: [...row.departmentIds] } },
            select: { name: true },
            orderBy: { name: 'asc' },
          })
        ).map((item) => item.name);
      case AnnouncementScope.DISCIPLINES:
        return (
          await this.prisma.discipline.findMany({
            where: { companyId, id: { in: [...row.disciplineIds] } },
            select: { name: true },
            orderBy: { name: 'asc' },
          })
        ).map((item) => item.name);
      case AnnouncementScope.ROLES:
        return (
          await this.prisma.role.findMany({
            where: { companyId, id: { in: [...row.roleIds] } },
            select: { name: true },
            orderBy: { name: 'asc' },
          })
        ).map((item) => item.name);
      case AnnouncementScope.EMPLOYEES:
        return (
          await this.prisma.user.findMany({
            where: { companyId, id: { in: [...row.employeeIds] } },
            select: { firstName: true, lastName: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          })
        ).map((item) => `${item.firstName} ${item.lastName}`.trim());
      default:
        return [];
    }
  }

  private managedSummary(row: Announcement) {
    return {
      id: row.id,
      number: row.number,
      type: row.type,
      title: row.title,
      titleZh: row.titleZh,
      priority: row.priority,
      status: row.status,
      audienceScope: row.audienceScope,
      audienceSize:
        row.audienceScope === AnnouncementScope.DEPARTMENTS
          ? row.departmentIds.length
          : row.audienceScope === AnnouncementScope.DISCIPLINES
            ? row.disciplineIds.length
            : row.audienceScope === AnnouncementScope.ROLES
              ? row.roleIds.length
              : row.audienceScope === AnnouncementScope.EMPLOYEES
                ? row.employeeIds.length
                : 0,
      requireAcknowledgement: row.requireAcknowledgement,
      sendEmail: row.sendEmail,
      pinned: row.pinned,
      publishAt: row.publishAt,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private recipientSummary(
    announcement: Announcement & { creator?: unknown },
    recipient: { readAt: Date | null; acknowledgedAt: Date | null },
    now: Date,
  ) {
    return {
      id: announcement.id,
      number: announcement.number,
      type: announcement.type,
      title: announcement.title,
      titleZh: announcement.titleZh,
      excerpt: markdownToPlainText(announcement.body, 180),
      excerptZh: announcement.bodyZh ? markdownToPlainText(announcement.bodyZh, 180) : null,
      priority: announcement.priority,
      pinned: announcement.pinned,
      requireAcknowledgement: announcement.requireAcknowledgement,
      publishedAt: announcement.publishedAt,
      expiresAt: announcement.expiresAt,
      contentEditedAt: announcement.contentEditedAt,
      isExpired: Boolean(announcement.expiresAt && announcement.expiresAt.getTime() <= now.getTime()),
      author: announcement.creator ?? null,
      readAt: recipient.readAt,
      acknowledgedAt: recipient.acknowledgedAt,
    };
  }

  private recipientDetail(
    announcement: Announcement & { creator?: unknown },
    recipient: { readAt: Date | null; acknowledgedAt: Date | null },
    now: Date,
    attachments: unknown[],
  ) {
    return {
      ...this.recipientSummary(announcement, recipient, now),
      body: announcement.body,
      bodyZh: announcement.bodyZh,
      attachments,
    };
  }

  private async findAttachment(row: { attachmentFolderId: string | null }, documentId: string) {
    if (!row.attachmentFolderId) {
      throw new NotFoundException('Attachment not found.');
    }
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, folderId: row.attachmentFolderId, deletedAt: null },
      select: { id: true, fileKey: true, name: true },
    });
    if (!document) {
      throw new NotFoundException('Attachment not found.');
    }
    return document;
  }

  private async attachmentUrl(row: { attachmentFolderId: string | null }, documentId: string) {
    const document = await this.findAttachment(row, documentId);
    const expiresIn = 300;
    const url = await this.storage.getPresignedDownloadUrl(STORAGE_BUCKETS.HR, document.fileKey, expiresIn);
    return { url, expiresIn, name: document.name };
  }

  private async ensureAttachmentFolder(
    row: { id: string; number: string; attachmentFolderId: string | null },
    ctx: AnnouncementCtx,
  ): Promise<string> {
    if (row.attachmentFolderId) {
      return row.attachmentFolderId;
    }
    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId: ctx.companyId,
          name: `Announcement ${row.number}`,
          path: `/announcements/${row.number}`,
          contextType: FolderContextType.ANNOUNCEMENT,
          contextId: row.id,
          isSystem: false,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      await tx.announcement.update({
        where: { id: row.id },
        data: { attachmentFolderId: folderId, updatedBy: ctx.userId },
      });
    });
    return folderId;
  }

  private async nextNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('announcement_number_seq')
    `;
    return `AN-${String(Number(result[0].nextval)).padStart(4, '0')}`;
  }
}

/** Export timestamps in company local time (Addis Ababa). */
function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
