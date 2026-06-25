import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { EpcWorkflowAction } from '../../../domain/contracts/enums/epc-workflow-action.enum';
import { ProjectDesignPhase } from '../../../domain/contracts/enums/project-design-phase.enum';
import { EpcWorkflowRepository } from '../../../infrastructure/repositories/epc-workflow.repository';
import { PermissionResolverService } from '../permission-resolver.service';

describe('PermissionResolverService review approval grants', () => {
  const userId = 'user-1';
  const companyId = 'company-1';
  const projectId = 'project-1';
  const taskDisciplineId = 'task-discipline-1';

  let getUserModulePermissions: jest.Mock;
  let prisma: { project: { findFirst: jest.Mock } };
  let epcWorkflowRepository: {
    findProjectTeamRole: jest.Mock;
    findTaskDisciplineContext: jest.Mock;
  };
  let service: PermissionResolverService;

  const discipline = {
    id: taskDisciplineId,
    designerUserId: 'designer-1',
    reviewerUserId: userId,
    disciplineLeadUserId: null,
    chiefUserId: null,
    ownerUserId: null,
  };

  beforeEach(() => {
    getUserModulePermissions = jest.fn();
    prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          designStage: ProjectDesignPhase.DETAILED_DESIGN,
        }),
      },
    };
    epcWorkflowRepository = {
      findProjectTeamRole: jest.fn().mockResolvedValue('OTHER'),
      findTaskDisciplineContext: jest.fn().mockResolvedValue(discipline),
    };

    service = new PermissionResolverService(
      { getUserModulePermissions } as unknown as PermissionService,
      epcWorkflowRepository as unknown as EpcWorkflowRepository,
      prisma as unknown as PrismaService,
    );
  });

  it('denies review session approval when user only has schedule.canView', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_APPROVE)).toBe(false);

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

  it('leaves schedule.canView-only users without workflow mutation grants so read-only views remain available', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);

    expect(granted.size).toBe(0);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_APPROVE)).toBe(false);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE)).toBe(false);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN)).toBe(false);
    expect(granted.has(EpcWorkflowAction.REVIEW_COMMENT_VERIFY)).toBe(false);
    // Read-only workflow event/snapshot endpoints rely on schedule.canView, not action grants.
  });
});
