import { describe, expect, it } from 'vitest';
import type { EmployeeContractListItem } from '@/lib/api/employee-contract.types';
import {
  filterEmployeeContracts,
  matchesEmployeeContractEndWindow,
} from '@/lib/utils/employee-contract-list-filter';

/** Local noon avoids timezone edge cases around midnight. */
const TODAY = new Date(2026, 10, 19, 12); // 19 Nov 2026

function contract(
  endDate: string | null,
  status: EmployeeContractListItem['status'] = 'ACTIVE',
): EmployeeContractListItem {
  return {
    id: `c-${endDate ?? 'open'}-${status}`,
    contractNumber: 'EC-1',
    employeeId: 'u1',
    status,
    endDate,
  } as unknown as EmployeeContractListItem;
}

describe('matchesEmployeeContractEndWindow', () => {
  it('next1 covers today through the same day next month', () => {
    expect(matchesEmployeeContractEndWindow(contract('2026-11-19'), 'next1', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-12-19'), 'next1', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-12-20'), 'next1', TODAY)).toBe(false);
    expect(matchesEmployeeContractEndWindow(contract('2026-11-18'), 'next1', TODAY)).toBe(false);
  });

  it('next2 and next3 are cumulative', () => {
    const inFiveWeeks = contract('2026-12-24');
    expect(matchesEmployeeContractEndWindow(inFiveWeeks, 'next1', TODAY)).toBe(false);
    expect(matchesEmployeeContractEndWindow(inFiveWeeks, 'next2', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(inFiveWeeks, 'next3', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2027-02-19'), 'next3', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2027-02-20'), 'next3', TODAY)).toBe(false);
  });

  it('upcoming windows only include active contracts', () => {
    expect(
      matchesEmployeeContractEndWindow(contract('2026-12-01', 'TERMINATED'), 'next1', TODAY),
    ).toBe(false);
    expect(matchesEmployeeContractEndWindow(contract(null), 'next3', TODAY)).toBe(false);
  });

  it('last1 covers the past month, any status, excluding today', () => {
    expect(matchesEmployeeContractEndWindow(contract('2026-11-18', 'EXPIRED'), 'last1', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-10-19'), 'last1', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-10-18'), 'last1', TODAY)).toBe(false);
    expect(matchesEmployeeContractEndWindow(contract('2026-11-19'), 'last1', TODAY)).toBe(false);
  });

  it('clamps month ends (31 Jan + 1 month = 28 Feb)', () => {
    const jan31 = new Date(2027, 0, 31, 12);
    expect(matchesEmployeeContractEndWindow(contract('2027-02-28'), 'next1', jan31)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2027-03-01'), 'next1', jan31)).toBe(false);
  });
});

describe('filterEmployeeContracts endWindow', () => {
  it('combines the end-date window with the other filters', () => {
    const rows = [
      contract('2026-12-01'),
      contract('2027-01-10'),
      contract('2026-11-01', 'EXPIRED'),
      contract(null),
    ];
    const ids = (window: 'next1' | 'next2' | 'last1') =>
      filterEmployeeContracts(rows, { search: '', endWindow: window, referenceDate: TODAY }).map(
        (row) => row.endDate,
      );
    expect(ids('next1')).toEqual(['2026-12-01']);
    expect(ids('next2')).toEqual(['2026-12-01', '2027-01-10']);
    expect(ids('last1')).toEqual(['2026-11-01']);
    expect(filterEmployeeContracts(rows, { search: '' })).toHaveLength(4);
  });
});
