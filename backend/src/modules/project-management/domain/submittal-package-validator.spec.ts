import { DesignPackageProjectedStatus } from './contracts/enums/design-package-projected-status.enum';
import { EdvStatus } from './contracts/enums/edv-status.enum';
import {
  validateSubmittalPackage,
  validateSubmittalPackages,
} from './submittal-package-validator';

describe('submittal-package-validator', () => {
  const baseInput = {
    designPackageId: 'pkg-1',
    projectedStatus: DesignPackageProjectedStatus.APPROVED,
    edvStatuses: [EdvStatus.LOCKED, EdvStatus.LOCKED],
  };

  it('accepts APPROVED package with all LOCKED EDVs', () => {
    expect(validateSubmittalPackage(baseInput)).toEqual({
      eligible: true,
      designPackageId: 'pkg-1',
    });
  });

  it('accepts LOCKED package with all LOCKED EDVs', () => {
    expect(
      validateSubmittalPackage({
        ...baseInput,
        projectedStatus: DesignPackageProjectedStatus.LOCKED,
      }),
    ).toEqual({
      eligible: true,
      designPackageId: 'pkg-1',
    });
  });

  it('rejects empty package', () => {
    const result = validateSubmittalPackage({
      ...baseInput,
      edvStatuses: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('NO_ITEMS');
  });

  it('rejects non-releasable projected status', () => {
    const result = validateSubmittalPackage({
      ...baseInput,
      projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
    });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('NOT_APPROVED');
  });

  it('rejects PENDING_LEAD projected status', () => {
    const result = validateSubmittalPackage({
      ...baseInput,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
    });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('NOT_APPROVED');
  });

  it('rejects when any EDV is not LOCKED', () => {
    const result = validateSubmittalPackage({
      ...baseInput,
      edvStatuses: [EdvStatus.LOCKED, EdvStatus.APPROVED],
    });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('EDV_NOT_LOCKED');
  });

  it('validateSubmittalPackages fails on first ineligible package', () => {
    const result = validateSubmittalPackages([
      baseInput,
      {
        designPackageId: 'pkg-2',
        projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
        edvStatuses: [EdvStatus.APPROVED],
      },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.designPackageId).toBe('pkg-2');
    expect(result.code).toBe('NOT_APPROVED');
  });

  it('validateSubmittalPackages requires at least one package', () => {
    const result = validateSubmittalPackages([]);
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('NO_ITEMS');
  });
});
