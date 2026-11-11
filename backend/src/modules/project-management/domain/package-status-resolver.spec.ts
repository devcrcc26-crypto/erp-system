import { EdvStatus } from './contracts/enums/edv-status.enum';
import { DesignPackageProjectedStatus } from './contracts/enums/design-package-projected-status.enum';
import {
  resolvePackageProjectedStatus,
  worstPackageStatus,
} from './package-status-resolver';

describe('package-status-resolver', () => {
  it('returns IN_PROGRESS for empty package', () => {
    expect(resolvePackageProjectedStatus({ edvStatuses: [] })).toBe(
      DesignPackageProjectedStatus.IN_PROGRESS,
    );
  });

  it('returns IN_PROGRESS when any EDV is DRAFT or IN_REVIEW', () => {
    expect(
      resolvePackageProjectedStatus({
        edvStatuses: [EdvStatus.LOCKED, EdvStatus.IN_REVIEW],
      }),
    ).toBe(DesignPackageProjectedStatus.IN_PROGRESS);
  });

  it('returns PENDING_LEAD when all EDV are APPROVED', () => {
    expect(
      resolvePackageProjectedStatus({
        edvStatuses: [EdvStatus.APPROVED, EdvStatus.APPROVED],
      }),
    ).toBe(DesignPackageProjectedStatus.PENDING_LEAD);
  });

  it('keeps IN_PROGRESS when all EDV are APPROVED but governance session is active', () => {
    expect(
      resolvePackageProjectedStatus({
        edvStatuses: [EdvStatus.APPROVED, EdvStatus.APPROVED],
        activeGovernanceSession: true,
      }),
    ).toBe(DesignPackageProjectedStatus.IN_PROGRESS);
  });

  it('returns LOCKED when all EDV are LOCKED', () => {
    expect(
      resolvePackageProjectedStatus({
        edvStatuses: [EdvStatus.LOCKED, EdvStatus.LOCKED],
      }),
    ).toBe(DesignPackageProjectedStatus.LOCKED);
  });

  it('returns APPROVED when EDVs are a mix of LOCKED and APPROVED', () => {
    expect(
      resolvePackageProjectedStatus({
        edvStatuses: [EdvStatus.LOCKED, EdvStatus.APPROVED],
      }),
    ).toBe(DesignPackageProjectedStatus.APPROVED);
  });

  it('returns REWORK_REQUIRED when rework flag set', () => {
    expect(
      resolvePackageProjectedStatus({
        edvStatuses: [EdvStatus.LOCKED],
        reworkRequired: true,
      }),
    ).toBe(DesignPackageProjectedStatus.REWORK_REQUIRED);
  });

  it('rework flag wins over all EDV LOCKED', () => {
    expect(
      resolvePackageProjectedStatus({
        edvStatuses: [EdvStatus.LOCKED, EdvStatus.LOCKED],
        reworkRequired: true,
      }),
    ).toBe(DesignPackageProjectedStatus.REWORK_REQUIRED);
  });

  describe('worstPackageStatus', () => {
    it('picks REWORK_REQUIRED over IN_PROGRESS', () => {
      expect(
        worstPackageStatus(
          DesignPackageProjectedStatus.IN_PROGRESS,
          DesignPackageProjectedStatus.REWORK_REQUIRED,
        ),
      ).toBe(DesignPackageProjectedStatus.REWORK_REQUIRED);
    });
  });
});
