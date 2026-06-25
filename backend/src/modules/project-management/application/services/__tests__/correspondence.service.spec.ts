import { CorrespondenceStatus, CorrespondenceType } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentNumberService } from '../document-number.service';
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

  function buildCorrespondence(status: CorrespondenceStatus) {
    return {
      id: correspondenceId,
      projectId,
      senderUserId: ctx.userId,
      referenceNumber: 'COR-00001',
      correspondenceType: CorrespondenceType.LETTER,
      subject: 'Notice of delay',
      senderName: 'Project Manager',
      recipientName: 'Client Representative',
      correspondenceDate: new Date('2026-06-01'),
      status,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
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
  };
  let documentNumberService: { getNextNumber: jest.Mock };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: CorrespondenceService;

  beforeEach(() => {
    prisma = {
      correspondence: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    documentNumberService = {
      getNextNumber: jest.fn().mockResolvedValue('COR-00001'),
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
      }),
    };

    service = new CorrespondenceService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      documentNumberService as unknown as DocumentNumberService,
      {
        ensureCorrespondenceFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/correspondence/COR-00001' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  describe('createCorrespondence', () => {
    it('generates sequential reference number from document service', async () => {
      prisma.correspondence.create.mockResolvedValue(
        buildCorrespondence(CorrespondenceStatus.DRAFT),
      );

      await service.createCorrespondence(ctx, projectId, {
        correspondenceType: CorrespondenceType.LETTER,
        subject: 'Notice of delay',
        senderName: 'Project Manager',
        recipientName: 'Client Representative',
        correspondenceDate: '2026-06-01',
      });

      expect(documentNumberService.getNextNumber).toHaveBeenCalledWith(
        ctx,
        'CORRESPONDENCE',
      );
      expect(prisma.correspondence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          referenceNumber: 'COR-00001',
          projectId,
        }),
      });
    });
  });

  describe('updateCorrespondence', () => {
    it('advances status through DRAFT to SENT to ACKNOWLEDGED to CLOSED', async () => {
      const statuses = [
        CorrespondenceStatus.DRAFT,
        CorrespondenceStatus.SENT,
        CorrespondenceStatus.ACKNOWLEDGED,
        CorrespondenceStatus.CLOSED,
      ];

      for (let index = 1; index < statuses.length; index += 1) {
        const currentStatus = statuses[index - 1]!;
        const nextStatus = statuses[index]!;

        prisma.correspondence.findFirst.mockResolvedValue(
          buildCorrespondence(currentStatus),
        );
        prisma.correspondence.update.mockResolvedValue(
          buildCorrespondence(nextStatus),
        );

        const result = await service.updateCorrespondence(
          ctx,
          projectId,
          correspondenceId,
          { status: nextStatus },
        );

        expect(result.status).toBe(nextStatus);
      }

      expect(prisma.correspondence.update).toHaveBeenCalledTimes(3);
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
      expect(prisma.correspondence.count).toHaveBeenCalledWith(
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
