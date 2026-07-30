import { ForbiddenException } from '@nestjs/common';
import { PunchItem, PunchItemSeverity, PunchItemStatus } from '@prisma/client';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { PunchItemsService } from '../punch-items.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('PunchItemsService verification guard', () => {
  const projectId = 'project-1';
  const punchItemId = 'punch-1';
  const raiserUserId = 'user-raiser';
  const assigneeUserId = 'user-assignee';

  function buildPunchItem(overrides: Partial<PunchItem> = {}): PunchItem {
    return {
      id: punchItemId,
      companyId: 'company-1',
      projectId,
      raisedBy: raiserUserId,
      assignedTo: assigneeUserId,
      punchNumber: 'PL-PRJ-001',
      title: 'Cracked tile in lobby',
      description: 'Cracked tile in lobby',
      roomOrArea: 'Lobby',
      tradeResponsible: 'Tiling',
      category: null,
      severity: PunchItemSeverity.MINOR,
      status: PunchItemStatus.CORRECTED,
      dueDate: null,
      resolutionNote: 'Fixed',
      correctedAt: new Date('2026-06-01T00:00:00.000Z'),
      verifiedAt: null,
      verifiedBy: null,
      closedAt: null,
      closedBy: null,
      taskDisciplineId: null,
      designPackageId: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      createdBy: raiserUserId,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedBy: raiserUserId,
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    };
  }

  let prisma: {
    punchItem: { findFirst: jest.Mock; update: jest.Mock };
  };
  let permissionService: { getUserRoleNames: jest.Mock };
  let service: PunchItemsService;

  beforeEach(() => {
    prisma = {
      punchItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
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
          companyId: 'company-1',
          projectCode: 'PRJ',
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

  it('allows the raiser to verify a corrected punch item', async () => {
    const ctx: PmContext = { companyId: 'company-1', userId: raiserUserId };
    const existing = buildPunchItem();
    prisma.punchItem.findFirst.mockResolvedValue(existing);
    prisma.punchItem.update.mockResolvedValue({
      ...existing,
      status: PunchItemStatus.VERIFIED,
      verifiedAt: new Date('2026-06-02T00:00:00.000Z'),
      verifiedBy: raiserUserId,
    });

    const result = await service.verifyPunchItem(ctx, projectId, punchItemId);

    expect(prisma.punchItem.update).toHaveBeenCalled();
    expect(result.status).toBe(PunchItemStatus.VERIFIED);
  });

  it('throws ForbiddenException when the assignee tries to verify their own fix', async () => {
    const ctx: PmContext = { companyId: 'company-1', userId: assigneeUserId };
    prisma.punchItem.findFirst.mockResolvedValue(buildPunchItem());
    permissionService.getUserRoleNames.mockResolvedValue(['Project Manager']);

    await expect(
      service.verifyPunchItem(ctx, projectId, punchItemId),
    ).rejects.toThrow(
      new ForbiddenException(
        'The person who corrected the item cannot verify their own fix.',
      ),
    );

    expect(prisma.punchItem.update).not.toHaveBeenCalled();
  });
});
