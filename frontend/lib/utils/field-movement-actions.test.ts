import { describe, expect, it } from 'vitest';
import { fieldMovementCreateActions } from './field-movement-actions';

describe('fieldMovementCreateActions', () => {
  it('admin who is not an HR participant sees "Add on behalf" but not "Add"', () => {
    expect(
      fieldMovementCreateActions({
        employeeId: null,
        excludedFromHrProcesses: true,
        eligibleEmployeeCount: 40,
      }),
    ).toEqual({ canAddSelf: false, canAddOnBehalf: true });
  });

  it('admin without an employee record sees only "Add on behalf"', () => {
    expect(
      fieldMovementCreateActions({
        employeeId: '  ',
        excludedFromHrProcesses: false,
        eligibleEmployeeCount: 40,
      }),
    ).toEqual({ canAddSelf: false, canAddOnBehalf: true });
  });

  it('admin with an employee record sees both', () => {
    expect(
      fieldMovementCreateActions({
        employeeId: 'CC-0059',
        excludedFromHrProcesses: false,
        eligibleEmployeeCount: 40,
      }),
    ).toEqual({ canAddSelf: true, canAddOnBehalf: true });
  });

  it('regular employee sees only "Add"', () => {
    expect(
      fieldMovementCreateActions({
        employeeId: 'CC-0101',
        excludedFromHrProcesses: false,
        eligibleEmployeeCount: 0,
      }),
    ).toEqual({ canAddSelf: true, canAddOnBehalf: false });
  });
});
