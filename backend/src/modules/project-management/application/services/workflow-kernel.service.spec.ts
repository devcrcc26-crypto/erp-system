import { ForbiddenException } from '@nestjs/common';
import { EdvStatus } from '@prisma/client';
import { WorkflowKernelService } from './workflow-kernel.service';
import { StatusWriteGateService } from './status-write-gate.service';
import { ConflictGuardService } from './conflict-guard.service';
import { PermissionResolverService } from './permission-resolver.service';
import { StateProjectionService } from './state-projection.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { EdvTransitionService } from './edv-transition.service';
import { DefinitionOfDoneService } from './definition-of-done.service';
import { EdvStatus as DomainEdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { DesignPackageProjectedStatus } from '../../domain/contracts/enums/design-package-projected-status.enum';
import { TaskDisciplineProjectedStatus } from '../../domain/contracts/enums/task-discipline-projected-status.enum';

describe('WorkflowKernelService', () => {
  const epcWorkflowRepository = {
    runPhaseAB: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    findEdvWithDiscipline: jest.fn(),
    findEdvsWithDiscipline: jest.fn(),
    findPackageWithItems: jest.fn(),
    findPackageContextByEdvId: jest.fn(),
    findIntentEventsByCorrelation: jest.fn(),
  };

  const epcReviewRepository = {
    findSessionById: jest.fn(),
    listCommentStatusesForPackageEdvs: jest.fn(),
  };

  const edvTransitionService = {
    applyInTx: jest.fn(),
  };

  const statusWriteGate = new StatusWriteGateService();
  const conflictGuard = new ConflictGuardService({
    findActiveSessionForPackage: jest.fn(),
    findActiveSessionForEdv: jest.fn(),
    findPackageDependencies: jest.fn(),
    findLockedEdvIdsForPackage: jest.fn(),
    findActiveSessionForEngineeringDocument: jest.fn(),
  } as never);
  const definitionOfDone = new DefinitionOfDoneService();
  const permissionResolver = {
    assertEdvTransitionAllowed: jest.fn(),
    assertActionAllowed: jest.fn(),
  };
  const stateProjection = {
    recomputeDirtyInTx: jest.fn(),
  };
  const reviewWorkflow = {
    submitPackageForReview: jest.fn(),
    addReviewComment: jest.fn(),
    transitionCommentStatus: jest.fn(),
    verifyReviewComment: jest.fn(),
    approveReviewSession: jest.fn(),
    returnPackageForRework: jest.fn(),
    batchReturnEdvs: jest.fn(),
  };
  const submittalWorkflow = {
    createDesignSubmittal: jest.fn(),
    issueSubmittal: jest.fn(),
    addSubmittalItems: jest.fn(),
  };
  const revisionOrchestrator = {
    triggerRevision: jest.fn(),
  };

  const workflowTransactionRunner = {
    runPhaseAB: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      epcWorkflowRepository.runPhaseAB(fn),
    ),
  };

  let kernel: WorkflowKernelService;

  beforeEach(() => {
    jest.clearAllMocks();
    kernel = new WorkflowKernelService(
      epcWorkflowRepository as never,
      epcReviewRepository as never,
      edvTransitionService as never,
      statusWriteGate,
      conflictGuard,
      definitionOfDone,
      permissionResolver as never,
      stateProjection as never,
      reviewWorkflow as never,
      submittalWorkflow as never,
      revisionOrchestrator as never,
      workflowTransactionRunner as never,
      {} as never,
    );
  });

  it('executes TransitionEdvStatus in single transaction with Phase B projection', async () => {
    epcWorkflowRepository.findEdvWithDiscipline.mockResolvedValue({
      id: 'edv-1',
      status: EdvStatus.DRAFT,
      revisionLabel: '0',
      engineeringDocument: {
        taskDiscipline: { taskId: 'task-1', id: 'td-1' },
      },
    });

    const tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ projectId: 'proj-1' }),
      },
    };

    epcWorkflowRepository.runPhaseAB.mockImplementation(async (fn) => fn(tx));

    edvTransitionService.applyInTx.mockResolvedValue([
      {
        edvId: 'edv-1',
        from: DomainEdvStatus.DRAFT,
        to: DomainEdvStatus.IN_REVIEW,
        intentEventId: 'evt-1',
      },
    ]);
    stateProjection.recomputeDirtyInTx.mockResolvedValue({
      packageStatuses: { 'pkg-1': DesignPackageProjectedStatus.IN_PROGRESS },
      disciplineStatuses: { 'td-1': TaskDisciplineProjectedStatus.IN_PROGRESS },
    });
    epcWorkflowRepository.findPackageContextByEdvId.mockResolvedValue({
      designPackageId: 'pkg-1',
      taskDisciplineId: 'td-1',
    });

    const result = await kernel.execute({
      type: 'TransitionEdvStatus',
      companyId: 'co-1',
      actorId: 'user-1',
      engineeringDocumentVersionId: 'edv-1',
      targetStatus: DomainEdvStatus.IN_REVIEW,
    });

    expect(edvTransitionService.applyInTx).toHaveBeenCalled();
    expect(stateProjection.recomputeDirtyInTx).toHaveBeenCalled();
    expect(result.packageProjectedStatus).toBe(
      DesignPackageProjectedStatus.IN_PROGRESS,
    );
  });

  it('rejects invalid transition before persist', async () => {
    epcWorkflowRepository.runPhaseAB.mockImplementation(async (fn) => fn({}));

    edvTransitionService.applyInTx.mockImplementation(() => {
      throw new ForbiddenException('invalid');
    });

    epcWorkflowRepository.findEdvWithDiscipline.mockResolvedValue({
      id: 'edv-1',
      status: EdvStatus.LOCKED,
      revisionLabel: '1',
      engineeringDocument: {
        taskDiscipline: { taskId: 'task-1', id: 'td-1' },
      },
    });

    await expect(
      kernel.execute({
        type: 'TransitionEdvStatus',
        companyId: 'co-1',
        actorId: 'user-1',
        engineeringDocumentVersionId: 'edv-1',
        targetStatus: DomainEdvStatus.DRAFT,
      }),
    ).rejects.toThrow();
  });

  it('delegates SubmitPackageForReview to review workflow', async () => {
    reviewWorkflow.submitPackageForReview.mockResolvedValue({
      commandType: 'SubmitPackageForReview',
      correlationId: 'c-1',
      affectedEdvIds: [],
      edvStatuses: {},
      intentEventIds: [],
      reviewSessionId: 'rs-1',
    });

    const result = await kernel.execute({
      type: 'SubmitPackageForReview',
      companyId: 'co-1',
      actorId: 'user-1',
      designPackageId: 'pkg-1',
      taskDisciplineId: 'td-1',
    });

    expect(reviewWorkflow.submitPackageForReview).toHaveBeenCalled();
    expect(result.reviewSessionId).toBe('rs-1');
  });

  it('delegates IssueSubmittal to submittal workflow', async () => {
    submittalWorkflow.issueSubmittal.mockResolvedValue({
      commandType: 'IssueSubmittal',
      correlationId: 'c-2',
      affectedEdvIds: ['edv-1'],
      edvStatuses: {},
      intentEventIds: [],
      submittalId: 'sub-1',
    });

    const result = await kernel.execute({
      type: 'IssueSubmittal',
      companyId: 'co-1',
      actorId: 'user-1',
      submittalId: 'sub-1',
    });

    expect(submittalWorkflow.issueSubmittal).toHaveBeenCalled();
    expect(result.submittalId).toBe('sub-1');
  });
});
