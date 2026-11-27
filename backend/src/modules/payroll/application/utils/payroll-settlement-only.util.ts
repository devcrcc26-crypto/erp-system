/**
 * Settlement-only rows: a regular run carries a row for an employee or
 * freelancer who is not otherwise in the run (contract ended, inactive,
 * excluded from payroll) but still has reconciliation items to settle or
 * statutory differences to declare. The row has no salary, OT, allowances,
 * tax or pension of its own.
 */

export interface SettlementCandidateItem {
  employeeId: string;
  direction: 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY' | 'STATUTORY_ONLY';
  status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'WAIVED';
  /** Run that already declared the item's tax / pension differences. */
  statutoryRunId: string | null;
}

/**
 * True when the item still needs its employee on a run: money is still owed
 * (OPEN / PARTIALLY_SETTLED), or a statutory-only item is waiting to be
 * declared. Settled and waived items do not.
 */
export function itemNeedsSettlementRow(item: SettlementCandidateItem): boolean {
  if (item.direction === 'STATUTORY_ONLY') {
    return item.status === 'OPEN' && item.statutoryRunId == null;
  }
  return item.status === 'OPEN' || item.status === 'PARTIALLY_SETTLED';
}

/** Employees that need a settlement-only row because of these items. */
export function employeeIdsNeedingSettlementRow(
  items: readonly SettlementCandidateItem[],
): Set<string> {
  return new Set(items.filter(itemNeedsSettlementRow).map((item) => item.employeeId));
}

export interface SettlementRowPlan {
  /** Employees to add as settlement-only rows (not in the run at all). */
  add: string[];
  /** Existing settlement-only rows whose items are all settled / waived. */
  remove: Array<{ id: string; employeeId: string }>;
}

/**
 * Which settlement-only rows to add or remove, given who needs one and who is
 * already in the run. A normal row is never touched; a settlement-only row
 * stays while its employee still needs it.
 */
export function planSettlementOnlyRows(
  needed: ReadonlySet<string>,
  entries: ReadonlyArray<{ id: string; employeeId: string; settlementOnly: boolean }>,
): SettlementRowPlan {
  const inRun = new Set(entries.map((entry) => entry.employeeId));
  return {
    add: [...needed].filter((employeeId) => !inRun.has(employeeId)),
    remove: entries
      .filter((entry) => entry.settlementOnly && !needed.has(entry.employeeId))
      .map((entry) => ({ id: entry.id, employeeId: entry.employeeId })),
  };
}

/**
 * Money to collect: a settlement-only row with a negative net pay (a recovery
 * settled through payroll). It cannot be paid; HR collects it from the employee.
 */
export function isCollectFromEmployee(entry: {
  settlementOnly: boolean;
  netPay: number;
}): boolean {
  return entry.settlementOnly && entry.netPay < -0.005;
}
