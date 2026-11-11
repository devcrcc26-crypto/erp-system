import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { EdvStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { EpcWorkflowAction } from '../../../domain/contracts/enums/epc-workflow-action.enum';
import { ProjectDesignStage } from '../../../domain/contracts/enums/project-design-stage.enum';
import * as permissionContextBuilder from '../../../domain/permission-context-builder';
import { EpcWorkflowRepository } from '../../../infrastructure/repositories/epc-workflow.repository';
import { PermissionResolverService } from '../permission-resolver.service';

describe('PermissionResolverService project design phase', () => {
  const companyId = 'company-1';
  const projectId = 'project-1';
  const userId = 'user-1';
  const taskDisciplineId = 'task-discipline-1';

  let service: PermissionResolverService;
  let prisma: { project: { findFirst: jest.Mock } };
  let canPerformSpy: jest.SpyInstance;

  const schedulePermissions = {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canApprove: true,
  };

  const discipline = {
    id: taskDisciplineId,
    designerUserId: userId,
    reviewerUserId: null,
    disciplineLeadUserId: null,
    chiefUserId: null,
    ownerUserId: null,
  };

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn() },
    };

    service = new PermissionResolverService(
      {
        getUserModulePermissions: jest
          .fn()
          .mockResolvedValue(schedulePermissions),
        getUserRoleNames: jest.fn().mockResolvedValue(['Designer']),
      } as unknown as PermissionService,
      {
        findProjectTeamRole: jest.fn().mockResolvedValue('OTHER'),
        findTaskDisciplineContext: jest.fn().mockResolvedValue(discipline),
      } as unknown as EpcWorkflowRepository,
      prisma as unknown as PrismaService,
    );

    canPerformSpy = jest
      .spyOn(permissionContextBuilder, 'canPerformFromContext')
      .mockReturnValue(true);
  });

  afterEach(() => {
    canPerformSpy.mockRestore();
  });

  it('passes DETAILED_DESIGN_DD from the project record to the evaluator', async () => {
    prisma.project.findFirst.mockResolvedValue({
      designStage: 'DETAILED_DESIGN_DD',
    });

    await service.assertActionAllowed({
      companyId,
      userId,
      projectId,
      action: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
      taskDisciplineId,
    });

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, companyId, deletedAt: null },
      select: { designStage: true },
    });
    expect(canPerformSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDesignStage: ProjectDesignStage.DETAILED_DESIGN_DD,
      }),
    );
  });

  it('passes SCHEMATIC_DESIGN_SD from the project record to the evaluator', async () => {
    prisma.project.findFirst.mockResolvedValue({
      designStage: 'SCHEMATIC_DESIGN_SD',
    });

    await service.assertActionAllowed({
      companyId,
      userId,
      projectId,
      action: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
      taskDisciplineId,
    });

    expect(canPerformSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDesignStage: ProjectDesignStage.SCHEMATIC_DESIGN_SD,
      }),
    );
  });

  it('throws BadRequestException when the project design stage is missing', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.assertActionAllowed({
        companyId,
        userId,
        projectId,
        action: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
        taskDisciplineId,
      }),
    ).rejects.toThrow(
      new BadRequestException('Project design stage is not set.'),
    );

    expect(canPerformSpy).not.toHaveBeenCalled();
  });

  it('does not hardcode DETAILED_DESIGN_DD in permission resolver methods', () => {
    const source = readFileSync(
      join(__dirname, '../permission-resolver.service.ts'),
      'utf8',
    );

    expect(source).not.toMatch(
      /projectDesignStage:\s*ProjectDesignStage\.DETAILED_DESIGN_DD/,
    );
  });

  it('loads project design stage for EDV transition checks', async () => {
    prisma.project.findFirst.mockResolvedValue({
      designStage: 'SCHEMATIC_DESIGN_SD',
    });

    await service.assertEdvTransitionAllowed({
      companyId,
      userId,
      projectId,
      targetStatus: EdvStatus.IN_REVIEW,
      edv: {
        id: 'edv-1',
        status: EdvStatus.DRAFT,
        engineeringDocument: {
          taskDiscipline: discipline,
        },
      } as never,
    });

    expect(canPerformSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDesignStage: ProjectDesignStage.SCHEMATIC_DESIGN_SD,
      }),
    );
  });
});
