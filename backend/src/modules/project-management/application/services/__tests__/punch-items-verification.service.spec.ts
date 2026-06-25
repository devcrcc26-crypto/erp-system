import { ForbiddenException } from '@nestjs/common';
import { PunchItem, PunchItemSeverity, PunchItemStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentNumberService } from '../document-number.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { PunchItemsService } from '../punch-items.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('PunchItemsService verification guard', () => {
  const projectId = 'project-1';
  const punchItemId = 'punch-1';
  const raiserUserId = 'user-raiser';
  const verifierUserId = 'user-verifier';
  const assigneeUserId = 'user-assignee';

  function buildPunchItem(overrides: Partial<PunchItem> = {}): PunchItem {
    return {
      id: punchItemId,
      projectId,
      raisedBy: raiserUserId,
      assignedTo: assigneeUserId,
      punchNumber: 'PN-001',
      description: 'Cracked tile in lobby',
      roomOrArea: 'Lobby',
      tradeResponsible: 'Tiling',
      severity: PunchItemSeverity.MINOR,
      status: PunchItemStatus.CORRECTED,
      dueDate: null,
      correctedAt: new Date('2026-06-01T00:00:00.000Z'),
      verifiedAt: null,
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
  let service: PunchItemsService;

  beforeEach(() => {
    prisma = {
      punchItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new PunchItemsService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {} as unknown as DocumentNumberService,
      {
        ensurePunchItemFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/punch/PN-001' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  it('throws ForbiddenException when the raiser tries to verify their own punch item', async () => {
    const ctx: PmContext = { companyId: 'company-1', userId: raiserUserId };
    prisma.punchItem.findFirst.mockResolvedValue(buildPunchItem());

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

  it('allows a different user to verify a punch item', async () => {
    const ctx: PmContext = { companyId: 'company-1', userId: verifierUserId };
    const existing = buildPunchItem();
    prisma.punchItem.findFirst.mockResolvedValue(existing);
    prisma.punchItem.update.mockResolvedValue({
      ...existing,
      status: PunchItemStatus.VERIFIED,
      verifiedAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedBy: verifierUserId,
    });

    const result = await service.updatePunchItem(ctx, projectId, punchItemId, {
      status: PunchItemStatus.VERIFIED,
    });

    expect(prisma.punchItem.update).toHaveBeenCalled();
    expect(result.status).toBe(PunchItemStatus.VERIFIED);
  });

  it('throws ForbiddenException when the assignee is also the raiser and tries to verify', async () => {
    const ctx: PmContext = { companyId: 'company-1', userId: raiserUserId };
    prisma.punchItem.findFirst.mockResolvedValue(
      buildPunchItem({ assignedTo: raiserUserId }),
    );

    await expect(
      service.updatePunchItem(ctx, projectId, punchItemId, {
        status: PunchItemStatus.VERIFIED,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.punchItem.update).not.toHaveBeenCalled();
  });

  it('allows the assignee to verify when they are not the raiser', async () => {
    const ctx: PmContext = { companyId: 'company-1', userId: assigneeUserId };
    const existing = buildPunchItem();
    prisma.punchItem.findFirst.mockResolvedValue(existing);
    prisma.punchItem.update.mockResolvedValue({
      ...existing,
      status: PunchItemStatus.VERIFIED,
      verifiedAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedBy: assigneeUserId,
    });

    const result = await service.updatePunchItem(ctx, projectId, punchItemId, {
      status: PunchItemStatus.VERIFIED,
    });

    expect(prisma.punchItem.update).toHaveBeenCalled();
    expect(result.status).toBe(PunchItemStatus.VERIFIED);
  });
});
