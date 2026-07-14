import { ReviewTier } from '@prisma/client';
import { EpcWorkflowAction } from '../../../domain/contracts/enums/epc-workflow-action.enum';
import { PermissionLayerVerdict } from '../../../domain/contracts/permission.model';
import { getEffectiveApprovalChain } from '../../../domain/approval-chain.util';
import { evaluateDisciplineAssignmentLayer } from '../../../domain/permission-context-builder';
import { computeRequiredTiers } from '../../../domain/required-tiers.util';
import {
  DesignPackage,
  DesignPackageProjectedStatus,
} from '@prisma/client';
import {
  DesignPackageRepository,
  TaskDisciplineScopeRepository,
  TaskDisciplineReviewRoles,
} from '../../../infrastructure/repositories/epc-storage.repository';
import { PmContext } from '../../types/pm-context.type';
import { DesignPackagesService } from '../design-packages.service';
import { WorkflowEventLogService } from '../workflow-event-log.service';

describe('DesignPackagesService approval chain (design-packages-chain)', () => {
  const projectId = 'project-1';
  const taskDisciplineId = 'discipline-1';
  const leaderUserId = 'user-lead';
  const designerUserId = 'user-designer';
  const disciplineOwnerUserId = 'user-owner-a';
  const subtaskDisciplineOwnerUserId = 'user-owner-b';
  const disciplineReviewerUserId = 'user-reviewer-a';
  const subtaskReviewerUserId = 'user-reviewer-b';

  const baseDiscipline: TaskDisciplineReviewRoles = {
    id: taskDisciplineId,
    disciplineName: 'Structural',
    taskId: 'task-1',
    designerUserId,
    supportingDesignerUserId: null,
    ownerUserId: disciplineOwnerUserId,
    reviewerUserId: disciplineReviewerUserId,
    disciplineLeadUserId: leaderUserId,
    chiefUserId: 'user-chief-a',
    instituteChiefUserId: 'user-institute-a',
  };

  const leaderCtx: PmContext = { companyId: 'company-1', userId: leaderUserId };

  let designPackageRepository: {
    createWithBriefAttachments: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
  };
  let taskDisciplineScopeRepository: {
    findScoped: jest.Mock;
    findWithReviewRoles: jest.Mock;
  };
  let taskAccessScopeService: {
    assertDisciplineWritable: jest.Mock;
    assertPackageReadable: jest.Mock;
    assertDisciplineReadable: jest.Mock;
    buildPackageListWhere: jest.Mock;
  };
  let taskAssignmentNotificationService: { notifySubtaskRolesAssigned: jest.Mock };
  let documentNumberService: { getNextNumber: jest.Mock };
  let service: DesignPackagesService;

  function buildPackage(overrides: Partial<DesignPackage> = {}): DesignPackage {
    return {
      id: 'package-1',
      companyId: leaderCtx.companyId,
      taskDisciplineId,
      name: 'Foundation Package',
      projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
      projectionPending: false,
      submittedAt: null,
      approvedAt: null,
      requiredTiers: [
        ReviewTier.DISCIPLINE_OWNER,
        ReviewTier.REVIEWER,
        ReviewTier.DISCIPLINE_LEAD,
        ReviewTier.DEPT_CHIEF,
        ReviewTier.INSTITUTE_CHIEF,
      ],
      designerUserId: null,
      supportingDesignerUserId: null,
      disciplineOwnerUserId: null,
      reviewerUserId: null,
      disciplinaryLeaderUserId: null,
      deptDeputyChiefUserId: null,
      instituteChiefUserId: null,
      briefText: null,
      sourceEntityType: null,
      sourceEntityId: null,
      packageStatus: 'OPEN',
      packageClosedAt: null,
      packageClosedBy: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: leaderUserId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: leaderUserId,
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    } as DesignPackage;
  }

  beforeEach(() => {
    designPackageRepository = {
      createWithBriefAttachments: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    taskDisciplineScopeRepository = {
      findScoped: jest.fn().mockResolvedValue({
        id: taskDisciplineId,
        disciplineName: 'Structural',
        taskId: 'task-1',
      }),
      findWithReviewRoles: jest.fn().mockResolvedValue(baseDiscipline),
    };
    taskAccessScopeService = {
      assertDisciplineWritable: jest.fn().mockResolvedValue(undefined),
      assertPackageReadable: jest.fn().mockResolvedValue(undefined),
      assertDisciplineReadable: jest.fn().mockResolvedValue(undefined),
      buildPackageListWhere: jest.fn().mockResolvedValue({}),
    };
    taskAssignmentNotificationService = {
      notifySubtaskRolesAssigned: jest.fn().mockResolvedValue(undefined),
    };
    documentNumberService = {
      getNextNumber: jest.fn().mockResolvedValue('SUB-0001'),
    };

    service = new DesignPackagesService(
      designPackageRepository as unknown as DesignPackageRepository,
      {} as never,
      taskDisciplineScopeRepository as unknown as TaskDisciplineScopeRepository,
      { logCrud: jest.fn() } as unknown as WorkflowEventLogService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        projectTeam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }),
        },
        taskDiscipline: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never,
      taskAccessScopeService as never,
      taskAssignmentNotificationService as never,
      documentNumberService as never,
      {
        hasPermission: jest.fn().mockResolvedValue(false),
      } as never,
    );
  });

  it('1. create with no subtask-level FKs → effective chain = discipline defaults', async () => {
    const created = buildPackage();
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
    });

    const chain = getEffectiveApprovalChain(
      {
        designerUserId: null,
        supportingDesignerUserId: null,
        disciplineOwnerUserId: null,
        reviewerUserId: null,
        disciplinaryLeaderUserId: null,
        deptDeputyChiefUserId: null,
        instituteChiefUserId: null,
      },
      baseDiscipline,
    );
    expect(chain.ownerUserId).toBe(disciplineOwnerUserId);
    expect(chain.reviewerUserId).toBe(disciplineReviewerUserId);
    expect(chain.disciplineLeadUserId).toBe(leaderUserId);
    expect(chain.chiefUserId).toBe('user-chief-a');
    expect(chain.instituteChiefUserId).toBe('user-institute-a');
  });

  it('2. create with disciplineOwnerUserId set → effectiveOwner = subtask owner', async () => {
    const created = buildPackage({ disciplineOwnerUserId: subtaskDisciplineOwnerUserId });
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
      disciplineOwnerUserId: subtaskDisciplineOwnerUserId,
    });

    const chain = getEffectiveApprovalChain(
      {
        designerUserId: null,
        supportingDesignerUserId: null,
        disciplineOwnerUserId: subtaskDisciplineOwnerUserId,
        reviewerUserId: null,
        disciplinaryLeaderUserId: null,
        deptDeputyChiefUserId: null,
        instituteChiefUserId: null,
      },
      baseDiscipline,
    );
    expect(chain.ownerUserId).toBe(subtaskDisciplineOwnerUserId);
    expect(chain.ownerUserId).not.toBe(disciplineOwnerUserId);
  });

  it('3. subtask discipline owner set → DISCIPLINE_OWNER tier check uses subtask owner', () => {
    const result = evaluateDisciplineAssignmentLayer({
      companyId: 'company-1',
      userId: subtaskDisciplineOwnerUserId,
      projectId: 'project-1',
      action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
      taskDisciplineId,
      disciplineOwnerUserId: disciplineOwnerUserId,
      disciplineReviewerUserId: disciplineReviewerUserId,
      disciplineLeadUserId: leaderUserId,
      disciplineChiefUserId: 'user-chief-a',
      disciplineInstituteChiefUserId: 'user-institute-a',
      subtaskDisciplineOwnerUserId,
      currentAssigneeUserId: subtaskDisciplineOwnerUserId,
      grantedActions: new Set([EpcWorkflowAction.REVIEW_SESSION_APPROVE]),
    });

    expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);

    const disciplineOwnerResult = evaluateDisciplineAssignmentLayer({
      companyId: 'company-1',
      userId: disciplineOwnerUserId,
      projectId: 'project-1',
      action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
      taskDisciplineId,
      disciplineOwnerUserId: disciplineOwnerUserId,
      disciplineReviewerUserId: disciplineReviewerUserId,
      disciplineLeadUserId: leaderUserId,
      disciplineChiefUserId: 'user-chief-a',
      disciplineInstituteChiefUserId: 'user-institute-a',
      subtaskDisciplineOwnerUserId,
      currentAssigneeUserId: subtaskDisciplineOwnerUserId,
      grantedActions: new Set([EpcWorkflowAction.REVIEW_SESSION_APPROVE]),
    });

    expect(disciplineOwnerResult.verdict).toBe(PermissionLayerVerdict.DENY);
  });

  it('4. disciplineOwnerUserId = designerUserId → DISCIPLINE_OWNER auto-skipped', async () => {
    const created = buildPackage({
      disciplineOwnerUserId: designerUserId,
      requiredTiers: [
        ReviewTier.REVIEWER,
        ReviewTier.DISCIPLINE_LEAD,
        ReviewTier.DEPT_CHIEF,
        ReviewTier.INSTITUTE_CHIEF,
      ],
    });
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
      disciplineOwnerUserId: designerUserId,
    });

    expect(
      designPackageRepository.createWithBriefAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        packageData: expect.objectContaining({
          requiredTiers: [
            ReviewTier.REVIEWER,
            ReviewTier.DISCIPLINE_LEAD,
            ReviewTier.DEPT_CHIEF,
            ReviewTier.INSTITUTE_CHIEF,
          ],
        }),
      }),
    );
    expect(
      designPackageRepository.createWithBriefAttachments.mock.calls[0][0]
        .packageData.requiredTiers,
    ).not.toContain(ReviewTier.DISCIPLINE_OWNER);
  });

  it('5. update deptDeputyChiefUserId → effective chain updates', async () => {
    const existing = buildPackage();
    const updatedChiefUserId = 'user-chief-b';
    designPackageRepository.findById
      .mockResolvedValueOnce({ ...existing, items: [] })
      .mockResolvedValueOnce({
        ...existing,
        deptDeputyChiefUserId: updatedChiefUserId,
        items: [],
      });
    designPackageRepository.update.mockResolvedValue(undefined);

    await service.update(leaderCtx, projectId, taskDisciplineId, existing.id, {
      deptDeputyChiefUserId: updatedChiefUserId,
    });

    const chain = getEffectiveApprovalChain(
      {
        designerUserId: null,
        supportingDesignerUserId: null,
        disciplineOwnerUserId: null,
        reviewerUserId: null,
        disciplinaryLeaderUserId: null,
        deptDeputyChiefUserId: updatedChiefUserId,
        instituteChiefUserId: null,
      },
      baseDiscipline,
    );
    expect(chain.chiefUserId).toBe(updatedChiefUserId);
    expect(designPackageRepository.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        deptDeputyChiefUser: { connect: { id: updatedChiefUserId } },
      }),
    );
  });

  it('6. all subtask role FKs set → all override discipline defaults', async () => {
    const overrides = {
      designerUserId: 'pkg-designer',
      supportingDesignerUserId: 'pkg-supporting',
      disciplineOwnerUserId: 'pkg-owner',
      reviewerUserId: 'pkg-reviewer',
      disciplinaryLeaderUserId: 'pkg-lead',
      deptDeputyChiefUserId: 'pkg-chief',
      instituteChiefUserId: 'pkg-institute',
    };
    const created = buildPackage(overrides);
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
      ...overrides,
    });

    const chain = getEffectiveApprovalChain(overrides, baseDiscipline);
    expect(chain.designerUserId).toBe('pkg-designer');
    expect(chain.supportingDesignerUserId).toBe('pkg-supporting');
    expect(chain.ownerUserId).toBe('pkg-owner');
    expect(chain.reviewerUserId).toBe('pkg-reviewer');
    expect(chain.disciplineLeadUserId).toBe('pkg-lead');
    expect(chain.chiefUserId).toBe('pkg-chief');
    expect(chain.instituteChiefUserId).toBe('pkg-institute');
  });

  it('7. REVIEWER tier permission uses subtaskReviewerUserId when set', () => {
    const result = evaluateDisciplineAssignmentLayer({
      companyId: 'company-1',
      userId: subtaskReviewerUserId,
      projectId: 'project-1',
      action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
      taskDisciplineId,
      disciplineOwnerUserId: disciplineOwnerUserId,
      disciplineReviewerUserId: disciplineReviewerUserId,
      disciplineLeadUserId: leaderUserId,
      subtaskReviewerUserId,
      currentAssigneeUserId: subtaskReviewerUserId,
      grantedActions: new Set([EpcWorkflowAction.REVIEW_SESSION_APPROVE]),
    });

    expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
  });

  it('8. REVIEWER tier falls back to discipline.reviewerUserId when subtask FK is null', () => {
    const result = evaluateDisciplineAssignmentLayer({
      companyId: 'company-1',
      userId: disciplineReviewerUserId,
      projectId: 'project-1',
      action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
      taskDisciplineId,
      disciplineOwnerUserId: disciplineOwnerUserId,
      disciplineReviewerUserId: disciplineReviewerUserId,
      disciplineLeadUserId: leaderUserId,
      currentAssigneeUserId: disciplineReviewerUserId,
      grantedActions: new Set([EpcWorkflowAction.REVIEW_SESSION_APPROVE]),
    });

    expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    expect(
      computeRequiredTiers(
        getEffectiveApprovalChain(
          {
            designerUserId: null,
            supportingDesignerUserId: null,
            disciplineOwnerUserId: null,
            reviewerUserId: null,
            disciplinaryLeaderUserId: null,
            deptDeputyChiefUserId: null,
            instituteChiefUserId: null,
          },
          { ...baseDiscipline, reviewerUserId: null },
        ),
      ),
    ).not.toContain(ReviewTier.REVIEWER);
  });
});
