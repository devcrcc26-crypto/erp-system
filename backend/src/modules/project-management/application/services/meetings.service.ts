import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { IssueSeverity, MeetingStatus, Prisma } from '@prisma/client';
import { formatDesignPackageFullCode } from '../../../../shared/discipline-number.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateActionItemDto,
  CreateIssueFromActionItemDto,
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
  MappedIssue,
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
  MappedMyMeeting,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import {
  enrichRowsWithUserDisplayNames,
  enrichWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import {
  PM_ACTION_ITEM_OWNER_NAME,
  PM_AGENDA_PRESENTER_NAME,
  PM_MEETING_ATTENDEE_NAMES,
  PM_ORGANIZER_NAME,
} from '../utils/pm-user-name-fields.const';
import { loadRaisedItemsForSource } from '../utils/source-entity.util';
import { disciplineAssigneeOr, subtaskRoleOr } from '../../domain/task-access-scope.util';
import { DisciplineScopeService } from './discipline-scope.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { IssuesService } from './issues.service';
import { ProjectScopeService } from './project-scope.service';

const ACTION_ITEM_ASSIGNED_EVENT = 'meeting.action_item.assigned';

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
    include: { linkedIssue: { select: { issueNumber: true, status: true } } },
  },
};

const MEETING_SUBTASK_FULL_CODE_SELECT = {
  packageCode: true,
  subtaskIndex: true,
  taskDiscipline: {
    select: {
      disciplineIndex: true,
      task: { select: { overseasTaskNumber: true } },
    },
  },
} as const;

