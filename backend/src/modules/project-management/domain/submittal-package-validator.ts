import { DesignPackageProjectedStatus } from './contracts/enums/design-package-projected-status.enum';
import { EdvStatus } from './contracts/enums/edv-status.enum';

export interface SubmittalPackageValidationInput {
  readonly designPackageId: string;
  readonly projectedStatus: DesignPackageProjectedStatus;
  readonly edvStatuses: readonly EdvStatus[];
}

export interface SubmittalPackageValidationResult {
  readonly eligible: boolean;
  readonly designPackageId: string;
  readonly code?: 'NO_ITEMS' | 'NOT_APPROVED' | 'EDV_NOT_LOCKED';
  readonly message?: string;
}

/**
 * Validates a design package is eligible for submittal inclusion.
 * Requires projectedStatus APPROVED or LOCKED and every EDV LOCKED.
 */
export function validateSubmittalPackage(
  input: SubmittalPackageValidationInput,
): SubmittalPackageValidationResult {
  const { designPackageId, projectedStatus, edvStatuses } = input;

  if (edvStatuses.length === 0) {
    return {
      eligible: false,
      designPackageId,
      code: 'NO_ITEMS',
      message: `Design package ${designPackageId} has no EDV items`,
    };
  }

  const releasableStatuses: readonly DesignPackageProjectedStatus[] = [
    DesignPackageProjectedStatus.APPROVED,
    DesignPackageProjectedStatus.LOCKED,
  ];
  if (!releasableStatuses.includes(projectedStatus)) {
    return {
      eligible: false,
      designPackageId,
      code: 'NOT_APPROVED',
      message: `Design package ${designPackageId} must be Approved or Locked to be included in an external release`,
    };
  }

  for (const status of edvStatuses) {
    if (status !== EdvStatus.LOCKED) {
      return {
        eligible: false,
        designPackageId,
        code: 'EDV_NOT_LOCKED',
        message: `All EDVs in package ${designPackageId} must be LOCKED`,
      };
    }
  }

  return { eligible: true, designPackageId };
}

/**
 * Validates all packages in a batch - fails on first ineligible package.
 */
export function validateSubmittalPackages(
  inputs: readonly SubmittalPackageValidationInput[],
): SubmittalPackageValidationResult {
  if (inputs.length === 0) {
    return {
      eligible: false,
      designPackageId: '',
      code: 'NO_ITEMS',
      message: 'At least one design package is required',
    };
  }

  for (const input of inputs) {
    const result = validateSubmittalPackage(input);
    if (!result.eligible) {
      return result;
    }
  }

  return { eligible: true, designPackageId: inputs[0]!.designPackageId };
}
