import { SubmittalPreparedByRole, SubmittalPurpose } from '@prisma/client';
import { validateSubmittalPurposeRole } from './submittal-purpose-validator';

describe('submittal-purpose-validator', () => {
  it('allows legacy submittals without purpose fields', () => {
    expect(
      validateSubmittalPurposeRole({
        packageDisciplineIds: ['td-1'],
      }),
    ).toEqual({ valid: true });
  });

  it('requires discipline lead packages from one discipline', () => {
    const result = validateSubmittalPurposeRole({
      submittalPurpose: SubmittalPurpose.DISCIPLINE_SITE,
      preparedByRole: SubmittalPreparedByRole.DISCIPLINE_LEAD,
      taskDisciplineId: 'td-1',
      packageDisciplineIds: ['td-1', 'td-2'],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts deputy chief multi-discipline bundle', () => {
    const result = validateSubmittalPurposeRole({
      submittalPurpose: SubmittalPurpose.DEPUTY_FINAL,
      preparedByRole: SubmittalPreparedByRole.DEPUTY_CHIEF,
      packageDisciplineIds: ['td-1', 'td-2'],
    });
    expect(result.valid).toBe(true);
  });
});
