import { ConflictException } from '@nestjs/common';
import { CloseoutStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { CloseoutService } from '../closeout.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('CloseoutService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const closeoutId = 'closeout-1';
  const checklistItemId = 'checklist-1';

  let prisma: {
    closeout: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    closeoutChecklistItem: {
      findFirst: jest.Mock;
      update: jest.Mock;
      createMany: jest.Mock;
    };
    warranty: { create: jest.Mock };
    user: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: CloseoutService;

  beforeEach(() => {
    prisma = {
      closeout: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      closeoutChecklistItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
      },
      warranty: {
        create: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: ctx.userId }),
      },
      $transaction: jest.fn(),
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
      }),
    };

    service = new CloseoutService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
    );
  });

  describe('createCloseout', () => {
    it('throws ConflictException if one already exists', async () => {
      prisma.closeout.findFirst.mockResolvedValue({ id: closeoutId });

      await expect(service.createCloseout(ctx, projectId)).rejects.toThrow(
        new ConflictException('Closeout already exists for this project'),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateChecklistItem', () => {
    it('sets completedAt when isComplete is true', async () => {
      prisma.closeout.findFirst.mockResolvedValue({
        id: closeoutId,
        projectId,
        status: CloseoutStatus.PRACTICAL_COMPLETION,
      });
      prisma.closeoutChecklistItem.findFirst.mockResolvedValue({
        id: checklistItemId,
        closeoutId,
        isComplete: false,
        completedAt: null,
      });
      prisma.closeoutChecklistItem.update.mockResolvedValue({
        id: checklistItemId,
        closeoutId,
        category: 'Documentation',
        description: 'As-built drawings submitted and approved',
        isComplete: true,
        verifiedBy: ctx.userId,
        completedAt: new Date('2026-06-02T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      });

      const result = await service.updateChecklistItem(
        ctx,
        projectId,
        checklistItemId,
        { isComplete: true },
      );

      expect(prisma.closeoutChecklistItem.update).toHaveBeenCalledWith({
        where: { id: checklistItemId },
        data: expect.objectContaining({
          isComplete: true,
          completedAt: expect.any(Date),
        }),
      });
      expect(result.isComplete).toBe(true);
      expect(result.completedAt).not.toBeNull();
    });

    it('clears completedAt when isComplete is false', async () => {
      prisma.closeout.findFirst.mockResolvedValue({
        id: closeoutId,
        projectId,
        status: CloseoutStatus.PRACTICAL_COMPLETION,
      });
      prisma.closeoutChecklistItem.findFirst.mockResolvedValue({
        id: checklistItemId,
        closeoutId,
        isComplete: true,
        completedAt: new Date('2026-06-02T00:00:00.000Z'),
      });
      prisma.closeoutChecklistItem.update.mockResolvedValue({
        id: checklistItemId,
        closeoutId,
        category: 'Documentation',
        description: 'As-built drawings submitted and approved',
        isComplete: false,
        verifiedBy: null,
        completedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
        updatedAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      });

      const result = await service.updateChecklistItem(
        ctx,
        projectId,
        checklistItemId,
        { isComplete: false },
      );

      expect(prisma.closeoutChecklistItem.update).toHaveBeenCalledWith({
        where: { id: checklistItemId },
        data: expect.objectContaining({
          isComplete: false,
          completedAt: null,
          verifiedBy: null,
        }),
      });
      expect(result.completedAt).toBeNull();
    });
  });

  describe('addWarranty', () => {
    it('creates warranty linked to the project closeout', async () => {
      prisma.closeout.findFirst.mockResolvedValue({
        id: closeoutId,
        projectId,
        status: CloseoutStatus.PRACTICAL_COMPLETION,
      });
      prisma.warranty.create.mockResolvedValue({
        id: 'warranty-1',
        closeoutId,
        itemDescription: 'HVAC system',
        supplier: 'CoolAir Ltd',
        startDate: new Date('2026-06-01'),
        expiryDate: new Date('2028-06-01'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      });

      const result = await service.addWarranty(ctx, projectId, {
        itemDescription: 'HVAC system',
        supplier: 'CoolAir Ltd',
        startDate: '2026-06-01',
        expiryDate: '2028-06-01',
      });

      expect(prisma.closeout.findFirst).toHaveBeenCalledWith({
        where: {
          projectId,
          deletedAt: null,
          project: { companyId: ctx.companyId, deletedAt: null },
        },
      });
      expect(prisma.warranty.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          closeoutId,
          itemDescription: 'HVAC system',
        }),
      });
      expect(result.itemDescription).toBe('HVAC system');
    });
  });
});
