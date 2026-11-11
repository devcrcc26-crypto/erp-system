import {
  DesignPackage,
  DesignPackageProjectedStatus,
  EdvStatus,
  TaskDisciplineProjectedStatus,
} from '@prisma/client';
import { DesignPackageProjectedStatus as DomainPackageStatus } from '../../domain/contracts/enums/design-package-projected-status.enum';
import { TaskDisciplineProjectedStatus as DomainDisciplineStatus } from '../../domain/contracts/enums/task-discipline-projected-status.enum';
import { StateProjectionService } from './state-projection.service';

describe('StateProjectionService', () => {
  const tx = {} as never;
  const companyId = 'co-1';
  const updatedBy = 'user-1';

  const epcWorkflowRepository = {
    findDirtyPackages: jest.fn(),
    findPackageEdvStatuses: jest.fn(),
    hasActiveReviewSessionForPackage: jest.fn(),
    updatePackageProjection: jest.fn(),
    findPackagesByDiscipline: jest.fn(),
    updateDisciplineProjection: jest.fn(),
    findAllPackages: jest.fn(),
    findDisciplineProjectedStatus: jest.fn(),
  };

  let service: StateProjectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StateProjectionService(epcWorkflowRepository as never);
  });

  it('recomputes dirty packages and parent disciplines via pure resolvers', async () => {
    const dirtyPkg: DesignPackage = {
      id: 'pkg-1',
      companyId,
      taskDisciplineId: 'td-1',
      projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
      projectionPending: true,
    } as DesignPackage;

    epcWorkflowRepository.findDirtyPackages.mockResolvedValue([dirtyPkg]);
    epcWorkflowRepository.findPackageEdvStatuses.mockResolvedValue([
      EdvStatus.APPROVED,
      EdvStatus.APPROVED,
    ]);
    epcWorkflowRepository.hasActiveReviewSessionForPackage.mockResolvedValue(false);
    epcWorkflowRepository.updatePackageProjection.mockResolvedValue(dirtyPkg);
    epcWorkflowRepository.findPackagesByDiscipline.mockResolvedValue([
      { id: 'pkg-1', projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD },
    ]);
    epcWorkflowRepository.updateDisciplineProjection.mockResolvedValue({} as never);

    const result = await service.recomputeDirtyInTx(tx, companyId, updatedBy);

    expect(epcWorkflowRepository.findDirtyPackages).toHaveBeenCalledWith(
      tx,
      companyId,
      undefined,
    );
    expect(epcWorkflowRepository.updatePackageProjection).toHaveBeenCalledWith(
      tx,
      'pkg-1',
      DomainPackageStatus.PENDING_LEAD,
      updatedBy,
      true,
    );
    expect(epcWorkflowRepository.updateDisciplineProjection).toHaveBeenCalledWith(
      tx,
      'td-1',
      TaskDisciplineProjectedStatus.PENDING_LEAD,
      updatedBy,
    );
    expect(result.packageStatuses['pkg-1']).toBe(
      DomainPackageStatus.PENDING_LEAD,
    );
    expect(result.disciplineStatuses['td-1']).toBe(
      DomainDisciplineStatus.PENDING_LEAD,
    );
  });

  it('clears projectionPending when updating package projection', async () => {
    const dirtyPkg: DesignPackage = {
      id: 'pkg-2',
      companyId,
      taskDisciplineId: 'td-2',
      projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
      projectionPending: true,
    } as DesignPackage;

    epcWorkflowRepository.findDirtyPackages.mockResolvedValue([dirtyPkg]);
    epcWorkflowRepository.findPackageEdvStatuses.mockResolvedValue([
      EdvStatus.LOCKED,
    ]);
    epcWorkflowRepository.hasActiveReviewSessionForPackage.mockResolvedValue(false);
    epcWorkflowRepository.updatePackageProjection.mockResolvedValue(dirtyPkg);
    epcWorkflowRepository.findPackagesByDiscipline.mockResolvedValue([
      { id: 'pkg-2', projectedStatus: DesignPackageProjectedStatus.LOCKED },
    ]);
    epcWorkflowRepository.updateDisciplineProjection.mockResolvedValue({} as never);

    await service.recomputeDirtyInTx(tx, companyId, updatedBy);

    expect(epcWorkflowRepository.updatePackageProjection).toHaveBeenCalledWith(
      tx,
      'pkg-2',
      DomainPackageStatus.LOCKED,
      updatedBy,
      true,
    );
  });

  it('returns empty maps when no dirty packages exist', async () => {
    epcWorkflowRepository.findDirtyPackages.mockResolvedValue([]);

    const result = await service.recomputeDirtyInTx(tx, companyId, updatedBy);

    expect(result.packageStatuses).toEqual({});
    expect(result.disciplineStatuses).toEqual({});
    expect(epcWorkflowRepository.updatePackageProjection).not.toHaveBeenCalled();
  });
});
