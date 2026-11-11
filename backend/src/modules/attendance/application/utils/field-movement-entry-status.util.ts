import type { FieldMovementStatus } from '@prisma/client';
import {
  fieldMovementCoverageFromStatus,
  type FieldMovementCoverage,
} from './day-deduction.util';

/** Maps entry approval status to dayDeduction field-movement coverage. */
export function fieldMovementCoverageFromEntryStatus(
  status: FieldMovementStatus | null | undefined,
): FieldMovementCoverage {
  return fieldMovementCoverageFromStatus(status);
}

/**
 * Merges coverage for multiple entries on the same day (APPROVED wins over PENDING).
 */
export function mergeFieldMovementCoverage(
  current: FieldMovementCoverage,
  next: FieldMovementCoverage,
): FieldMovementCoverage {
  if (current === 'APPROVED' || next === 'APPROVED') {
    return 'APPROVED';
  }
  if (current === 'PENDING' || next === 'PENDING') {
    return 'PENDING';
  }
  return 'NONE';
}
