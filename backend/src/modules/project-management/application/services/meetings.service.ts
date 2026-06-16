import { Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateMeetingDto,
  PmListQueryDto,
  UpdateMeetingDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapMeeting,
  mapMeetingDetail,
  MappedMeeting,
  MappedMeetingDetail,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { DocumentNumberService } from './document-number.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
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
    return mapMeetingDetail(row);
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

    return mapMeetingDetail(row);
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
        updatedBy: ctx.userId,
      },
      include: MEETING_DETAIL_INCLUDE,
    });

    return mapMeetingDetail(row);
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
}
