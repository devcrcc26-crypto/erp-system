import { RiskCategory, RiskStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentNumberService } from '../document-number.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { RisksService } from '../risks.service';
import { PmListQueryDto } from '../../dtos/pm.dtos';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('RisksService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const ownerId = 'owner-1';
  const projectId = 'project-1';
  const riskId = 'risk-1';

  const listQuery = { page: 1, limit: 20 } as PmListQueryDto;

  const existingRisk = {
    id: riskId,
    projectId,
    ownerId,
    riskIdCode: 'RISK-0001',
    title: 'Material price escalation',
    description: null,
    category: RiskCategory.COST,
    probability: 3,
    impact: 4,
    riskScore: 12,
    mitigationPlan: null,
    contingencyPlan: null,
    reviewDate: null,
    status: RiskStatus.OPEN,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: ctx.userId,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedBy: ctx.userId,
    deletedAt: null,
    deletedBy: null,
  };

  let prisma: {
    risk: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { findFirst: jest.Mock };
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: RisksService;

  beforeEach(() => {
    prisma = {
      risk: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: ownerId }),
      },
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
      }),
    };

    service = new RisksService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        nextRiskNumber: jest.fn().mockResolvedValue('RISK-0001'),
      } as unknown as DocumentNumberService,
      {
        ensureRiskFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/risks/RISK-0001' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  describe('createRisk', () => {
    it('computes and stores riskScore as probability × impact', async () => {
      prisma.risk.create.mockResolvedValue({
        ...existingRisk,
        probability: 4,
        impact: 5,
        riskScore: 20,
      });

      await service.createRisk(ctx, projectId, {
        ownerId,
        riskIdCode: 'RISK-0001',
        title: 'Material price escalation',
        category: RiskCategory.COST,
        probability: 4,
        impact: 5,
      });

      expect(prisma.risk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          probability: 4,
          impact: 5,
          riskScore: 20,
        }),
      });
    });
  });

  describe('updateRisk', () => {
    it('recalculates riskScore when probability or impact changes', async () => {
      prisma.risk.findFirst.mockResolvedValue(existingRisk);
      prisma.risk.update.mockResolvedValue({
        ...existingRisk,
        probability: 5,
        impact: 4,
        riskScore: 20,
      });

      await service.updateRisk(ctx, projectId, riskId, {
        probability: 5,
      });

      expect(prisma.risk.update).toHaveBeenCalledWith({
        where: { id: riskId },
        data: expect.objectContaining({
          probability: 5,
          riskScore: 20,
        }),
      });
    });
  });

  describe('listRisks', () => {
    it('scopes listing to the project after company tenancy check', async () => {
      prisma.risk.findMany.mockResolvedValue([existingRisk]);
      prisma.risk.count.mockResolvedValue(1);

      await service.listRisks(ctx, projectId, listQuery);

      expect(projectScopeService.getProjectOrThrow).toHaveBeenCalledWith(
        ctx,
        projectId,
      );
      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            deletedAt: null,
          }),
        }),
      );
      expect(prisma.risk.count).toHaveBeenCalledWith(
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
