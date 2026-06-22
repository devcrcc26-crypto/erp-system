import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MeetingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateActionItemDto,
  CreateMeetingAgendaItemDto,
  CreateMeetingAttendeeDto,
  CreateMeetingDto,
  PmListQueryDto,
  UpdateActionItemDto,
  UpdateMeetingAgendaItemDto,
  UpdateMeetingAttendeeDto,
  UpdateMeetingDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapActionItem,
  mapMeeting,
  mapMeetingAgendaItem,
  mapMeetingAttendee,
  mapMeetingDetail,
  MappedActionItem,
  MappedMeeting,
  MappedMeetingAgendaItem,
  MappedMeetingAttendee,
  MappedMeetingDetail,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { DocumentNumberService } from './document-number.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';

const MEETING_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'meetingDate',
  'title',
  'meetingNumber',
  'status',
]);

const MEETING_DETAIL_INCLUDE = {
  agendaItems: { orderBy: { itemOrder: 'asc' as const } },
  attendees: { orderBy: { createdAt: 'asc' as const } },
  actionItems: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
  ) {}

  /**
   * Returns a paginated list of meetings for a project.
   */
  async listMeetings(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMeeting>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      MEETING_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.meeting.findMany({ where, skip, take, orderBy }),
      this.prisma.meeting.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapMeeting),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a meeting with agenda items, attendees, and action items.
   */
  async getMeeting(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
  ): Promise<MappedMeetingDetail> {
    const row = await this.getMeetingDetailOrThrow(projectId, meetingId);
    return this.enrichMeetingDetail(ctx, projectId, row);
  }

  /**
   * Creates a meeting with an auto-generated meeting number.
   */
  async createMeeting(
    ctx: PmContext,
    projectId: string,
    dto: CreateMeetingDto,
  ): Promise<MappedMeetingDetail> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const meetingNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'MEETING',
    );

    const row = await this.prisma.meeting.create({
      data: {
        projectId,
        organizerId: ctx.userId,
        meetingNumber,
        meetingType: dto.meetingType,
        title: dto.title,
        meetingDate: new Date(dto.meetingDate),
        location: dto.location,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: MEETING_DETAIL_INCLUDE,
    });

    const folder =
      await this.engineeringDocumentFolderService.ensureMeetingFolder(
        ctx,
        projectId,
        row.id,
        row.meetingNumber,
      );

    return mapMeetingDetail(row, folder.id);
  }

  /**
   * Updates an existing meeting scoped to a project.
   */
  async updateMeeting(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    dto: UpdateMeetingDto,
  ): Promise<MappedMeetingDetail> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);

    const row = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        meetingType: dto.meetingType,
        title: dto.title,
        meetingDate: dto.meetingDate ? new Date(dto.meetingDate) : undefined,
        location: dto.location,
        status: dto.status,
        minutesIssuedAt:
          dto.status === MeetingStatus.MINUTES_ISSUED ? new Date() : undefined,
        updatedBy: ctx.userId,
      },
      include: MEETING_DETAIL_INCLUDE,
    });

    return this.enrichMeetingDetail(ctx, projectId, row);
  }

  /**
   * Soft-deletes a meeting scoped to a project.
   */
  async deleteMeeting(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
  ): Promise<void> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Adds an agenda item to a meeting.
   */
  async addAgendaItem(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    dto: CreateMeetingAgendaItemDto,
  ): Promise<MappedMeetingAgendaItem> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    if (dto.presenterId) {
      await this.assertUserInCompany(ctx, dto.presenterId);
    }

    const itemOrder =
      dto.itemOrder ??
      (await this.nextAgendaItemOrder(meetingId));

    const row = await this.prisma.meetingAgendaItem.create({
      data: {
        meetingId,
        presenterId: dto.presenterId,
        itemOrder,
        topic: dto.topic,
        discussionNotes: dto.discussionNotes,
        decisionsMade: dto.decisionsMade,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapMeetingAgendaItem(row);
  }

  /**
   * Updates an agenda item on a meeting.
   */
  async updateAgendaItem(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    agendaItemId: string,
    dto: UpdateMeetingAgendaItemDto,
  ): Promise<MappedMeetingAgendaItem> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.getAgendaItemOrThrow(meetingId, agendaItemId);
    if (dto.presenterId) {
      await this.assertUserInCompany(ctx, dto.presenterId);
    }

    const row = await this.prisma.meetingAgendaItem.update({
      where: { id: agendaItemId },
      data: {
        topic: dto.topic,
        presenterId: dto.presenterId,
        itemOrder: dto.itemOrder,
        discussionNotes: dto.discussionNotes,
        decisionsMade: dto.decisionsMade,
        updatedBy: ctx.userId,
      },
    });

    return mapMeetingAgendaItem(row);
  }

  /**
   * Removes an agenda item from a meeting.
   */
  async removeAgendaItem(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    agendaItemId: string,
  ): Promise<void> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.getAgendaItemOrThrow(meetingId, agendaItemId);
    await this.prisma.meetingAgendaItem.delete({ where: { id: agendaItemId } });
  }

  /**
   * Adds an attendee to a meeting.
   */
  async addAttendee(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    dto: CreateMeetingAttendeeDto,
  ): Promise<MappedMeetingAttendee> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    if (dto.userId) {
      await this.assertUserInCompany(ctx, dto.userId);
    }
    if (!dto.userId && !dto.externalName?.trim()) {
      throw new NotFoundException('Attendee user or external name is required');
    }

    const row = await this.prisma.meetingAttendee.create({
      data: {
        meetingId,
        userId: dto.userId,
        externalName: dto.externalName,
        organization: dto.organization,
        roleAtMeeting: dto.roleAtMeeting,
        attended: dto.attended ?? false,
        createdBy: ctx.userId,
      },
    });

    return mapMeetingAttendee(row);
  }

  /**
   * Updates an attendee record on a meeting.
   */
  async updateAttendee(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    attendeeId: string,
    dto: UpdateMeetingAttendeeDto,
  ): Promise<MappedMeetingAttendee> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.getAttendeeOrThrow(meetingId, attendeeId);

    const row = await this.prisma.meetingAttendee.update({
      where: { id: attendeeId },
      data: {
        externalName: dto.externalName,
        organization: dto.organization,
        roleAtMeeting: dto.roleAtMeeting,
        attended: dto.attended,
      },
    });

    return mapMeetingAttendee(row);
  }

  /**
   * Removes an attendee from a meeting.
   */
  async removeAttendee(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    attendeeId: string,
  ): Promise<void> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.getAttendeeOrThrow(meetingId, attendeeId);
    await this.prisma.meetingAttendee.delete({ where: { id: attendeeId } });
  }

  /**
   * Adds an action item to a meeting.
   */
  async addActionItem(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    dto: CreateActionItemDto,
  ): Promise<MappedActionItem> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertUserInCompany(ctx, dto.ownerId);

    const row = await this.prisma.actionItem.create({
      data: {
        meetingId,
        ownerId: dto.ownerId,
        description: dto.description,
        dueDate: parseOptionalDate(dto.dueDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapActionItem(row);
  }

  /**
   * Updates an action item on a meeting.
   */
  async updateActionItem(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    actionItemId: string,
    dto: UpdateActionItemDto,
  ): Promise<MappedActionItem> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    const existing = await this.getActionItemOrThrow(meetingId, actionItemId);

    const closedAt =
      dto.status === 'CLOSED' && existing.status !== 'CLOSED'
        ? new Date()
        : dto.status && dto.status !== 'CLOSED'
          ? null
          : undefined;

    const row = await this.prisma.actionItem.update({
      where: { id: actionItemId },
      data: {
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        closedAt,
        updatedBy: ctx.userId,
      },
    });

    return mapActionItem(row);
  }

  /**
   * Soft-deletes an action item from a meeting.
   */
  async removeActionItem(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    actionItemId: string,
  ): Promise<void> {
    await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.getActionItemOrThrow(meetingId, actionItemId);
    await this.prisma.actionItem.update({
      where: { id: actionItemId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.MeetingWhereInput {
    const where: Prisma.MeetingWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status as MeetingStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { meetingNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async enrichMeetingDetail(
    ctx: PmContext,
    projectId: string,
    row: Prisma.MeetingGetPayload<{ include: typeof MEETING_DETAIL_INCLUDE }>,
  ): Promise<MappedMeetingDetail> {
    let attachmentFolderId: string | null = null;

    try {
      const folder =
        await this.engineeringDocumentFolderService.ensureMeetingFolder(
          ctx,
          projectId,
          row.id,
          row.meetingNumber,
        );
      attachmentFolderId = folder.id;
    } catch (error) {
      this.logger.warn(
        `Meeting ${row.id} attachment folder could not be ensured`,
        error instanceof Error ? error.message : String(error),
      );
    }

    return mapMeetingDetail(row, attachmentFolderId);
  }

  private async nextAgendaItemOrder(meetingId: string): Promise<number> {
    const maxItem = await this.prisma.meetingAgendaItem.aggregate({
      where: { meetingId },
      _max: { itemOrder: true },
    });
    return (maxItem._max.itemOrder ?? 0) + 1;
  }

  private async getMeetingDetailOrThrow(projectId: string, meetingId: string) {
    const row = await this.prisma.meeting.findFirst({
      where: activeOnly({ id: meetingId, projectId }),
      include: MEETING_DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Meeting not found');
    }
    return row;
  }

  private async getAgendaItemOrThrow(meetingId: string, agendaItemId: string) {
    const row = await this.prisma.meetingAgendaItem.findFirst({
      where: { id: agendaItemId, meetingId },
    });
    if (!row) {
      throw new NotFoundException('Agenda item not found');
    }
    return row;
  }

  private async getAttendeeOrThrow(meetingId: string, attendeeId: string) {
    const row = await this.prisma.meetingAttendee.findFirst({
      where: { id: attendeeId, meetingId },
    });
    if (!row) {
      throw new NotFoundException('Attendee not found');
    }
    return row;
  }

  private async getActionItemOrThrow(meetingId: string, actionItemId: string) {
    const row = await this.prisma.actionItem.findFirst({
      where: activeOnly({ id: actionItemId, meetingId }),
    });
    if (!row) {
      throw new NotFoundException('Action item not found');
    }
    return row;
  }

  private async assertUserInCompany(
    ctx: PmContext,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }
}
