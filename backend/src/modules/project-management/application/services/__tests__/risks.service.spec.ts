import { RiskCategory, RiskStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
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
    riskIdCode: 'RSK-PRJ-001',
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
    residualLikelihood: null,
    residualImpact: null,
    residualScore: null,
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
    riskReview: { create: jest.Mock; findMany: jest.Mock };
    taskDiscipline: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let permissionService: {
    getUserRoleNames: jest.Mock;
    getUserModulePermissions: jest.Mock;
  };
  let service: RisksService;

  beforeEach(() => {
    prisma = {
      risk: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      riskReview: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      taskDiscipline: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: ownerId }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'PRJ',
      }),
    };

    // Full-access role by default so tests exercise the score/status logic
    // rather than the permission gate.
    permissionService = {
      getUserRoleNames: jest.fn().mockResolvedValue(['Project Administrator']),
      getUserModulePermissions: jest.fn().mockResolvedValue({
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
        canExport: true,
      }),
    };

    service = new RisksService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        ensureRiskFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/risks/RSK-PRJ-001' }),
      } as unknown as EngineeringDocumentFolderService,
      permissionService as unknown as PermissionService,
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

    it('numbers risks sequentially per project using the project code', async () => {
      prisma.risk.count.mockResolvedValue(2);
      prisma.risk.create.mockResolvedValue(existingRisk);

      await service.createRisk(ctx, projectId, {
        ownerId,
        title: 'Material price escalation',
        category: RiskCategory.COST,
        probability: 3,
        impact: 4,
      });

      expect(prisma.risk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ riskIdCode: 'RSK-PRJ-003' }),
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

    it('auto-transitions OPEN -> MITIGATED when a residual assessment is first recorded', async () => {
      prisma.risk.findFirst.mockResolvedValue(existingRisk);
      prisma.risk.update.mockResolvedValue({
        ...existingRisk,
        residualLikelihood: 1,
        residualImpact: 2,
        residualScore: 2,
        status: RiskStatus.MITIGATED,
      });

      await service.updateRisk(ctx, projectId, riskId, {
        residualLikelihood: 1,
        residualImpact: 2,
      });

      expect(prisma.risk.update).toHaveBeenCalledWith({
        where: { id: riskId },
        data: expect.objectContaining({
          residualScore: 2,
          status: RiskStatus.MITIGATED,
        }),
      });
    });

    it('rejects manually setting status to MITIGATED', async () => {
      prisma.risk.findFirst.mockResolvedValue(existingRisk);

      await expect(
        service.updateRisk(ctx, projectId, riskId, {
          status: RiskStatus.MITIGATED,
        }),
      ).rejects.toThrow();
    });

    it('rejects an invalid manual status transition', async () => {
      prisma.risk.findFirst.mockResolvedValue(existingRisk);

      await expect(
        service.updateRisk(ctx, projectId, riskId, {
          status: RiskStatus.CLOSED,
        }),
      ).rejects.toThrow();
    });

    it('logs a RiskReview entry when tracked fields change', async () => {
      prisma.risk.findFirst.mockResolvedValue(existingRisk);
      prisma.risk.update.mockResolvedValue({
        ...existingRisk,
        probability: 5,
        riskScore: 20,
      });

      await service.updateRisk(ctx, projectId, riskId, {
        probability: 5,
        reviewNotes: 'Escalated after supplier notice',
      });

      expect(prisma.riskReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          riskId,
          reviewedBy: ctx.userId,
          notes: 'Escalated after supplier notice',
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
