import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { EpcWorkflowAction } from '../../../domain/contracts/enums/epc-workflow-action.enum';
import { EpcWorkflowRepository } from '../../../infrastructure/repositories/epc-workflow.repository';
import { PermissionResolverService } from '../permission-resolver.service';

describe('PermissionResolverService review approval grants', () => {
  const userId = 'user-1';
  const companyId = 'company-1';
  const projectId = 'project-1';
  const taskDisciplineId = 'task-discipline-1';

  let getUserModulePermissions: jest.Mock;
  let getUserRoleNames: jest.Mock;
  let prisma: { project: { findFirst: jest.Mock } };
  let epcWorkflowRepository: {
    findProjectTeamRole: jest.Mock;
    findTaskDisciplineContext: jest.Mock;
    resolvePackageApprovalOverrides?: jest.Mock;
  };
  let service: PermissionResolverService;

  const disciplineAssigned = {
    id: taskDisciplineId,
    designerUserId: 'designer-1',
    supportingDesignerUserId: null,
    reviewerUserId: userId,
    disciplineLeadUserId: null,
    chiefUserId: null,
    ownerUserId: null,
    instituteChiefUserId: null,
  };

  const disciplineUnrelated = {
    ...disciplineAssigned,
    reviewerUserId: 'other-reviewer',
  };

  beforeEach(() => {
    getUserModulePermissions = jest.fn();
    getUserRoleNames = jest.fn().mockResolvedValue([]);
    prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          designStage: 'DETAILED_DESIGN_DD',
        }),
      },
    };
    epcWorkflowRepository = {
      findProjectTeamRole: jest.fn().mockResolvedValue('OTHER'),
      findTaskDisciplineContext: jest.fn().mockResolvedValue(disciplineAssigned),
    };

    service = new PermissionResolverService(
      {
        getUserModulePermissions,
        getUserRoleNames,
      } as unknown as PermissionService,
      epcWorkflowRepository as unknown as EpcWorkflowRepository,
      prisma as unknown as PrismaService,
    );
  });

  it('grants review approve actions at Layer 1 without schedule.canApprove (Layer 3 scopes)', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_APPROVE)).toBe(true);
    expect(granted.has(EpcWorkflowAction.REVIEW_COMMENT_ASSIGN)).toBe(true);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN)).toBe(true);
  });

  it('allows review session approval for FK reviewer without schedule.canApprove', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });
    epcWorkflowRepository.findTaskDisciplineContext.mockResolvedValue(
      disciplineAssigned,
    );

    await expect(
      service.assertActionAllowed({
        companyId,
        userId,
        projectId,
        action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
        taskDisciplineId,
        currentAssigneeUserId: userId,
      }),
    ).resolves.toBeUndefined();
  });

  it('denies review session approval when user is not assigned to the discipline', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });
    epcWorkflowRepository.findTaskDisciplineContext.mockResolvedValue(
      disciplineUnrelated,
    );

    await expect(
      service.assertActionAllowed({
        companyId,
        userId,
        projectId,
        action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
        taskDisciplineId,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows review session approval when user has schedule.canApprove', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: true,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_APPROVE)).toBe(true);

    await expect(
      service.assertActionAllowed({
        companyId,
        userId,
        projectId,
        action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
        taskDisciplineId,
        currentAssigneeUserId: userId,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not grant SUBMITTAL_CREATE to schedule.canView-only users', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);

    expect(granted.has(EpcWorkflowAction.SUBMITTAL_CREATE)).toBe(false);
    expect(granted.has(EpcWorkflowAction.SUBMITTAL_ISSUE)).toBe(false);
  });
});
