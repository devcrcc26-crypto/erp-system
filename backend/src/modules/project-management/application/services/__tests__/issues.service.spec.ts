import { Issue, IssueSeverity, IssueStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { DocumentNumberService } from '../document-number.service';
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
      projectId,
      taskDisciplineId: null,
      raisedBy: ctx.userId,
      assignedTo: null,
      issueNumber: 'ISS-00001',
      issueType: 'Safety',
      description: 'Exposed rebar on walkway',
      location: 'Level 2',
      severity: IssueSeverity.HIGH,
      status: IssueStatus.OPEN,
      dueDate: null,
      resolvedAt: null,
      verifiedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    } as unknown as Issue;
  }

  let prisma: {
    issue: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { findFirst: jest.Mock };
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
      user: {
        findFirst: jest.fn(),
      },
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
      }),
    };

    service = new IssuesService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        getNextNumber: jest.fn().mockResolvedValue('ISS-00001'),
      } as unknown as DocumentNumberService,
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

  describe('updateIssue', () => {
    it.todo('enforces issue status transition guard');

    it.todo(
      'blocks the raiser from verifying their own issue once FIX H12 is applied',
    );
  });

  describe('listIssues', () => {
    it('returns only non-deleted issues for the project', async () => {
      prisma.issue.findMany.mockResolvedValue([buildIssue()]);
      prisma.issue.count.mockResolvedValue(1);

      await service.listIssues(ctx, projectId, listQuery);

      expect(projectScopeService.getProjectOrThrow).toHaveBeenCalledWith(
        ctx,
        projectId,
      );
      expect(prisma.issue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            deletedAt: null,
          }),
        }),
      );
      expect(prisma.issue.count).toHaveBeenCalledWith(
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
