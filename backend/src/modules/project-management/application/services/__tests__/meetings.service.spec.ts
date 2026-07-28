import { MeetingType } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { IssuesService } from '../issues.service';
import { MeetingsService } from '../meetings.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('MeetingsService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const ownerId = 'owner-1';
  const projectId = 'project-1';
  const meetingId = 'meeting-1';

  const meetingDetailInclude = {
    agendaItems: [],
    attendees: [],
    actionItems: [],
  };

  function buildMeeting() {
    return {
      id: meetingId,
      projectId,
      organizerId: ctx.userId,
      meetingNumber: 'MET-00001',
      meetingType: MeetingType.PROGRESS,
      title: 'Weekly progress review',
      meetingDate: new Date('2026-06-01T10:00:00.000Z'),
      location: 'Site office',
      status: 'SCHEDULED',
      minutesIssuedAt: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      ...meetingDetailInclude,
    };
  }

  let prisma: {
    meeting: { findFirst: jest.Mock; create: jest.Mock; count: jest.Mock };
    meetingAgendaItem: { create: jest.Mock; aggregate: jest.Mock };
    meetingAttendee: { create: jest.Mock };
    actionItem: { create: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: MeetingsService;

  beforeEach(() => {
    prisma = {
      meeting: {
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      meetingAgendaItem: {
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { itemOrder: 0 } }),
      },
      meetingAttendee: {
        create: jest.fn(),
      },
      actionItem: {
        create: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: ownerId }),
      },
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'PRJ',
      }),
    };

    service = new MeetingsService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        ensureMeetingFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/meetings/MET-00001' }),
      } as unknown as EngineeringDocumentFolderService,
      {
        getUserRoleNames: jest.fn().mockResolvedValue([]),
        getUserModulePermissions: jest.fn().mockResolvedValue({
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        }),
      } as unknown as PermissionService,
      {
        hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        getAssignedDisciplineIds: jest.fn().mockResolvedValue([]),
      } as unknown as DisciplineScopeService,
      {
        createIssue: jest.fn(),
      } as unknown as IssuesService,
    );
  });

  describe('createMeeting', () => {
    it('scopes creation to the project and company context', async () => {
      prisma.meeting.create.mockResolvedValue(buildMeeting());

      await service.createMeeting(ctx, projectId, {
        meetingType: MeetingType.PROGRESS,
        title: 'Weekly progress review',
        meetingDate: '2026-06-01T10:00:00.000Z',
        location: 'Site office',
      });

      expect(projectScopeService.getProjectOrThrow).toHaveBeenCalledWith(
        ctx,
        projectId,
      );
      expect(prisma.meeting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          organizerId: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
          meetingNumber: 'MTG-PRJ-001',
        }),
        include: expect.any(Object),
      });
    });

    it('numbers meetings sequentially per project using the project code', async () => {
      prisma.meeting.count.mockResolvedValue(4);
      prisma.meeting.create.mockResolvedValue(buildMeeting());

      await service.createMeeting(ctx, projectId, {
        meetingType: MeetingType.PROGRESS,
        title: 'Weekly progress review',
        meetingDate: '2026-06-01T10:00:00.000Z',
        location: 'Site office',
      });

      expect(prisma.meeting.count).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null },
      });
      expect(prisma.meeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ meetingNumber: 'MTG-PRJ-005' }),
        }),
      );
    });
  });

  describe('addAgendaItem', () => {
    it('links agenda item to the correct meeting', async () => {
      prisma.meeting.findFirst.mockResolvedValue(buildMeeting());
      prisma.meetingAgendaItem.create.mockResolvedValue({
        id: 'agenda-1',
        meetingId,
        presenterId: null,
        itemOrder: 1,
        topic: 'Schedule review',
        discussionNotes: null,
        decisionsMade: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedBy: ctx.userId,
      });

      const result = await service.addAgendaItem(ctx, projectId, meetingId, {
        topic: 'Schedule review',
      });

      expect(prisma.meetingAgendaItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          meetingId,
          topic: 'Schedule review',
        }),
      });
      expect(result.meetingId).toBe(meetingId);
    });
  });

  describe('addAttendee', () => {
    it('accepts an internal user attendee', async () => {
      prisma.meeting.findFirst.mockResolvedValue(buildMeeting());
      prisma.meetingAttendee.create.mockResolvedValue({
        id: 'attendee-1',
        meetingId,
        userId: ownerId,
        externalName: null,
        organization: 'ERP Demo',
        roleAtMeeting: 'Observer',
        attended: false,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
      });

      const result = await service.addAttendee(ctx, projectId, meetingId, {
        userId: ownerId,
        organization: 'ERP Demo',
        roleAtMeeting: 'Observer',
      });

      expect(prisma.meetingAttendee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          meetingId,
          userId: ownerId,
        }),
      });
      expect(result.userId).toBe(ownerId);
    });

    it('accepts an external attendee name', async () => {
      prisma.meeting.findFirst.mockResolvedValue(buildMeeting());
      prisma.meetingAttendee.create.mockResolvedValue({
        id: 'attendee-2',
        meetingId,
        userId: null,
        externalName: 'Jane Consultant',
        organization: 'Client PMO',
        roleAtMeeting: 'Client rep',
        attended: true,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
      });

      const result = await service.addAttendee(ctx, projectId, meetingId, {
        externalName: 'Jane Consultant',
        organization: 'Client PMO',
        roleAtMeeting: 'Client rep',
        attended: true,
      });

      expect(prisma.meetingAttendee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          meetingId,
          externalName: 'Jane Consultant',
          userId: undefined,
        }),
      });
      expect(result.externalName).toBe('Jane Consultant');
    });
  });

  describe('addActionItem', () => {
    it('creates action item with OPEN status', async () => {
      prisma.meeting.findFirst.mockResolvedValue(buildMeeting());
      prisma.actionItem.create.mockResolvedValue({
        id: 'action-1',
        meetingId,
        ownerId,
        description: 'Submit revised programme',
        dueDate: null,
        status: 'OPEN',
        closedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      });

      const result = await service.addActionItem(ctx, projectId, meetingId, {
        ownerId,
        description: 'Submit revised programme',
      });

      expect(prisma.actionItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          meetingId,
          ownerId,
          description: 'Submit revised programme',
        }),
        include: expect.any(Object),
      });
      expect(result.status).toBe('OPEN');
    });
  });
});
