import { ForbiddenException } from '@nestjs/common';
import {
  PunchItem,
  PunchItemSeverity,
  PunchItemStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentNumberService } from '../document-number.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { PunchItemsService } from '../punch-items.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('PunchItemsService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-raiser' };
  const verifierCtx: PmContext = { companyId: 'company-1', userId: 'user-verifier' };
  const projectId = 'project-1';
  const punchItemId = 'punch-1';

  function buildPunchItem(overrides: Partial<PunchItem> = {}): PunchItem {
    return {
      id: punchItemId,
      projectId,
      raisedBy: ctx.userId,
      assignedTo: 'user-assignee',
      punchNumber: 'PN-00001',
      description: 'Cracked tile in lobby',
      roomOrArea: 'Lobby',
      tradeResponsible: 'Tiling',
      severity: PunchItemSeverity.MINOR,
      status: PunchItemStatus.ASSIGNED,
      dueDate: null,
      correctedAt: null,
      verifiedAt: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    } as unknown as PunchItem;
  }

  let prisma: {
    punchItem: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let service: PunchItemsService;

  beforeEach(() => {
    prisma = {
      punchItem: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };

    service = new PunchItemsService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {
        getNextNumber: jest.fn().mockResolvedValue('PN-00001'),
      } as unknown as DocumentNumberService,
      {
        ensurePunchItemFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/punch/PN-00001' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  describe('createPunchItem', () => {
    it('sets raisedBy to ctx.userId', async () => {
      const created = buildPunchItem();
      prisma.punchItem.create.mockResolvedValue(created);

      await service.createPunchItem(ctx, projectId, {
        description: 'Cracked tile in lobby',
        severity: PunchItemSeverity.MINOR,
      });

      expect(prisma.punchItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          raisedBy: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }),
      });
    });
  });

  describe('updatePunchItem', () => {
    it('auto-sets correctedAt when status becomes CORRECTED', async () => {
      const existing = buildPunchItem();
      prisma.punchItem.findFirst.mockResolvedValue(existing);
      prisma.punchItem.update.mockResolvedValue({
        ...existing,
        status: PunchItemStatus.CORRECTED,
        correctedAt: new Date('2026-06-02T00:00:00.000Z'),
      });

      await service.updatePunchItem(verifierCtx, projectId, punchItemId, {
        status: PunchItemStatus.CORRECTED,
      });

      expect(prisma.punchItem.update).toHaveBeenCalledWith({
        where: { id: punchItemId },
        data: expect.objectContaining({
          status: PunchItemStatus.CORRECTED,
          correctedAt: expect.any(Date),
        }),
      });
    });

    it('auto-sets verifiedAt when status becomes VERIFIED', async () => {
      const existing = buildPunchItem({ status: PunchItemStatus.CORRECTED });
      prisma.punchItem.findFirst.mockResolvedValue(existing);
      prisma.punchItem.update.mockResolvedValue({
        ...existing,
        status: PunchItemStatus.VERIFIED,
        verifiedAt: new Date('2026-06-03T00:00:00.000Z'),
      });

      await service.updatePunchItem(verifierCtx, projectId, punchItemId, {
        status: PunchItemStatus.VERIFIED,
      });

      expect(prisma.punchItem.update).toHaveBeenCalledWith({
        where: { id: punchItemId },
        data: expect.objectContaining({
          status: PunchItemStatus.VERIFIED,
          verifiedAt: expect.any(Date),
        }),
      });
    });

    it('blocks raiser from verifying own item', async () => {
      prisma.punchItem.findFirst.mockResolvedValue(
        buildPunchItem({ status: PunchItemStatus.CORRECTED }),
      );

      await expect(
        service.updatePunchItem(ctx, projectId, punchItemId, {
          status: PunchItemStatus.VERIFIED,
        }),
      ).rejects.toThrow(
        new ForbiddenException(
          'The person who raised a punch item cannot verify their own item. A second person must verify.',
        ),
      );

      expect(prisma.punchItem.update).not.toHaveBeenCalled();
    });
  });
});
