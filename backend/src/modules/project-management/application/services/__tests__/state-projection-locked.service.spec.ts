import {
  DesignPackage,
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  EdvStatus,
} from '@prisma/client';
import { DesignPackageProjectedStatus as DomainPackageStatus } from '../../../domain/contracts/enums/design-package-projected-status.enum';
import { EdvStatus as DomainEdvStatus } from '../../../domain/contracts/enums/edv-status.enum';
import { resolvePackageProjectedStatus } from '../../../domain/package-status-resolver';
import { StateProjectionService } from '../state-projection.service';

describe('state-projection-locked', () => {
  describe('resolvePackageProjectedStatus', () => {
    it('1. all EDVs LOCKED → projectedStatus = LOCKED', () => {
      expect(
        resolvePackageProjectedStatus({
          edvStatuses: [DomainEdvStatus.LOCKED, DomainEdvStatus.LOCKED],
        }),
      ).toBe(DomainPackageStatus.LOCKED);
    });

    it('2. mix LOCKED + APPROVED → projectedStatus = APPROVED', () => {
      expect(
        resolvePackageProjectedStatus({
          edvStatuses: [DomainEdvStatus.LOCKED, DomainEdvStatus.APPROVED],
        }),
      ).toBe(DomainPackageStatus.APPROVED);
    });

    it('3. all EDVs APPROVED → projectedStatus = PENDING_LEAD', () => {
      expect(
        resolvePackageProjectedStatus({
          edvStatuses: [DomainEdvStatus.APPROVED, DomainEdvStatus.APPROVED],
        }),
      ).toBe(DomainPackageStatus.PENDING_LEAD);
    });

    it('4. any EDV IN_REVIEW → projectedStatus = IN_PROGRESS', () => {
      expect(
        resolvePackageProjectedStatus({
          edvStatuses: [DomainEdvStatus.IN_REVIEW, DomainEdvStatus.LOCKED],
        }),
      ).toBe(DomainPackageStatus.IN_PROGRESS);
    });

    it('5. any EDV DRAFT → projectedStatus = IN_PROGRESS', () => {
      expect(
        resolvePackageProjectedStatus({
          edvStatuses: [DomainEdvStatus.DRAFT, DomainEdvStatus.LOCKED],
        }),
      ).toBe(DomainPackageStatus.IN_PROGRESS);
    });

    it('6. empty package → projectedStatus = IN_PROGRESS', () => {
      expect(resolvePackageProjectedStatus({ edvStatuses: [] })).toBe(
        DomainPackageStatus.IN_PROGRESS,
      );
    });
  });

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
    };

    let service: StateProjectionService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new StateProjectionService(epcWorkflowRepository as never);
    });

    it('7. projectedStatus = LOCKED does NOT set packageStatus = CLOSED', async () => {
      const dirtyPkg: DesignPackage = {
        id: 'pkg-locked',
        companyId,
        taskDisciplineId: 'td-1',
        projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
        packageStatus: DesignPackageStatus.OPEN,
        projectionPending: true,
      } as DesignPackage;

      epcWorkflowRepository.findDirtyPackages.mockResolvedValue([dirtyPkg]);
      epcWorkflowRepository.findPackageEdvStatuses.mockResolvedValue([
        EdvStatus.LOCKED,
        EdvStatus.LOCKED,
      ]);
      epcWorkflowRepository.hasActiveReviewSessionForPackage.mockResolvedValue(
        false,
      );
      epcWorkflowRepository.updatePackageProjection.mockImplementation(
        async (_tx, _id, projectedStatus, _updatedBy) => ({
          ...dirtyPkg,
          projectedStatus: projectedStatus as DesignPackageProjectedStatus,
          packageStatus: DesignPackageStatus.OPEN,
        }),
      );
      epcWorkflowRepository.findPackagesByDiscipline.mockResolvedValue([
        {
          id: 'pkg-locked',
          projectedStatus: DesignPackageProjectedStatus.LOCKED,
        },
      ]);
      epcWorkflowRepository.updateDisciplineProjection.mockResolvedValue(
        {} as never,
      );

      const result = await service.recomputeDirtyInTx(tx, companyId, updatedBy);

      expect(result.packageStatuses['pkg-locked']).toBe(DomainPackageStatus.LOCKED);
      expect(epcWorkflowRepository.updatePackageProjection).toHaveBeenCalledWith(
        tx,
        'pkg-locked',
        DomainPackageStatus.LOCKED,
        updatedBy,
        true,
      );
      const updated = await epcWorkflowRepository.updatePackageProjection.mock
        .results[0].value;
      expect(updated.packageStatus).toBe(DesignPackageStatus.OPEN);
    });
  });
});
