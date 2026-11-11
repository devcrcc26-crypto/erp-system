import { SubmittalPreparedByRole, SubmittalPurpose } from '@prisma/client';

const DISCIPLINE_LEAD_PURPOSES: ReadonlySet<SubmittalPurpose> = new Set([
  SubmittalPurpose.DISCIPLINE_SITE,
  SubmittalPurpose.DISCIPLINE_CONSULTANT,
]);

const DEPUTY_CHIEF_PURPOSES: ReadonlySet<SubmittalPurpose> = new Set([
  SubmittalPurpose.DEPUTY_BID,
  SubmittalPurpose.DEPUTY_INTERIM,
  SubmittalPurpose.DEPUTY_FINAL,
]);

export interface SubmittalPurposeValidationInput {
  readonly submittalPurpose?: SubmittalPurpose;
  readonly preparedByRole?: SubmittalPreparedByRole;
  readonly taskDisciplineId?: string;
  readonly packageDisciplineIds: readonly string[];
}

export interface SubmittalPurposeValidationResult {
  readonly valid: boolean;
  readonly message?: string;
}

/**
 * Validates role-specific submittal purpose and discipline scope rules.
 */
export function validateSubmittalPurposeRole(
  input: SubmittalPurposeValidationInput,
): SubmittalPurposeValidationResult {
  const { submittalPurpose, preparedByRole, taskDisciplineId, packageDisciplineIds } =
    input;

  if (submittalPurpose === undefined && preparedByRole === undefined) {
    return { valid: true };
  }

  if (submittalPurpose === undefined || preparedByRole === undefined) {
    return {
      valid: false,
      message: 'submittalPurpose and preparedByRole must be provided together',
    };
  }

  if (preparedByRole === SubmittalPreparedByRole.DISCIPLINE_LEAD) {
    if (!DISCIPLINE_LEAD_PURPOSES.has(submittalPurpose)) {
      return {
        valid: false,
        message: 'Discipline lead submittals require DISCIPLINE_SITE or DISCIPLINE_CONSULTANT purpose',
      };
    }
    if (!taskDisciplineId) {
      return {
        valid: false,
        message: 'taskDisciplineId is required for discipline lead submittals',
      };
    }
    const uniqueDisciplines = new Set(packageDisciplineIds);
    if (
      uniqueDisciplines.size !== 1 ||
      !uniqueDisciplines.has(taskDisciplineId)
    ) {
      return {
        valid: false,
        message: 'Discipline lead submittals must include packages from a single assigned discipline',
      };
    }
    return { valid: true };
  }

  if (preparedByRole === SubmittalPreparedByRole.DEPUTY_CHIEF) {
    if (!DEPUTY_CHIEF_PURPOSES.has(submittalPurpose)) {
      return {
        valid: false,
        message: 'Deputy chief submittals require DEPUTY_BID, DEPUTY_INTERIM, or DEPUTY_FINAL purpose',
      };
    }
    return { valid: true };
  }

  return { valid: false, message: 'Unsupported preparedByRole' };
}
