import { ForbiddenException } from '@nestjs/common';
import {
  PunchItem,
  PunchItemSeverity,
  PunchItemStatus,
} from '@prisma/client';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { PunchItemsService } from '../punch-items.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('PunchItemsService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-raiser' };
  const projectId = 'project-1';
  const punchItemId = 'punch-1';

  function buildPunchItem(overrides: Partial<PunchItem> = {}): PunchItem {
    return {
      id: punchItemId,
      companyId: ctx.companyId,
      projectId,
      raisedBy: ctx.userId,
      assignedTo: 'user-assignee',
      punchNumber: 'PL-PRJ-001',
      title: 'Cracked tile in lobby',
      description: 'Cracked tile in lobby',
      roomOrArea: 'Lobby',
      tradeResponsible: 'Tiling',
      category: null,
      severity: PunchItemSeverity.MINOR,
      status: PunchItemStatus.ASSIGNED,
      dueDate: null,
      resolutionNote: null,
      correctedAt: null,
      verifiedAt: null,
      verifiedBy: null,
      closedAt: null,
      closedBy: null,
      taskDisciplineId: null,
      designPackageId: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    };
  }

  let prisma: {
    punchItem: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    user: { findFirst: jest.Mock };
  };
  let permissionService: { getUserRoleNames: jest.Mock };
  let service: PunchItemsService;

  beforeEach(() => {
    prisma = {
      punchItem: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findFirst: jest.fn(),
      },
    };
    permissionService = {
      getUserRoleNames: jest.fn().mockResolvedValue([]),
    };

    service = new PunchItemsService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({
          id: projectId,
          companyId: ctx.companyId,
          projectCode: 'PRJ-2026-AAR',
        }),
      } as unknown as ProjectScopeService,
      {
        ensurePunchItemFolder: jest
          .fn()
          .mockResolvedValue({
            id: 'folder-1',
            path: '/projects/demo/punch/PL-PRJ-001',
          }),
      } as unknown as EngineeringDocumentFolderService,
      permissionService as unknown as PermissionService,
    );
  });

  describe('createPunchItem', () => {
    it('sets raisedBy and generates PL- project reference', async () => {
      const created = buildPunchItem({
        punchNumber: 'PL-PRJ-2026-AAR-001',
        status: PunchItemStatus.RAISED,
        assignedTo: null,
      });
      prisma.punchItem.create.mockResolvedValue(created);

      await service.createPunchItem(ctx, projectId, {
        title: 'Cracked tile in lobby',
        description: 'Cracked tile in lobby',
        severity: PunchItemSeverity.MINOR,
      });

      expect(prisma.punchItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: ctx.companyId,
          raisedBy: ctx.userId,
          punchNumber: 'PL-PRJ-2026-AAR-001',
          status: PunchItemStatus.RAISED,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }),
      });
    });

    it('creates as ASSIGNED when assignedTo is set', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-assignee' });
      prisma.punchItem.create.mockResolvedValue(
        buildPunchItem({ status: PunchItemStatus.ASSIGNED }),
      );

      await service.createPunchItem(ctx, projectId, {
        title: 'Cracked tile in lobby',
        description: 'Cracked tile in lobby',
        severity: PunchItemSeverity.MINOR,
        assignedTo: 'user-assignee',
      });

      expect(prisma.punchItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: PunchItemStatus.ASSIGNED,
          assignedTo: 'user-assignee',
        }),
      });
    });
  });

  describe('correctPunchItem', () => {
    it('sets correctedAt and resolution note', async () => {
      const assigneeCtx: PmContext = {
        companyId: 'company-1',
        userId: 'user-assignee',
      };
      const existing = buildPunchItem();
      prisma.punchItem.findFirst.mockResolvedValue(existing);
      prisma.punchItem.update.mockResolvedValue({
        ...existing,
        status: PunchItemStatus.CORRECTED,
        correctedAt: new Date('2026-06-02T00:00:00.000Z'),
        resolutionNote: 'Replaced tile',
      });

      await service.correctPunchItem(assigneeCtx, projectId, punchItemId, {
        resolutionNote: 'Replaced tile',
      });

      expect(prisma.punchItem.update).toHaveBeenCalledWith({
        where: { id: punchItemId },
        data: expect.objectContaining({
          status: PunchItemStatus.CORRECTED,
          correctedAt: expect.any(Date),
          resolutionNote: 'Replaced tile',
        }),
      });
    });
  });

  describe('verifyPunchItem', () => {
    it('blocks assignee from verifying own fix', async () => {
      const assigneeCtx: PmContext = {
        companyId: 'company-1',
        userId: 'user-assignee',
      };
      prisma.punchItem.findFirst.mockResolvedValue(
        buildPunchItem({ status: PunchItemStatus.CORRECTED }),
      );
      permissionService.getUserRoleNames.mockResolvedValue([
        'Project Manager',
      ]);

      await expect(
        service.verifyPunchItem(assigneeCtx, projectId, punchItemId),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.punchItem.update).not.toHaveBeenCalled();
    });

    it('allows raiser to verify', async () => {
      const existing = buildPunchItem({
        status: PunchItemStatus.CORRECTED,
      });
      prisma.punchItem.findFirst.mockResolvedValue(existing);
      prisma.punchItem.update.mockResolvedValue({
        ...existing,
        status: PunchItemStatus.VERIFIED,
        verifiedAt: new Date('2026-06-03T00:00:00.000Z'),
        verifiedBy: ctx.userId,
      });

      const result = await service.verifyPunchItem(
        ctx,
        projectId,
        punchItemId,
      );

      expect(result.status).toBe(PunchItemStatus.VERIFIED);
      expect(prisma.punchItem.update).toHaveBeenCalledWith({
        where: { id: punchItemId },
        data: expect.objectContaining({
          status: PunchItemStatus.VERIFIED,
          verifiedBy: ctx.userId,
        }),
      });
    });
  });
});
