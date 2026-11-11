import { FolderContextType, Rfi, RfiStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PmListQueryDto } from '../../dtos/pm.dtos';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { RfisService } from '../rfis.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('RfisService listRfis folder batching', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';

  function buildRfi(index: number): Rfi {
    return {
      id: `rfi-${index}`,
      projectId,
      taskDisciplineId: null,
      raisedBy: ctx.userId,
      assignedTo: null,
      rfiNumber: `RFI-${String(index).padStart(3, '0')}`,
      title: `RFI ${index}`,
      description: null,
      discipline: null,
      priority: null,
      status: RfiStatus.DRAFT,
      dateRaised: new Date('2026-01-01'),
      dueDate: null,
      dateAnswered: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
    } as unknown as Rfi;
  }

  let prisma: {
    rfi: { findMany: jest.Mock; count: jest.Mock };
    documentFolder: { findMany: jest.Mock; createMany: jest.Mock };
    project: { findFirst: jest.Mock };
  };
  let engineeringDocumentFolderService: {
    ensureRfiFolder: jest.Mock;
    ensureProjectFolder: jest.Mock;
  };
  let service: RfisService;

  beforeEach(() => {
    prisma = {
      rfi: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      documentFolder: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
      project: {
        findFirst: jest.fn(),
      },
    };

    engineeringDocumentFolderService = {
      ensureRfiFolder: jest.fn(),
      ensureProjectFolder: jest
        .fn()
        .mockResolvedValue({ id: 'project-folder-1', path: '/projects/DEMO-001' }),
    };

    service = new RfisService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {
        hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
      } as unknown as DisciplineScopeService,
      engineeringDocumentFolderService as unknown as EngineeringDocumentFolderService,
      {} as never,
      {
        getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
      } as never,
    );
  });

  const listQuery = { page: 1, limit: 10 } as PmListQueryDto;

  it('uses at most two document-folder round trips when listing 10 RFIs', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => buildRfi(index + 1));
    prisma.rfi.findMany.mockResolvedValue(rows);
    prisma.rfi.count.mockResolvedValue(10);
    prisma.documentFolder.findMany.mockResolvedValue([]);
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      projectCode: 'DEMO-001',
      name: 'Demo Project',
    });
    prisma.documentFolder.createMany.mockResolvedValue({ count: 10 });

    const result = await service.listRfis(ctx, projectId, listQuery);

    expect(result.data).toHaveLength(10);
    expect(result.data.every((rfi) => rfi.attachmentFolderId !== null)).toBe(true);
    expect(engineeringDocumentFolderService.ensureRfiFolder).not.toHaveBeenCalled();

    const folderRoundTrips =
      prisma.documentFolder.findMany.mock.calls.length +
      prisma.documentFolder.createMany.mock.calls.length;

    expect(folderRoundTrips).toBeLessThanOrEqual(2);
    expect(prisma.documentFolder.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.documentFolder.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: ctx.companyId,
        contextType: FolderContextType.RFI,
        contextId: { in: rows.map((row) => row.id) },
      }),
      select: { id: true, contextId: true },
    });
    expect(prisma.documentFolder.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.documentFolder.createMany.mock.calls[0]?.[0]?.data).toHaveLength(10);
  });

  it('uses one document-folder round trip when all 10 RFIs already have folders', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => buildRfi(index + 1));
    prisma.rfi.findMany.mockResolvedValue(rows);
    prisma.rfi.count.mockResolvedValue(10);
    prisma.documentFolder.findMany.mockResolvedValue(
      rows.map((row) => ({ id: `folder-${row.id}`, contextId: row.id })),
    );

    const result = await service.listRfis(ctx, projectId, listQuery);

    expect(result.data).toHaveLength(10);
    expect(result.data[0]?.attachmentFolderId).toBe('folder-rfi-1');
    expect(engineeringDocumentFolderService.ensureRfiFolder).not.toHaveBeenCalled();
    expect(prisma.documentFolder.createMany).not.toHaveBeenCalled();

    const folderRoundTrips =
      prisma.documentFolder.findMany.mock.calls.length +
      prisma.documentFolder.createMany.mock.calls.length;

    expect(folderRoundTrips).toBeLessThanOrEqual(2);
    expect(prisma.documentFolder.findMany).toHaveBeenCalledTimes(1);
  });
});
