import { ForbiddenException } from '@nestjs/common';
import { EdvStatus } from '@prisma/client';
import { WorkflowKernelService } from './workflow-kernel.service';
import { StatusWriteGateService } from './status-write-gate.service';
import { ConflictGuardService } from './conflict-guard.service';
import { PermissionResolverService } from './permission-resolver.service';
import { StateProjectionService } from './state-projection.service';
import { EdvStatus as DomainEdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { DesignPackageProjectedStatus } from '../../domain/contracts/enums/design-package-projected-status.enum';
import { TaskDisciplineProjectedStatus } from '../../domain/contracts/enums/task-discipline-projected-status.enum';

describe('WorkflowKernelService', () => {
  const epcWorkflowRepository = {
    runPhaseAB: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    runPhaseA: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    findEdvWithDiscipline: jest.fn(),
    findEdvsWithDiscipline: jest.fn(),
    updateEdvStatus: jest.fn(),
    appendIntentEvent: jest.fn(),
    markPackagesProjectionPending: jest.fn(),
    findPackageWithItems: jest.fn(),
    findPackageContextByEdvId: jest.fn(),
    findIntentEventsByCorrelation: jest.fn(),
  };

  const statusWriteGate = new StatusWriteGateService();
  const conflictGuard = new ConflictGuardService();
  const permissionResolver = {
    assertEdvTransitionAllowed: jest.fn(),
  };
  const stateProjection = {
    recomputeDirtyInTx: jest.fn(),
  };

  let kernel: WorkflowKernelService;

  beforeEach(() => {
    jest.clearAllMocks();
    kernel = new WorkflowKernelService(
      epcWorkflowRepository as never,
      statusWriteGate,
      conflictGuard,
      permissionResolver as never,
      stateProjection as never,
    );
  });

  it('executes TransitionEdvStatus in single transaction with Phase B projection', async () => {
    epcWorkflowRepository.findEdvWithDiscipline
      .mockResolvedValueOnce({
        id: 'edv-1',
        status: EdvStatus.DRAFT,
        revisionLabel: '0',
        engineeringDocument: {
          taskDiscipline: { taskId: 'task-1', id: 'td-1' },
        },
      })
      .mockResolvedValueOnce({
        id: 'edv-1',
        status: EdvStatus.DRAFT,
        revisionLabel: '0',
        engineeringDocument: {
          taskDiscipline: { taskId: 'task-1', id: 'td-1', designerUserId: 'u1' },
        },
      });

    const tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ projectId: 'proj-1' }),
      },
    };

    epcWorkflowRepository.runPhaseAB.mockImplementation(async (fn) => fn(tx));

    epcWorkflowRepository.updateEdvStatus.mockResolvedValue({
      id: 'edv-1',
      status: EdvStatus.IN_REVIEW,
    });
    epcWorkflowRepository.appendIntentEvent.mockResolvedValue({ id: 'evt-1' });
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

    expect(epcWorkflowRepository.runPhaseAB).toHaveBeenCalled();
    expect(epcWorkflowRepository.updateEdvStatus).toHaveBeenCalledWith(
      tx,
      'edv-1',
      EdvStatus.IN_REVIEW,
      'user-1',
    );
    expect(epcWorkflowRepository.appendIntentEvent).toHaveBeenCalled();
    expect(epcWorkflowRepository.markPackagesProjectionPending).toHaveBeenCalled();
    expect(stateProjection.recomputeDirtyInTx).toHaveBeenCalledWith(
      tx,
      'co-1',
      'user-1',
    );
    expect(result.affectedEdvIds).toEqual(['edv-1']);
    expect(result.edvStatuses['edv-1']).toBe(DomainEdvStatus.IN_REVIEW);
    expect(result.intentEventIds).toEqual(['evt-1']);
    expect(result.packageProjectedStatus).toBe(
      DesignPackageProjectedStatus.IN_PROGRESS,
    );
    expect(result.disciplineProjectedStatus).toBe(
      TaskDisciplineProjectedStatus.IN_PROGRESS,
    );
  });

  it('rejects invalid transition before persist', async () => {
    epcWorkflowRepository.runPhaseAB.mockImplementation(async (fn) => fn({}));

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

    expect(epcWorkflowRepository.updateEdvStatus).not.toHaveBeenCalled();
    expect(stateProjection.recomputeDirtyInTx).not.toHaveBeenCalled();
  });

  it('denies when permission resolver rejects', async () => {
    const tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ projectId: 'proj-1' }),
      },
    };
    epcWorkflowRepository.runPhaseAB.mockImplementation(async (fn) => fn(tx));

    epcWorkflowRepository.findEdvWithDiscipline.mockResolvedValue({
      id: 'edv-1',
      status: EdvStatus.DRAFT,
      revisionLabel: '0',
      engineeringDocument: {
        taskDiscipline: { taskId: 'task-1', id: 'td-1' },
      },
    });

    permissionResolver.assertEdvTransitionAllowed.mockRejectedValue(
      new ForbiddenException('denied'),
    );

    await expect(
      kernel.execute({
        type: 'TransitionEdvStatus',
        companyId: 'co-1',
        actorId: 'user-1',
        engineeringDocumentVersionId: 'edv-1',
        targetStatus: DomainEdvStatus.IN_REVIEW,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(stateProjection.recomputeDirtyInTx).not.toHaveBeenCalled();
  });
});
