import {
  CorrespondenceDirection,
  CorrespondenceStatus,
  CorrespondenceType,
} from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { CorrespondenceService } from '../correspondence.service';
import { PmListQueryDto } from '../../dtos/pm.dtos';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('CorrespondenceService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const correspondenceId = 'correspondence-1';
  const listQuery = { page: 1, limit: 20 } as PmListQueryDto;

  function buildCorrespondence(
    status: CorrespondenceStatus,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: correspondenceId,
      companyId: ctx.companyId,
      projectId,
      senderUserId: ctx.userId,
      referenceNumber: 'COR-OUT-PRJ-001',
      correspondenceType: CorrespondenceType.LETTER,
      direction: CorrespondenceDirection.OUTGOING,
      subject: 'Notice of delay',
      senderName: 'Project Manager',
      recipientName: 'Client Representative',
      senderCompany: 'CCECC',
      recipientCompany: null,
      notes: null,
      correspondenceDate: new Date('2026-06-01'),
      status,
      parentId: null,
      sentAt: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
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
    correspondence: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { findMany: jest.Mock };
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: CorrespondenceService;

  beforeEach(() => {
    prisma = {
      correspondence: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'PRJ-2026-AAR',
      }),
    };

    service = new CorrespondenceService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        ensureCorrespondenceFolder: jest
          .fn()
          .mockResolvedValue({
            id: 'folder-1',
            path: '/projects/demo/correspondence/COR-OUT-PRJ-2026-AAR-001',
          }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  describe('createCorrespondence', () => {
    it('generates direction-prefixed reference numbers', async () => {
      prisma.correspondence.create.mockResolvedValue(
        buildCorrespondence(CorrespondenceStatus.DRAFT, {
          referenceNumber: 'COR-OUT-PRJ-2026-AAR-001',
        }),
      );

      await service.createCorrespondence(ctx, projectId, {
        correspondenceType: CorrespondenceType.LETTER,
        direction: CorrespondenceDirection.OUTGOING,
        subject: 'Notice of delay',
        senderName: 'Project Manager',
        recipientName: 'Client Representative',
        correspondenceDate: '2026-06-01',
      });

      expect(prisma.correspondence.count).toHaveBeenCalled();
      expect(prisma.correspondence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          referenceNumber: 'COR-OUT-PRJ-2026-AAR-001',
          direction: CorrespondenceDirection.OUTGOING,
          status: CorrespondenceStatus.DRAFT,
          companyId: ctx.companyId,
          projectId,
        }),
      });
    });

    it('auto-acknowledges incoming correspondence', async () => {
      prisma.correspondence.create.mockResolvedValue(
        buildCorrespondence(CorrespondenceStatus.ACKNOWLEDGED, {
          direction: CorrespondenceDirection.INCOMING,
          referenceNumber: 'COR-IN-PRJ-2026-AAR-001',
        }),
      );

      await service.createCorrespondence(ctx, projectId, {
        correspondenceType: CorrespondenceType.LETTER,
        direction: CorrespondenceDirection.INCOMING,
        subject: 'Client letter',
        senderName: 'Client',
        recipientName: 'CCECC',
        correspondenceDate: '2026-06-01',
      });

      expect(prisma.correspondence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          direction: CorrespondenceDirection.INCOMING,
          status: CorrespondenceStatus.ACKNOWLEDGED,
          acknowledgedBy: ctx.userId,
        }),
      });
    });
  });

  describe('markAsSent', () => {
    it('transitions DRAFT outgoing to SENT', async () => {
      prisma.correspondence.findFirst.mockResolvedValue(
        buildCorrespondence(CorrespondenceStatus.DRAFT),
      );
      prisma.correspondence.update.mockResolvedValue(
        buildCorrespondence(CorrespondenceStatus.SENT),
      );

      const result = await service.markAsSent(ctx, projectId, correspondenceId);

      expect(result.status).toBe(CorrespondenceStatus.SENT);
      expect(prisma.correspondence.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CorrespondenceStatus.SENT,
          }),
        }),
      );
    });
  });

  describe('listCorrespondence', () => {
    it('returns only active records for the project', async () => {
      prisma.correspondence.findMany.mockResolvedValue([
        buildCorrespondence(CorrespondenceStatus.DRAFT),
      ]);
      prisma.correspondence.count.mockResolvedValue(1);

      await service.listCorrespondence(ctx, projectId, listQuery);

      expect(projectScopeService.getProjectOrThrow).toHaveBeenCalledWith(
        ctx,
        projectId,
      );
      expect(prisma.correspondence.findMany).toHaveBeenCalledWith(
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
