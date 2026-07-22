import type { SubmittalPurpose } from '@/lib/api/project-management.types';

/**
 * User-facing labels for external release purposes.
 */
export function formatExternalReleasePurpose(
  purpose: SubmittalPurpose | null | undefined,
): string {
  if (purpose === 'DISCIPLINE_SITE') {
    return 'Issued for Construction (Site)';
  }
  if (purpose === 'DISCIPLINE_CONSULTANT') {
    return 'Issued for Consultant Review';
  }
  return '-';
}
