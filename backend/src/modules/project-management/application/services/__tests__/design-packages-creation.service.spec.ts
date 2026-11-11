import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DesignPackage,
  DesignPackageProjectedStatus,
  ReviewTier,
} from '@prisma/client';
import {
  DesignPackageRepository,
  TaskDisciplineScopeRepository,
  TaskDisciplineReviewRoles,
} from '../../../infrastructure/repositories/epc-storage.repository';
import { PmContext } from '../../types/pm-context.type';
import { DesignPackagesService } from '../design-packages.service';
import { WorkflowEventLogService } from '../workflow-event-log.service';

describe('DesignPackagesService create (design-packages-creation)', () => {
  const projectId = 'project-1';
  const taskDisciplineId = 'discipline-1';
  const leaderUserId = 'user-lead';
  const nonLeaderUserId = 'user-designer';

  const baseDiscipline: TaskDisciplineReviewRoles = {
    id: taskDisciplineId,
    disciplineName: 'Structural',
    taskId: 'task-1',
    designerUserId: nonLeaderUserId,
    supportingDesignerUserId: null,
    ownerUserId: 'user-owner',
    reviewerUserId: 'user-reviewer',
    disciplineLeadUserId: leaderUserId,
    chiefUserId: 'user-chief',
    instituteChiefUserId: 'user-institute-chief',
  };

  const leaderCtx: PmContext = { companyId: 'company-1', userId: leaderUserId };
  const nonLeaderCtx: PmContext = {
    companyId: 'company-1',
    userId: nonLeaderUserId,
  };

  let designPackageRepository: {
    createWithBriefAttachments: jest.Mock;
    findById: jest.Mock;
  };
  let taskDisciplineScopeRepository: {
    findScoped: jest.Mock;
    findWithReviewRoles: jest.Mock;
    findSourceEntityInProject: jest.Mock;
  };
  let workflowEventLogService: { logCrud: jest.Mock };
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
    };
    taskDisciplineScopeRepository = {
      findScoped: jest.fn().mockResolvedValue({
        id: taskDisciplineId,
        disciplineName: 'Structural',
        taskId: 'task-1',
      }),
      findWithReviewRoles: jest.fn().mockResolvedValue(baseDiscipline),
      findSourceEntityInProject: jest.fn().mockResolvedValue(true),
    };
    workflowEventLogService = { logCrud: jest.fn() };
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
    const prisma = {
      projectTeam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }),
      },
      taskDiscipline: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    service = new DesignPackagesService(
      designPackageRepository as unknown as DesignPackageRepository,
      {} as never,
      taskDisciplineScopeRepository as unknown as TaskDisciplineScopeRepository,
      workflowEventLogService as unknown as WorkflowEventLogService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      taskAccessScopeService as never,
      taskAssignmentNotificationService as never,
      documentNumberService as never,
      {
        hasPermission: jest.fn().mockResolvedValue(false),
      } as never,
    );
  });

  it('1. non-member creates package → ForbiddenException', async () => {
    const prisma = (service as unknown as { prisma: { projectTeam: { findFirst: jest.Mock } } }).prisma;
    prisma.projectTeam.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.create(nonLeaderCtx, projectId, taskDisciplineId, {
        name: 'Foundation Package',
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        'You must be a project team member to create a design package.',
      ),
    );

    expect(designPackageRepository.createWithBriefAttachments).not.toHaveBeenCalled();
  });

  it('2. leader creates package → succeeds', async () => {
    const created = buildPackage();
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    const result = await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
    });

    expect(result.id).toBe('package-1');
    expect(designPackageRepository.createWithBriefAttachments).toHaveBeenCalled();
  });

  it('3. dto.requiredTiers provided → stored as provided', async () => {
    const providedTiers = [ReviewTier.DISCIPLINE_LEAD, ReviewTier.INSTITUTE_CHIEF];
    const created = buildPackage({ requiredTiers: providedTiers });
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
      requiredTiers: providedTiers,
    });

    expect(
      designPackageRepository.createWithBriefAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        packageData: expect.objectContaining({
          requiredTiers: providedTiers,
        }),
      }),
    );
  });

  it('4. dto.requiredTiers omitted → auto-computed from discipline FKs', async () => {
    const created = buildPackage();
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
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
  });

  it('5. requiredTiers without DISCIPLINE_LEAD → BadRequestException', async () => {
    await expect(
      service.create(leaderCtx, projectId, taskDisciplineId, {
        name: 'Foundation Package',
        requiredTiers: [ReviewTier.INSTITUTE_CHIEF],
      }),
    ).rejects.toThrow(
      new BadRequestException('Required tiers must include DISCIPLINE_LEAD.'),
    );

    expect(designPackageRepository.createWithBriefAttachments).not.toHaveBeenCalled();
  });

  it('6. briefDocumentIds provided → DesignPackageAttachment rows created', async () => {
    const created = buildPackage();
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
      requiredTiers: [ReviewTier.DISCIPLINE_LEAD, ReviewTier.DEPT_CHIEF],
      briefDocumentIds: ['doc-1', 'doc-2'],
    });

    expect(
      designPackageRepository.createWithBriefAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        briefAttachments: [
          {
            companyId: leaderCtx.companyId,
            documentId: 'doc-1',
            attachedBy: leaderUserId,
          },
          {
            companyId: leaderCtx.companyId,
            documentId: 'doc-2',
            attachedBy: leaderUserId,
          },
        ],
      }),
    );
  });

  it('7. sourceEntityType=RFI valid id → stored', async () => {
    const created = buildPackage({
      sourceEntityType: 'RFI',
      sourceEntityId: 'rfi-1',
    });
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
      requiredTiers: [ReviewTier.DISCIPLINE_LEAD, ReviewTier.DEPT_CHIEF],
      sourceEntityType: 'RFI',
      sourceEntityId: 'rfi-1',
    });

    expect(taskDisciplineScopeRepository.findSourceEntityInProject).toHaveBeenCalledWith(
      leaderCtx.companyId,
      projectId,
      'RFI',
      'rfi-1',
    );
    expect(
      designPackageRepository.createWithBriefAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        packageData: expect.objectContaining({
          sourceEntityType: 'RFI',
          sourceEntityId: 'rfi-1',
        }),
      }),
    );
  });

  it('8. sourceEntityType=RFI wrong project id → NotFoundException', async () => {
    taskDisciplineScopeRepository.findSourceEntityInProject.mockResolvedValue(false);

    await expect(
      service.create(leaderCtx, projectId, taskDisciplineId, {
        name: 'Foundation Package',
        requiredTiers: [ReviewTier.DISCIPLINE_LEAD, ReviewTier.DEPT_CHIEF],
        sourceEntityType: 'RFI',
        sourceEntityId: 'rfi-wrong',
      }),
    ).rejects.toThrow(
      new NotFoundException('Source entity not found in this project'),
    );

    expect(designPackageRepository.createWithBriefAttachments).not.toHaveBeenCalled();
  });

  it('9. sourceEntityType=ISSUE valid → stored', async () => {
    const created = buildPackage({
      sourceEntityType: 'ISSUE',
      sourceEntityId: 'issue-1',
    });
    designPackageRepository.createWithBriefAttachments.mockResolvedValue(created);
    designPackageRepository.findById.mockResolvedValue({ ...created, items: [] });

    await service.create(leaderCtx, projectId, taskDisciplineId, {
      name: 'Foundation Package',
      requiredTiers: [ReviewTier.DISCIPLINE_LEAD, ReviewTier.DEPT_CHIEF],
      sourceEntityType: 'ISSUE',
      sourceEntityId: 'issue-1',
    });

    expect(
      designPackageRepository.createWithBriefAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        packageData: expect.objectContaining({
          sourceEntityType: 'ISSUE',
          sourceEntityId: 'issue-1',
        }),
      }),
    );
  });

  it('10. auto-compute: designer=owner → DISCIPLINE_OWNER excluded from result', async () => {
    taskDisciplineScopeRepository.findWithReviewRoles.mockResolvedValue({
      ...baseDiscipline,
      ownerUserId: nonLeaderUserId,
    });
    const created = buildPackage({
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
});