export interface MeetingSubtaskOption {
  id: string;
  name: string;
  fullCode: string;
  taskDisciplineId: string;
}

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly permissionService: PermissionService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly issuesService: IssuesService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Lists subtasks the current user may schedule a subtask-scoped meeting
   * against (FK roles only, or all project subtasks for full-access users).
   */
  async listEligibleSubtasks(
    ctx: PmContext,
    projectId: string,
  ): Promise<MeetingSubtaskOption[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const isFullAccess = hasFullProjectDataAccess(roleNames);

    const packages = await this.prisma.designPackage.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        taskDiscipline: {
          deletedAt: null,
          task: { projectId, deletedAt: null },
        },
        ...(isFullAccess ? {} : { OR: subtaskRoleOr(ctx.userId) }),
      }),
      select: {
        id: true,
        name: true,
        taskDisciplineId: true,
        ...MEETING_SUBTASK_FULL_CODE_SELECT,
      },
      orderBy: { packageCode: 'asc' },
    });

    return packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      taskDisciplineId: pkg.taskDisciplineId,
      fullCode: formatDesignPackageFullCode(
        pkg.taskDiscipline.task.overseasTaskNumber,
        pkg.taskDiscipline.disciplineIndex,
        pkg.subtaskIndex,
      ),
    }));
  }

  /**
   * Returns a paginated list of meetings for a project.
   */
  async listMeetings(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMeeting>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = await this.buildListWhere(ctx, projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      MEETING_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { _count: { select: { attendees: true } } },
      }),
      this.prisma.meeting.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map(mapMeeting),
      PM_ORGANIZER_NAME,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Meetings relevant to the current user across projects: creator, attendee,
   * or FK role on the meeting's discipline.
   */
  async listMyMeetings(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyMeeting>> {
    const where = this.buildMyMeetingListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      MEETING_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          _count: { select: { attendees: true } },
        },
      }),
      this.prisma.meeting.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map((row) => ({
        ...mapMeeting(row),
        projectName: row.project.name,
        projectCode: row.project.projectCode,
      })),
      PM_ORGANIZER_NAME,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-wide meetings (portfolio / admin users).
   */
  async listAllMeetings(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyMeeting>> {
    const where: Prisma.MeetingWhereInput = activeOnly({
      project: activeOnly({ companyId: ctx.companyId }),
    });
    if (query.status) {
      where.status = query.status as MeetingStatus;
    }
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      MEETING_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          _count: { select: { attendees: true } },
        },
      }),
      this.prisma.meeting.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map((row) => ({
        ...mapMeeting(row),
        projectName: row.project.name,
        projectCode: row.project.projectCode,
      })),
      PM_ORGANIZER_NAME,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Returns a meeting with agenda items, attendees, and action items.
   */
  async getMeeting(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
  ): Promise<MappedMeetingDetail> {
    let row = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, row, 'view');

    if (row.status === MeetingStatus.SCHEDULED && row.meetingDate <= new Date()) {
      row = await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.IN_PROGRESS, updatedBy: ctx.userId },
        include: MEETING_DETAIL_INCLUDE,
      });
    }

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
    const project = await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.assertCanAccessMeeting(ctx, { projectId }, 'create');

    const scope = dto.scope ?? 'PROJECT';
    let taskDisciplineId = dto.taskDisciplineId ?? null;
    let designPackageId: string | null = null;

    if (scope === 'SUBTASK') {
      if (!dto.designPackageId) {
        throw new BadRequestException('designPackageId is required for a subtask-scoped meeting');
      }
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: dto.designPackageId,
          companyId: ctx.companyId,
          taskDiscipline: { task: { projectId, deletedAt: null } },
        }),
        select: { id: true, taskDisciplineId: true },
      });
      if (!pkg) {
        throw new NotFoundException('Subtask not found on this project');
      }
      designPackageId = pkg.id;
      taskDisciplineId = pkg.taskDisciplineId;
    } else if (scope === 'DISCIPLINE') {
      if (!dto.taskDisciplineId) {
        throw new BadRequestException('taskDisciplineId is required for a discipline-scoped meeting');
      }
      const discipline = await this.prisma.taskDiscipline.findFirst({
        where: activeOnly({
          id: dto.taskDisciplineId,
          companyId: ctx.companyId,
          task: { projectId, deletedAt: null },
        }),
        select: { id: true },
      });
      if (!discipline) {
        throw new NotFoundException('Discipline not found on this project');
      }
      taskDisciplineId = discipline.id;
    } else {
      taskDisciplineId = null;
    }

    const count = await this.prisma.meeting.count({
      where: {
        projectId,
        deletedAt: null,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    const meetingNumber = `MTG-${project.projectCode}-${seq}`;

    const meetingDate = new Date(dto.meetingDate);
    const status =
      meetingDate <= new Date() ? MeetingStatus.IN_PROGRESS : MeetingStatus.SCHEDULED;

    const row = await this.prisma.meeting.create({
      data: {
        projectId,
        organizerId: ctx.userId,
        meetingNumber,
        meetingType: dto.meetingType,
        title: dto.title,
        meetingDate,
        location: dto.location,
        status,
        scope,
        taskDisciplineId,
        designPackageId,
        startTime: dto.startTime,
        endTime: dto.endTime,
        agenda: dto.agenda,
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

    return mapMeetingDetail(
      row,
      folder.id,
      await this.loadMeetingRaisedItems(projectId, row.id),
    );
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
    const existing = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, existing, 'edit');

    const minutesNewlySet = Boolean(dto.minutes?.trim()) && !existing.minutes?.trim();

    let taskDisciplineId: string | null | undefined = dto.taskDisciplineId;
    let designPackageId: string | null | undefined = dto.designPackageId;
    if (dto.scope === 'SUBTASK' && dto.designPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: dto.designPackageId,
          companyId: ctx.companyId,
          taskDiscipline: { task: { projectId, deletedAt: null } },
        }),
        select: { id: true, taskDisciplineId: true },
      });
      if (!pkg) {
        throw new NotFoundException('Subtask not found on this project');
      }
      designPackageId = pkg.id;
      taskDisciplineId = pkg.taskDisciplineId;
    } else if (dto.scope === 'DISCIPLINE' && dto.taskDisciplineId) {
      const discipline = await this.prisma.taskDiscipline.findFirst({
        where: activeOnly({
          id: dto.taskDisciplineId,
          companyId: ctx.companyId,
          task: { projectId, deletedAt: null },
        }),
        select: { id: true },
      });
      if (!discipline) {
        throw new NotFoundException('Discipline not found on this project');
      }
      taskDisciplineId = discipline.id;
      designPackageId = null;
    } else if (dto.scope === 'PROJECT') {
      taskDisciplineId = null;
      designPackageId = null;
    } else if (dto.designPackageId) {
      await this.assertPackageInProject(ctx, projectId, dto.designPackageId);
    }

    const row = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        meetingType: dto.meetingType,
        title: dto.title,
        meetingDate: dto.meetingDate ? new Date(dto.meetingDate) : undefined,
        location: dto.location,
        startTime: dto.startTime,
        endTime: dto.endTime,
        agenda: dto.agenda,
        minutes: dto.minutes,
        scope: dto.scope,
        taskDisciplineId:
          dto.scope !== undefined || dto.taskDisciplineId !== undefined
            ? taskDisciplineId
            : undefined,
        designPackageId:
          dto.scope !== undefined || dto.designPackageId !== undefined
            ? designPackageId
            : undefined,
        status: minutesNewlySet ? MeetingStatus.COMPLETED : undefined,
        minutesIssuedAt: minutesNewlySet ? new Date() : undefined,
        updatedBy: ctx.userId,
      },
      include: MEETING_DETAIL_INCLUDE,
    });

    return this.enrichMeetingDetail(ctx, projectId, row);
  }

  /**
   * Cancels a scheduled meeting. Only meetings that have not started may be cancelled.
   */
  async cancelMeeting(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
  ): Promise<MappedMeetingDetail> {
    const existing = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, existing, 'edit');

    if (existing.status !== MeetingStatus.SCHEDULED) {
      throw new BadRequestException('Only a scheduled meeting can be cancelled');
    }

    const row = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.CANCELLED, updatedBy: ctx.userId },
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
    const meeting = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, meeting, 'edit');

    const attendeeType = dto.attendeeType ?? (dto.userId ? 'INTERNAL' : 'EXTERNAL');
    if (attendeeType === 'INTERNAL') {
      if (!dto.userId) {
        throw new BadRequestException('userId is required for an internal attendee');
      }
      await this.assertUserInCompany(ctx, dto.userId);
      const existingInternal = await this.prisma.meetingAttendee.findFirst({
        where: { meetingId, userId: dto.userId },
      });
      if (existingInternal) {
        throw new BadRequestException('User is already an attendee');
      }
    } else if (!dto.externalName?.trim()) {
      throw new BadRequestException('name is required for an external attendee');
    } else {
      const existingExternal = await this.prisma.meetingAttendee.findFirst({
        where: {
          meetingId,
          externalName: dto.externalName.trim(),
          userId: null,
        },
      });
      if (existingExternal) {
        throw new BadRequestException('Attendee already added');
      }
    }

    let organization: string | undefined =
      attendeeType === 'INTERNAL' ? 'CCECC' : (dto.organization ?? undefined);
    let roleAtMeeting: string | null | undefined =
      attendeeType === 'INTERNAL' ? undefined : (dto.roleAtMeeting ?? undefined);
    let email: string | undefined =
      attendeeType === 'INTERNAL' ? undefined : (dto.email ?? undefined);

    if (attendeeType === 'INTERNAL' && dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: dto.userId, companyId: ctx.companyId },
        select: {
          email: true,
          department: { select: { name: true } },
          engineeringDiscipline: { select: { name: true } },
          position: { select: { title: true } },
        },
      });
      roleAtMeeting =
        user?.engineeringDiscipline?.name ??
        user?.department?.name ??
        user?.position?.title ??
        null;
      email = user?.email ?? undefined;
    }

    const row = await this.prisma.meetingAttendee.create({
      data: {
        meetingId,
        userId: attendeeType === 'INTERNAL' ? dto.userId : undefined,
        externalName: attendeeType === 'INTERNAL' ? undefined : dto.externalName,
        organization,
        roleAtMeeting,
        email,
        attended: dto.attended ?? false,
        createdBy: ctx.userId,
      },
    });

    const [mapped] = await this.enrichAttendeeProfiles(ctx.companyId, [
      mapMeetingAttendee(row),
    ]);
    return mapped;
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
    const meeting = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, meeting, 'edit');
    await this.getAttendeeOrThrow(meetingId, attendeeId);

    const row = await this.prisma.meetingAttendee.update({
      where: { id: attendeeId },
      data: {
        externalName: dto.externalName,
        organization: dto.organization,
        roleAtMeeting: dto.roleAtMeeting,
        email: dto.email,
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
    const meeting = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, meeting, 'edit');
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
    const meeting = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, meeting, 'edit');

    if (!dto.ownerId && !dto.assignedToName?.trim()) {
      throw new BadRequestException('ownerId or assignedToName is required');
    }
    if (dto.ownerId) {
      await this.assertUserInCompany(ctx, dto.ownerId);
    }
    if (dto.designPackageId) {
      await this.assertPackageInProject(ctx, projectId, dto.designPackageId);
    }

    const row = await this.prisma.actionItem.create({
      data: {
        meetingId,
        ownerId: dto.ownerId,
        assignedToName: dto.assignedToName,
        title: dto.title?.trim() || null,
        description: dto.description,
        dueDate: parseOptionalDate(dto.dueDate),
        designPackageId: dto.designPackageId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: { linkedIssue: { select: { issueNumber: true, status: true } } },
    });

    const mapped = mapActionItem(row);
    await this.sendActionItemAssignedNotification(ctx, projectId, meeting, mapped);
    return mapped;
  }

  private async sendActionItemAssignedNotification(
    ctx: PmContext,
    projectId: string,
    meeting: { id: string; meetingNumber: string },
    item: MappedActionItem,
  ): Promise<void> {
    if (!this.notificationService || !item.ownerId) {
      return;
    }

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: item.ownerId,
          eventType: ACTION_ITEM_ASSIGNED_EVENT,
          subject: `Action item assigned - ${meeting.meetingNumber}`,
          body: `You have been assigned an action item from meeting ${meeting.meetingNumber}: ${item.description}\nDue: ${item.dueDate ?? 'No due date'}`,
          variables: {
            projectId,
            meetingId: meeting.id,
            meetingNumber: meeting.meetingNumber,
            actionItemId: item.id,
          },
          link: `/projects/${projectId}/meetings/${meeting.id}`,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Action item assigned notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
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
    const meeting = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, meeting, 'edit');
    const existing = await this.getActionItemOrThrow(meetingId, actionItemId);

    const closing = dto.status === 'CLOSED' && existing.status !== 'CLOSED';
    const reopening = dto.status && dto.status !== 'CLOSED' && existing.status === 'CLOSED';

    if (dto.ownerId) {
      await this.assertUserInCompany(ctx, dto.ownerId);
    }

    const row = await this.prisma.actionItem.update({
      where: { id: actionItemId },
      data: {
        title: dto.title !== undefined ? dto.title.trim() || null : undefined,
        description: dto.description,
        ownerId: dto.ownerId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        closedAt: closing ? new Date() : reopening ? null : undefined,
        completedBy: closing ? ctx.userId : reopening ? null : undefined,
        updatedBy: ctx.userId,
      },
      include: { linkedIssue: { select: { issueNumber: true, status: true } } },
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
    const meeting = await this.getMeetingDetailOrThrow(projectId, meetingId);
    await this.assertCanAccessMeeting(ctx, meeting, 'edit');
    await this.getActionItemOrThrow(meetingId, actionItemId);
    await this.prisma.actionItem.update({
      where: { id: actionItemId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Creates an Issue from a meeting action item and links it back.
   */
  async createIssueFromActionItem(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    actionItemId: string,
    dto?: CreateIssueFromActionItemDto,
  ): Promise<MappedIssue> {
    const meeting = await this.getMeetingDetailOrThrow(projectId, meetingId);
    const item = await this.getActionItemOrThrow(meetingId, actionItemId);
    await this.assertCanCreateIssueFromActionItem(ctx, meeting, item);

    if (item.linkedIssueId) {
      throw new BadRequestException('This action item already has a linked issue');
    }

    const designPackageId = dto?.designPackageId ?? item.designPackageId ?? undefined;
    let taskDisciplineId: string | undefined;
    if (designPackageId) {
      await this.assertPackageInProject(ctx, projectId, designPackageId);
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({ id: designPackageId, companyId: ctx.companyId }),
        select: { taskDisciplineId: true },
      });
      taskDisciplineId = pkg?.taskDisciplineId;
    }

    const issue = await this.issuesService.createIssue(ctx, projectId, {
      issueType: 'Meeting Action',
      description: item.description,
      severity: IssueSeverity.MEDIUM,
      assignedTo: item.ownerId ?? undefined,
      taskDisciplineId,
      linkedDesignPackageId: designPackageId,
      dueDate: item.dueDate ? item.dueDate.toISOString() : undefined,
      sourceEntityType: 'MEETING',
      sourceEntityId: meetingId,
    });

    await this.prisma.actionItem.update({
      where: { id: actionItemId },
      data: { linkedIssueId: issue.id, updatedBy: ctx.userId },
    });

    return issue;
  }

  private async buildListWhere(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<Prisma.MeetingWhereInput> {
    const where: Prisma.MeetingWhereInput = activeOnly({ projectId });

    const bypass = await this.disciplineScopeService.hasDisciplineScopeBypass(
      ctx,
      projectId,
    );
    if (!bypass) {
      const assignedIds = await this.disciplineScopeService.getAssignedDisciplineIds(
        ctx,
        projectId,
      );
      where.OR = [
        { taskDisciplineId: null },
        { taskDisciplineId: { in: assignedIds } },
        { createdBy: ctx.userId },
        { attendees: { some: { userId: ctx.userId } } },
      ];
    }

    if (query.status) {
      where.status = query.status as MeetingStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      const searchOr: Prisma.MeetingWhereInput[] = [
        { meetingNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
      ];
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: searchOr },
      ];
    }

    return where;
  }

  private buildMyMeetingListWhere(
    ctx: PmContext,
    query: Partial<PmListQueryDto>,
  ): Prisma.MeetingWhereInput {
    const assignedDisciplineWhere: Prisma.TaskDisciplineWhereInput = activeOnly({
      companyId: ctx.companyId,
      OR: disciplineAssigneeOr(ctx.userId),
    });

    const where: Prisma.MeetingWhereInput = activeOnly({
      project: activeOnly({ companyId: ctx.companyId }),
      OR: [
        { createdBy: ctx.userId },
        { attendees: { some: { userId: ctx.userId } } },
        { taskDiscipline: assignedDisciplineWhere },
      ],
    });

    if (query.status) {
      where.status = query.status as MeetingStatus;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { meetingNumber: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { location: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  /**
   * FK/RBAC access gate for meeting view/create/edit. Mirrors RfisService#assertCanAccessRfi.
   */
  private async assertCanAccessMeeting(
    ctx: PmContext,
    meeting: { id?: string; projectId: string; createdBy?: string },
    action: 'view' | 'create' | 'edit',
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (hasFullProjectDataAccess(roleNames)) {
      return;
    }

    const pmPerms = await this.permissionService.getUserModulePermissions(
      ctx.userId,
      ctx.companyId,
      'meetings',
    );
    if (action === 'view' && pmPerms.canView) return;
    if (action === 'create' && pmPerms.canCreate) return;
    if (action === 'edit' && pmPerms.canEdit) return;

    if (meeting.createdBy && meeting.createdBy === ctx.userId) {
      return;
    }

    if (await this.disciplineScopeService.hasDisciplineScopeBypass(ctx, meeting.projectId)) {
      return;
    }
    const assignedIds = await this.disciplineScopeService.getAssignedDisciplineIds(
      ctx,
      meeting.projectId,
    );
    if (assignedIds.length > 0) {
      return;
    }

    if (meeting.id) {
      const isAttendee = await this.prisma.meetingAttendee.findFirst({
        where: { meetingId: meeting.id, userId: ctx.userId },
        select: { id: true },
      });
      if (isAttendee) {
        return;
      }
    }

    throw new ForbiddenException('Access denied');
  }

  /**
   * Only the meeting creator, the person the action item is assigned to,
   * or a full-access role (PA/SA/PM) may create an Issue from an action item.
   */
  private async assertCanCreateIssueFromActionItem(
    ctx: PmContext,
    meeting: { createdBy: string },
    item: { ownerId: string | null },
  ): Promise<void> {
    if (meeting.createdBy === ctx.userId) {
      return;
    }
    if (item.ownerId && item.ownerId === ctx.userId) {
      return;
    }

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (hasFullProjectDataAccess(roleNames)) {
      return;
    }

    throw new ForbiddenException(
      'Only the meeting creator, the assigned person, or a project administrator can create an issue from this action item',
    );
  }

  private async assertPackageInProject(
    ctx: PmContext,
    projectId: string,
    designPackageId: string,
  ): Promise<void> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: designPackageId,
        companyId: ctx.companyId,
        taskDiscipline: { task: { projectId, deletedAt: null } },
      }),
      select: { id: true },
    });
    if (!pkg) {
      throw new NotFoundException('Subtask not found on this project');
    }
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

    const raisedItems = await this.loadMeetingRaisedItems(projectId, row.id);

    const detail = mapMeetingDetail(row, attachmentFolderId, raisedItems);
    const withOrganizer = await enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      detail,
      PM_ORGANIZER_NAME,
    );

    if (row.taskDisciplineId) {
      const discipline = await this.prisma.taskDiscipline.findFirst({
        where: { id: row.taskDisciplineId },
        select: { disciplineName: true },
      });
      withOrganizer.taskDisciplineName = discipline?.disciplineName ?? null;
    }
    if (row.designPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: { id: row.designPackageId },
        select: { packageCode: true, name: true },
      });
      withOrganizer.designPackageName = pkg
        ? `${pkg.packageCode} - ${pkg.name}`
        : null;
    }

    const [agendaItems, attendees, actionItems] = await Promise.all([
      enrichRowsWithUserDisplayNames(
        this.prisma,
        ctx.companyId,
        withOrganizer.agendaItems,
        PM_AGENDA_PRESENTER_NAME,
      ),
      enrichRowsWithUserDisplayNames(
        this.prisma,
        ctx.companyId,
        withOrganizer.attendees,
        PM_MEETING_ATTENDEE_NAMES,
      ),
      enrichRowsWithUserDisplayNames(
        this.prisma,
        ctx.companyId,
        withOrganizer.actionItems,
        PM_ACTION_ITEM_OWNER_NAME,
      ),
    ]);

    const attendeesWithProfile = await this.enrichAttendeeProfiles(
      ctx.companyId,
      attendees,
    );

    return {
      ...withOrganizer,
      agendaItems,
      attendees: attendeesWithProfile,
      actionItems,
    };
  }

  /**
   * For internal attendees, replaces the free-text organization/role fields
   * with the attendee's current department/position from their user profile.
   */
  private async enrichAttendeeProfiles<T extends { userId: string | null }>(
    companyId: string,
    attendees: T[],
  ): Promise<T[]> {
    const userIds = [
      ...new Set(
        attendees
          .map((a) => a.userId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (userIds.length === 0) {
      return attendees;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, companyId },
      select: {
        id: true,
        department: { select: { name: true } },
        engineeringDiscipline: { select: { name: true } },
        position: { select: { title: true } },
      },
    });
    const profileMap = new Map(users.map((u) => [u.id, u]));

    return attendees.map((attendee) => {
      if (!attendee.userId) {
        return attendee;
      }
      const profile = profileMap.get(attendee.userId);
      return {
        ...attendee,
        organization: 'CCECC',
        roleAtMeeting:
          profile?.engineeringDiscipline?.name ??
          profile?.department?.name ??
          profile?.position?.title ??
          null,
      };
    });
  }

  private async loadMeetingRaisedItems(
    projectId: string,
    meetingId: string,
  ): Promise<Awaited<ReturnType<typeof loadRaisedItemsForSource>>> {
    return loadRaisedItemsForSource(
      this.prisma,
      projectId,
      'MEETING',
      meetingId,
    );
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
