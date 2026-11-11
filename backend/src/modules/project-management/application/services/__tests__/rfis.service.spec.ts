import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Rfi, RfiSource, RfiStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { RfisService } from '../rfis.service';
import { PmListQueryDto } from '../../dtos/pm.dtos';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';

describe('RfisService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const rfiId = 'rfi-1';
  const packageId = 'package-1';
  const assigneeUserId = 'user-assignee';

  const listQuery = { page: 1, limit: 20 } as PmListQueryDto;

  function buildRfi(overrides: Partial<Rfi> = {}): Rfi {
    return {
      id: rfiId,
      companyId: ctx.companyId,
      projectId,
      taskDisciplineId: 'td-1',
      raisedBy: ctx.userId,
      assignedTo: null,
      rfiNumber: 'RFI-26-AAR-001-01-001-001',
      title: 'Clarification on footing depth',
      description: null,
      discipline: null,
      priority: null,
      status: RfiStatus.DRAFT,
      rfiSource: RfiSource.SITE_TEAM,
      dateRaised: new Date('2026-01-01'),
      dueDate: null,
      dateAnswered: null,
      linkedDesignPackageId: packageId,
      linkedCrId: null,
      linkedCrIds: [],
      sourceEntityType: null,
      sourceEntityId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    } as unknown as Rfi;
  }

  let prisma: {
    rfi: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    rfiResponse: { create: jest.Mock };
    designPackage: { findFirst: jest.Mock };
    projectChangeRequest: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    documentFolder: { findMany: jest.Mock; createMany: jest.Mock };
    project: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: RfisService;

  beforeEach(() => {
    prisma = {
      rfi: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      rfiResponse: {
        create: jest.fn(),
      },
      designPackage: {
        findFirst: jest.fn().mockResolvedValue({
          subtaskIndex: 1,
          designerUserId: assigneeUserId,
          taskDisciplineId: 'td-1',
          taskDiscipline: {
            disciplineIndex: 1,
            task: {
              projectId,
              overseasTaskNumber: '26-AAR-001',
            },
          },
        }),
      },
      projectChangeRequest: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          firstName: 'Wei',
          lastName: 'Chen',
          chineseName: null,
          email: 'wei@example.com',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      documentFolder: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: projectId,
          projectCode: 'DEMO-001',
          name: 'Demo Project',
        }),
      },
      $transaction: jest.fn(),
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
    };

    service = new RfisService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        assertDisciplineAccess: jest.fn().mockResolvedValue(undefined),
      } as unknown as DisciplineScopeService,
      {
        ensureRfiFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/rfis/RFI-00001' }),
        ensureProjectFolder: jest
          .fn()
          .mockResolvedValue({ id: 'project-folder-1', path: '/projects/DEMO-001' }),
      } as unknown as EngineeringDocumentFolderService,
      {
        createLinkedEntityTrigger: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
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

  describe('createRfi', () => {
    it('sets raisedBy to ctx.userId and auto-assigns designer', async () => {
      const created = buildRfi({ assignedTo: assigneeUserId });
      prisma.rfi.create.mockResolvedValue(created);

      await service.createRfi(ctx, projectId, {
        title: 'Clarification on footing depth',
        linkedDesignPackageId: packageId,
        rfiSource: RfiSource.SITE_TEAM,
      });

      expect(prisma.rfi.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          raisedBy: ctx.userId,
          assignedTo: assigneeUserId,
          companyId: ctx.companyId,
          linkedDesignPackageId: packageId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }),
      });
    });

    it('throws when subtask is not found', async () => {
      prisma.designPackage.findFirst.mockResolvedValue(null);

      await expect(
        service.createRfi(ctx, projectId, {
          title: 'Missing package',
          linkedDesignPackageId: packageId,
          rfiSource: RfiSource.SITE_TEAM,
        }),
      ).rejects.toThrow(new NotFoundException('Subtask not found'));

      expect(prisma.rfi.create).not.toHaveBeenCalled();
    });
  });

  describe('addRfiResponse', () => {
    it('auto-transitions status to ANSWERED', async () => {
      const rfi = buildRfi({
        status: RfiStatus.UNDER_REVIEW,
        assignedTo: assigneeUserId,
      });
      prisma.rfi.findFirst.mockResolvedValue(rfi);
      prisma.$transaction.mockImplementation(
        async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
      );
      prisma.rfiResponse.create.mockResolvedValue({
        id: 'response-1',
        rfiId,
        respondedBy: assigneeUserId,
        responseText: 'Use footing depth per drawing A-101.',
        respondedAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      prisma.rfi.update.mockResolvedValue({
        ...rfi,
        status: RfiStatus.ANSWERED,
      });

      await service.addRfiResponse(
        { ...ctx, userId: assigneeUserId },
        projectId,
        rfiId,
        { responseText: 'Use footing depth per drawing A-101.' },
      );

      expect(prisma.rfi.update).toHaveBeenCalledWith({
        where: { id: rfiId },
        data: expect.objectContaining({
          status: RfiStatus.ANSWERED,
          updatedBy: assigneeUserId,
        }),
      });
    });

    it('allows raiser to respond without marking ANSWERED', async () => {
      const rfi = buildRfi({
        status: RfiStatus.UNDER_REVIEW,
        assignedTo: assigneeUserId,
        raisedBy: ctx.userId,
      });
      prisma.rfi.findFirst.mockResolvedValue(rfi);
      prisma.$transaction.mockImplementation(
        async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
      );
      prisma.rfiResponse.create.mockResolvedValue({
        id: 'response-1',
        rfiId,
        respondedBy: ctx.userId,
        responseText: 'Clarifying the question',
        respondedAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });

      await service.addRfiResponse(ctx, projectId, rfiId, {
        responseText: 'Clarifying the question',
      });

      expect(prisma.rfiResponse.create).toHaveBeenCalled();
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it('rejects responses from users who are not raiser, assignee, or full-access', async () => {
      prisma.rfi.findFirst.mockResolvedValue(
        buildRfi({
          status: RfiStatus.UNDER_REVIEW,
          assignedTo: assigneeUserId,
          raisedBy: 'other-raiser',
        }),
      );
      (
        service as unknown as {
          permissionService: { getUserRoleNames: jest.Mock };
        }
      ).permissionService.getUserRoleNames.mockResolvedValue(['Employee']);

      await expect(
        service.addRfiResponse(ctx, projectId, rfiId, {
          responseText: 'Not my RFI',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateRfi', () => {
    it('throws BadRequestException for DRAFT to CLOSED', async () => {
      prisma.rfi.findFirst.mockResolvedValue(buildRfi({ status: RfiStatus.DRAFT }));

      await expect(
        service.updateRfi(ctx, projectId, rfiId, {
          status: RfiStatus.CLOSED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid RFI status transition from DRAFT to CLOSED.',
        ),
      );

      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it('allows ANSWERED to CLOSED', async () => {
      prisma.rfi.findFirst.mockResolvedValue(
        buildRfi({ status: RfiStatus.ANSWERED, assignedTo: assigneeUserId }),
      );
      prisma.rfi.update.mockResolvedValue(buildRfi({ status: RfiStatus.CLOSED }));

      const result = await service.updateRfi(ctx, projectId, rfiId, {
        status: RfiStatus.CLOSED,
      });

      expect(prisma.rfi.update).toHaveBeenCalled();
      expect(result.status).toBe(RfiStatus.CLOSED);
    });
  });

  describe('listRfis', () => {
    it('returns only non-deleted RFIs for the project', async () => {
      prisma.rfi.findMany.mockResolvedValue([buildRfi()]);
      prisma.rfi.count.mockResolvedValue(1);

      await service.listRfis(ctx, projectId, listQuery);

      expect(projectScopeService.getProjectOrThrow).toHaveBeenCalledWith(
        ctx,
        projectId,
      );
      expect(prisma.rfi.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            companyId: ctx.companyId,
            deletedAt: null,
          }),
        }),
      );
      expect(prisma.rfi.count).toHaveBeenCalledWith(
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
