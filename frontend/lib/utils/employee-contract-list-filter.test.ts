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
  it('lastMonth covers the whole previous calendar month', () => {
    expect(matchesEmployeeContractEndWindow(contract('2026-10-01'), 'lastMonth', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-10-31'), 'lastMonth', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-09-30'), 'lastMonth', TODAY)).toBe(false);
    expect(matchesEmployeeContractEndWindow(contract('2026-11-01'), 'lastMonth', TODAY)).toBe(false);
  });

  it('thisMonth covers the current calendar month', () => {
    expect(matchesEmployeeContractEndWindow(contract('2026-11-01'), 'thisMonth', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-11-19'), 'thisMonth', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-11-30'), 'thisMonth', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-10-31'), 'thisMonth', TODAY)).toBe(false);
    expect(matchesEmployeeContractEndWindow(contract('2026-12-01'), 'thisMonth', TODAY)).toBe(false);
  });

  it('nextMonth covers the following calendar month', () => {
    expect(matchesEmployeeContractEndWindow(contract('2026-12-01'), 'nextMonth', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-12-31'), 'nextMonth', TODAY)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-11-30'), 'nextMonth', TODAY)).toBe(false);
    expect(matchesEmployeeContractEndWindow(contract('2027-01-01'), 'nextMonth', TODAY)).toBe(false);
  });

  it('secondNextMonth covers the month after next', () => {
    expect(matchesEmployeeContractEndWindow(contract('2027-01-01'), 'secondNextMonth', TODAY)).toBe(
      true,
    );
    expect(matchesEmployeeContractEndWindow(contract('2027-01-31'), 'secondNextMonth', TODAY)).toBe(
      true,
    );
    expect(matchesEmployeeContractEndWindow(contract('2026-12-31'), 'secondNextMonth', TODAY)).toBe(
      false,
    );
    expect(matchesEmployeeContractEndWindow(contract('2027-02-01'), 'secondNextMonth', TODAY)).toBe(
      false,
    );
  });

  it('includes any status and rejects open-ended contracts', () => {
    expect(
      matchesEmployeeContractEndWindow(contract('2026-10-15', 'EXPIRED'), 'lastMonth', TODAY),
    ).toBe(true);
    expect(
      matchesEmployeeContractEndWindow(contract('2026-12-10', 'TERMINATED'), 'nextMonth', TODAY),
    ).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract(null), 'thisMonth', TODAY)).toBe(false);
  });

  it('handles year boundaries (Dec → Jan / Feb)', () => {
    const dec19 = new Date(2026, 11, 19, 12);
    expect(matchesEmployeeContractEndWindow(contract('2026-11-30'), 'lastMonth', dec19)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2026-12-15'), 'thisMonth', dec19)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2027-01-15'), 'nextMonth', dec19)).toBe(true);
    expect(matchesEmployeeContractEndWindow(contract('2027-02-28'), 'secondNextMonth', dec19)).toBe(
      true,
    );
  });
});

describe('filterEmployeeContracts endWindow', () => {
  it('combines the end-date window with the other filters', () => {
    const rows = [
      contract('2026-10-20', 'EXPIRED'),
      contract('2026-11-05'),
      contract('2026-12-01'),
      contract('2027-01-10'),
      contract(null),
    ];
    const ids = (
      window: 'lastMonth' | 'thisMonth' | 'nextMonth' | 'secondNextMonth',
    ) =>
      filterEmployeeContracts(rows, {
        search: '',
        endWindow: window,
        referenceDate: TODAY,
      }).map((row) => row.endDate);

    expect(ids('lastMonth')).toEqual(['2026-10-20']);
    expect(ids('thisMonth')).toEqual(['2026-11-05']);
    expect(ids('nextMonth')).toEqual(['2026-12-01']);
    expect(ids('secondNextMonth')).toEqual(['2027-01-10']);
    expect(filterEmployeeContracts(rows, { search: '' })).toHaveLength(5);
  });
});
