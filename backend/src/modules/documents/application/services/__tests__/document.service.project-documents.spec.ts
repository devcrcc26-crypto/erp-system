import { NotFoundException } from '@nestjs/common';
import { FolderContextType } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ProjectDocumentListQueryDto } from '../../dtos/document.dtos';
import { DocumentService } from '../document.service';

describe('DocumentService.listProjectDocuments', () => {
  const ctx = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const baseQuery = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  } as ProjectDocumentListQueryDto;

  let prisma: {
    project: { findFirst: jest.Mock };
    documentFolder: { findFirst: jest.Mock; findMany: jest.Mock };
    document: { findMany: jest.Mock; count: jest.Mock };
  };
  let service: DocumentService;

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn() },
      documentFolder: { findFirst: jest.fn(), findMany: jest.fn() },
      document: { findMany: jest.fn(), count: jest.fn() },
    };

    service = new DocumentService(
      prisma as unknown as PrismaService,
      {
        upload: jest.fn(),
        delete: jest.fn(),
        getSignedUrl: jest.fn(),
      } as never,
      { assertCanUpload: jest.fn() } as never,
    );
  });

  it('returns empty results when the project folder tree does not exist', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: projectId });
    prisma.documentFolder.findFirst.mockResolvedValue(null);

    const result = await service.listProjectDocuments(ctx, projectId, baseQuery);

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('searches across file name, folder path, and engineering metadata', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: projectId });
    prisma.documentFolder.findFirst.mockResolvedValue({
      id: 'folder-project',
      path: '/projects/DEMO-001',
    });
    prisma.documentFolder.findMany.mockResolvedValue([
      {
        id: 'folder-rfi',
        name: 'RFI-00012',
        path: '/projects/DEMO-001/rfis/RFI-00012',
        contextType: FolderContextType.RFI,
        contextId: 'rfi-1',
      },
    ]);
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        folderId: 'folder-rfi',
        companyId: ctx.companyId,
        name: 'waterproofing-detail.pdf',
        fileType: 'application/pdf',
        fileSizeBytes: 1024,
        version: 1,
        isCurrent: true,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        folder: {
          id: 'folder-rfi',
          name: 'RFI-00012',
          path: '/projects/DEMO-001/rfis/RFI-00012',
          contextType: FolderContextType.RFI,
          contextId: 'rfi-1',
        },
        versions: [],
      },
    ]);
    prisma.document.count.mockResolvedValue(1);

    const result = await service.listProjectDocuments(ctx, projectId, {
      ...baseQuery,
      search: 'waterproofing',
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              name: expect.objectContaining({ contains: 'waterproofing' }),
            }),
          ]),
        }),
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        displayTitle: 'waterproofing-detail.pdf',
        folderContextType: 'RFI',
      }),
    );
  });

  it('throws when the project is outside the tenant', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.listProjectDocuments(ctx, projectId, baseQuery),
    ).rejects.toThrow(NotFoundException);
  });
});
