import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Issue, IssueSeverity, IssueStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { IssuesService } from '../issues.service';
import { PmListQueryDto } from '../../dtos/pm.dtos';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('IssuesService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const issueId = 'issue-1';

  const listQuery = { page: 1, limit: 20 } as PmListQueryDto;

  function buildIssue(overrides: Partial<Issue> = {}): Issue {
    return {
      id: issueId,
      companyId: ctx.companyId,
      projectId,
      taskDisciplineId: null,
      raisedBy: ctx.userId,
      assignedTo: 'assignee-1',
      issueNumber: 'ISS-00001',
      issueType: 'Safety',
      description: 'Exposed rebar on walkway',
      location: 'Level 2',
      severity: IssueSeverity.HIGH,
      status: IssueStatus.OPEN,
      dueDate: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      reopenedAt: null,
      reopenedBy: null,
      linkedDesignPackageId: null,
      sourceEntityType: null,
      sourceEntityId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    } as Issue;
  }

  let prisma: {
    issue: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    issueResponse: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    designPackage: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: IssuesService;

  beforeEach(() => {
    prisma = {
      issue: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      issueResponse: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      designPackage: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((work: (client: typeof prisma) => Promise<unknown>) =>
        work(prisma),
      ),
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'PRJ',
      }),
    };

    prisma.issue.count.mockResolvedValue(0);

    service = new IssuesService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        assertDisciplineAccess: jest.fn().mockResolvedValue(undefined),
      } as unknown as DisciplineScopeService,
      {
        ensureIssueFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/issues/ISS-00001' }),
        findEntityFolder: jest.fn().mockResolvedValue(null),
      } as unknown as EngineeringDocumentFolderService,
      {} as never,
      {
        getUserRoleNames: jest
          .fn()
          .mockResolvedValue(['System Administrator']),
        getUserModulePermissions: jest.fn().mockResolvedValue({
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        }),
      } as unknown as PermissionService,
    );
  });

  describe('createIssue', () => {
    it('sets raisedBy to ctx.userId', async () => {
      const created = buildIssue();
      prisma.issue.create.mockResolvedValue(created);

      await service.createIssue(ctx, projectId, {
        issueType: 'Safety',
        description: 'Exposed rebar on walkway',
        severity: IssueSeverity.HIGH,
      });

      expect(prisma.issue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          raisedBy: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }),
      });
    });
  });

  describe('startIssue', () => {
    it('transitions OPEN → IN_PROGRESS', async () => {
      prisma.issue.findFirst.mockResolvedValue(buildIssue({ status: IssueStatus.OPEN }));
      prisma.issue.update.mockResolvedValue(
        buildIssue({ status: IssueStatus.IN_PROGRESS, assignedTo: ctx.userId }),
      );

      await service.startIssue(ctx, projectId, issueId, {});

      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: issueId },
        data: expect.objectContaining({
          status: IssueStatus.IN_PROGRESS,
        }),
      });
    });

    it('rejects start when not OPEN', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({ status: IssueStatus.IN_PROGRESS }),
      );

      await expect(service.startIssue(ctx, projectId, issueId, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('closeIssue', () => {
    it('requires a non-empty resolution note', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.IN_PROGRESS,
          raisedBy: ctx.userId,
        }),
      );

      await expect(
        service.closeIssue(ctx, projectId, issueId, { resolutionNote: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks anyone who is not the raiser (including full-access)', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.IN_PROGRESS,
          raisedBy: 'raiser-1',
          assignedTo: ctx.userId,
        }),
      );

      await expect(
        service.closeIssue(ctx, projectId, issueId, {
          resolutionNote: 'Fixed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reopenIssue', () => {
    it('adds a system response and sets reopener as the new raiser', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.CLOSED,
          raisedBy: 'original-raiser',
          assignedTo: ctx.userId,
        }),
      );
      prisma.issue.update.mockResolvedValue(
        buildIssue({
          status: IssueStatus.IN_PROGRESS,
          raisedBy: ctx.userId,
        }),
      );
      prisma.issueResponse.create.mockResolvedValue({});

      await service.reopenIssue(ctx, projectId, issueId, {
        reason: 'Still broken',
      });

      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: issueId },
        data: expect.objectContaining({
          status: IssueStatus.IN_PROGRESS,
          raisedBy: ctx.userId,
          reopenedBy: ctx.userId,
          resolutionNote: null,
          resolvedAt: null,
          resolvedBy: null,
        }),
      });
      expect(prisma.issueResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          responseText: 'Reopened: Still broken',
          respondedBy: ctx.userId,
        }),
      });
    });
  });

  describe('addIssueResponse', () => {
    function mockRoleNames(roleNames: string[]): void {
      (
        service as unknown as {
          permissionService: { getUserRoleNames: jest.Mock };
        }
      ).permissionService.getUserRoleNames.mockResolvedValue(roleNames);
    }

    beforeEach(() => {
      prisma.issueResponse.create.mockResolvedValue({
        id: 'response-1',
        issueId,
        responseText: 'Response text',
        respondedBy: ctx.userId,
        responseDocumentId: null,
        respondedAt: new Date('2026-01-02T00:00:00.000Z'),
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        responseDocument: null,
      });
    });

    it('allows the assignee to respond', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: 'raiser-1',
          assignedTo: ctx.userId,
        }),
      );
      mockRoleNames(['Employee']);

      await expect(
        service.addIssueResponse(ctx, projectId, issueId, {
          responseText: 'Working on it',
        }),
      ).resolves.toBeDefined();
    });

    it('allows a full-access user (e.g. System Administrator) to respond', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: 'raiser-1',
          assignedTo: 'assignee-1',
        }),
      );
      mockRoleNames(['System Administrator']);

      await expect(
        service.addIssueResponse(ctx, projectId, issueId, {
          responseText: 'Admin note',
        }),
      ).resolves.toBeDefined();
    });

    it('allows the raiser to respond', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.IN_PROGRESS,
          raisedBy: ctx.userId,
          assignedTo: 'assignee-1',
        }),
      );
      mockRoleNames(['Employee']);

      await expect(
        service.addIssueResponse(ctx, projectId, issueId, {
          responseText: 'Looking into it',
        }),
      ).resolves.toBeDefined();
    });

    it('does not auto-transition when the raiser responds on OPEN', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: ctx.userId,
          assignedTo: 'assignee-1',
        }),
      );
      mockRoleNames(['Employee']);

      await service.addIssueResponse(ctx, projectId, issueId, {
        responseText: 'Clarifying the request',
      });

      expect(prisma.issue.update).not.toHaveBeenCalled();
    });

    it('blocks a user who is neither raiser, assignee, nor full-access', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: 'raiser-1',
          assignedTo: 'assignee-1',
        }),
      );
      mockRoleNames(['Employee']);

      await expect(
        service.addIssueResponse(ctx, projectId, issueId, {
          responseText: 'Uninvited comment',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.issueResponse.create).not.toHaveBeenCalled();
    });

    it('rejects responses on a closed issue', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.CLOSED,
          raisedBy: 'raiser-1',
          assignedTo: ctx.userId,
        }),
      );
      mockRoleNames(['Employee']);

      await expect(
        service.addIssueResponse(ctx, projectId, issueId, {
          responseText: 'Too late',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.issueResponse.create).not.toHaveBeenCalled();
    });

    it('auto-transitions OPEN to IN_PROGRESS on the assignee\'s first response', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: 'raiser-1',
          assignedTo: ctx.userId,
        }),
      );
      mockRoleNames(['Employee']);

      await service.addIssueResponse(ctx, projectId, issueId, {
        responseText: 'Working on it',
      });

      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: issueId },
        data: expect.objectContaining({
          status: IssueStatus.IN_PROGRESS,
        }),
      });
    });

    it('leaves status unchanged when responding to an IN_PROGRESS issue', async () => {
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.IN_PROGRESS,
          raisedBy: 'raiser-1',
          assignedTo: ctx.userId,
        }),
      );
      mockRoleNames(['Employee']);

      await service.addIssueResponse(ctx, projectId, issueId, {
        responseText: 'Still working on it',
      });

      expect(prisma.issue.update).not.toHaveBeenCalled();
    });

    it('notifies the raiser when the assignee responds', async () => {
      const notify = jest.fn().mockResolvedValue({ emailQueued: false });
      (service as unknown as { notificationService: unknown }).notificationService = {
        send: notify,
      };
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: 'raiser-1',
          assignedTo: ctx.userId,
        }),
      );
      prisma.user.findFirst.mockResolvedValue({ id: ctx.userId, name: 'Assignee' });
      mockRoleNames(['Employee']);

      await service.addIssueResponse(ctx, projectId, issueId, {
        responseText: 'Working on it',
      });

      expect(notify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'raiser-1' }),
      );
    });

    it('notifies both raiser and assignee when a full-access user responds', async () => {
      const notify = jest.fn().mockResolvedValue({ emailQueued: false });
      (service as unknown as { notificationService: unknown }).notificationService = {
        send: notify,
      };
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: 'raiser-1',
          assignedTo: 'assignee-1',
        }),
      );
      prisma.user.findFirst.mockResolvedValue({ id: ctx.userId, name: 'Admin' });
      mockRoleNames(['System Administrator']);

      await service.addIssueResponse(ctx, projectId, issueId, {
        responseText: 'Admin note',
      });

      expect(notify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'raiser-1' }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'assignee-1' }),
      );
    });

    it('notifies the assignee when the raiser responds', async () => {
      const notify = jest.fn().mockResolvedValue({ emailQueued: false });
      (service as unknown as { notificationService: unknown }).notificationService = {
        send: notify,
      };
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.IN_PROGRESS,
          raisedBy: ctx.userId,
          assignedTo: 'assignee-1',
        }),
      );
      prisma.user.findFirst.mockResolvedValue({ id: ctx.userId, name: 'Raiser' });
      mockRoleNames(['Employee']);

      await service.addIssueResponse(ctx, projectId, issueId, {
        responseText: 'Thanks, please proceed',
      });

      expect(notify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'assignee-1' }),
      );
    });

    it('skips notification when the assignee and raiser are the same person', async () => {
      const notify = jest.fn().mockResolvedValue({ emailQueued: false });
      (service as unknown as { notificationService: unknown }).notificationService = {
        send: notify,
      };
      prisma.issue.findFirst.mockResolvedValue(
        buildIssue({
          status: IssueStatus.OPEN,
          raisedBy: ctx.userId,
          assignedTo: ctx.userId,
        }),
      );
      mockRoleNames(['Employee']);

      await service.addIssueResponse(ctx, projectId, issueId, {
        responseText: 'Self note',
      });

      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('listIssues', () => {
    it('returns only non-deleted issues for the project', async () => {
      prisma.issue.findMany.mockResolvedValue([buildIssue()]);
      prisma.issue.count.mockResolvedValue(1);

      await service.listIssues(ctx, projectId, listQuery);

      expect(prisma.issue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            deletedAt: null,
          }),
        }),
      );
    });
  });
});
