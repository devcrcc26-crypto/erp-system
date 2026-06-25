import { NotFoundException } from '@nestjs/common';
import { DeliverableStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DeliverableService } from '../deliverable.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { DocumentNumberService } from '../document-number.service';
import { ProjectScopeService } from '../project-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('DeliverableService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const deliverableId = 'deliverable-1';

  let prisma: {
    deliverable: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    designPackage: { findFirst: jest.Mock };
  };
  let service: DeliverableService;

  beforeEach(() => {
    prisma = {
      deliverable: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      designPackage: { findFirst: jest.fn() },
    };

    service = new DeliverableService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {
        nextDeliverableNumber: jest.fn().mockResolvedValue('DLV-0001'),
      } as unknown as DocumentNumberService,
      {
        hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        getAssignedDisciplineIds: jest.fn().mockResolvedValue([]),
        assertDisciplineAccess: jest.fn().mockResolvedValue(undefined),
      } as unknown as DisciplineScopeService,
    );
  });

  it('lists deliverables with pagination', async () => {
    prisma.deliverable.findMany.mockResolvedValue([]);
    prisma.deliverable.count.mockResolvedValue(0);

    const result = await service.listDeliverables(ctx, projectId, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('creates a deliverable in PLANNED status', async () => {
    prisma.deliverable.create.mockResolvedValue({
      id: deliverableId,
      companyId: ctx.companyId,
      projectId,
      taskDisciplineId: null,
      designPackageId: null,
      engineeringDocumentId: null,
      name: 'Foundation drawings',
      status: DeliverableStatus.PLANNED,
      dueDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      taskDiscipline: null,
      designPackage: null,
    });

    const result = await service.createDeliverable(ctx, projectId, {
      name: 'Foundation drawings',
    });

    expect(prisma.deliverable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'DLV-0001 - Foundation drawings',
          status: DeliverableStatus.PLANNED,
        }),
      }),
    );
    expect(result.status).toBe('PLANNED');
  });

  it('throws NotFoundException when deliverable is missing', async () => {
    prisma.deliverable.findFirst.mockResolvedValue(null);

    await expect(
      service.getDeliverable(ctx, projectId, deliverableId),
    ).rejects.toThrow(NotFoundException);
  });
});
