import type { LeaveYearContract, LeaveYearOption } from '@/lib/api/leave.types';

/** Leave cycles grouped under the contract they belong to. */
export interface ContractCycleGroup {
  /** Contract id, or `'none'` for cycles not covered by any contract. */
  key: string;
  contract: LeaveYearContract | null;
  /** Anniversary cycles, oldest first ("Year 1", "Year 2", …). */
  cycles: LeaveYearOption[];
}

const NO_CONTRACT = 'none';

/**
 * Groups leave-year options by contract: newest contract first, cycles inside
 * a contract oldest first. Cycles without a contract come last.
 * Duplicate cycle labels are dropped (the label is the balance key).
 */
export function groupLeaveYearsByContract(
  years: readonly LeaveYearOption[],
): ContractCycleGroup[] {
  const groups = new Map<string, ContractCycleGroup>();
  const seen = new Set<number>();

  for (const option of years) {
    if (seen.has(option.label)) {
      continue;
    }
    seen.add(option.label);
    const key = option.contract?.id ?? NO_CONTRACT;
    let group = groups.get(key);
    if (!group) {
      group = { key, contract: option.contract ?? null, cycles: [] };
      groups.set(key, group);
    }
    group.cycles.push(option);
  }

  for (const group of groups.values()) {
    group.cycles.sort((a, b) => a.start.localeCompare(b.start));
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.contract) return 1;
    if (!b.contract) return -1;
    return b.contract.startDate.localeCompare(a.contract.startDate);
  });
}

/** The group that holds the cycle with this label, if any. */
export function groupForCycle(
  groups: readonly ContractCycleGroup[],
  label: number,
): ContractCycleGroup | null {
  return (
    groups.find((group) => group.cycles.some((cycle) => cycle.label === label)) ??
    null
  );
}
