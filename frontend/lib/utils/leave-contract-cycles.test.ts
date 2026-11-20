import { describe, expect, it } from 'vitest';
import type { LeaveYearContract, LeaveYearOption } from '@/lib/api/leave.types';
import {
  groupForCycle,
  groupLeaveYearsByContract,
} from '@/lib/utils/leave-contract-cycles';

const first: LeaveYearContract = {
  id: 'c1',
  contractNumber: 'EC-0001',
  sequence: 1,
  startDate: '2025-01-10',
  endDate: '2026-05-31',
};
const second: LeaveYearContract = {
  id: 'c2',
  contractNumber: 'EC-0002',
  sequence: 2,
  startDate: '2026-06-05',
  endDate: null,
};

function cycle(
  label: number,
  start: string,
  end: string,
  contract: LeaveYearContract | null,
): LeaveYearOption {
  return { label, start, end, contract };
}

// API order: newest cycle first.
const YEARS: LeaveYearOption[] = [
  cycle(2027, '2027-06-05', '2028-06-04', second),
  cycle(2026, '2026-06-05', '2027-06-04', second),
  cycle(2025, '2025-01-10', '2026-01-09', first),
  cycle(2025, '2025-01-10', '2026-01-09', first), // duplicate label
  cycle(2024, '2024-01-10', '2025-01-09', null),
];

describe('groupLeaveYearsByContract', () => {
  it('groups cycles per contract, newest contract first, cycles oldest first', () => {
    const groups = groupLeaveYearsByContract(YEARS);
    expect(groups.map((group) => group.key)).toEqual(['c2', 'c1', 'none']);
    expect(groups[0]!.cycles.map((c) => c.label)).toEqual([2026, 2027]);
    expect(groups[1]!.cycles.map((c) => c.label)).toEqual([2025]);
    expect(groups[2]!.contract).toBeNull();
  });

  it('returns no groups for no years', () => {
    expect(groupLeaveYearsByContract([])).toEqual([]);
  });
});

describe('groupForCycle', () => {
  it('finds the contract that owns a cycle label', () => {
    const groups = groupLeaveYearsByContract(YEARS);
    expect(groupForCycle(groups, 2027)?.key).toBe('c2');
    expect(groupForCycle(groups, 2025)?.key).toBe('c1');
    expect(groupForCycle(groups, 1999)).toBeNull();
  });
});
