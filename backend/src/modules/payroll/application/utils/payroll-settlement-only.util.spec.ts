import {
  employeeIdsNeedingSettlementRow,
  isCollectFromEmployee,
  itemNeedsSettlementRow,
  planSettlementOnlyRows,
  type SettlementCandidateItem,
} from './payroll-settlement-only.util';

const item = (overrides: Partial<SettlementCandidateItem> = {}): SettlementCandidateItem => ({
  employeeId: 'emp-ada-mensah',
  direction: 'OWED_TO_EMPLOYEE',
  status: 'OPEN',
  statutoryRunId: null,
  ...overrides,
});

describe('itemNeedsSettlementRow', () => {
  it('needs a row while money is still owed, either way', () => {
    expect(itemNeedsSettlementRow(item())).toBe(true);
    expect(itemNeedsSettlementRow(item({ status: 'PARTIALLY_SETTLED' }))).toBe(true);
    expect(itemNeedsSettlementRow(item({ direction: 'OWED_TO_COMPANY' }))).toBe(true);
  });

  it('does not need a row once settled or waived', () => {
    expect(itemNeedsSettlementRow(item({ status: 'SETTLED' }))).toBe(false);
    expect(itemNeedsSettlementRow(item({ status: 'WAIVED' }))).toBe(false);
  });

  it('keeps a statutory-only item until a run declares it', () => {
    expect(itemNeedsSettlementRow(item({ direction: 'STATUTORY_ONLY' }))).toBe(true);
    expect(
      itemNeedsSettlementRow(item({ direction: 'STATUTORY_ONLY', statutoryRunId: 'run-1' })),
    ).toBe(false);
    expect(
      itemNeedsSettlementRow(item({ direction: 'STATUTORY_ONLY', status: 'SETTLED' })),
    ).toBe(false);
  });
});

describe('planSettlementOnlyRows', () => {
  it('adds a row only for an employee who is not in the run at all', () => {
    const needed = employeeIdsNeedingSettlementRow([
      item({ employeeId: 'emp-ada-mensah' }),
      item({ employeeId: 'emp-kofi-boateng', direction: 'OWED_TO_COMPANY' }),
      item({ employeeId: 'emp-efua-owusu', status: 'SETTLED' }),
    ]);
    const plan = planSettlementOnlyRows(needed, [
      { id: 'entry-1', employeeId: 'emp-kofi-boateng', settlementOnly: false },
    ]);
    expect(plan.add).toEqual(['emp-ada-mensah']);
    expect(plan.remove).toEqual([]);
  });

  it('removes a settlement-only row once its items are settled or waived, never a normal row', () => {
    const plan = planSettlementOnlyRows(new Set<string>(), [
      { id: 'entry-ada', employeeId: 'emp-ada-mensah', settlementOnly: true },
      { id: 'entry-kofi', employeeId: 'emp-kofi-boateng', settlementOnly: false },
    ]);
    expect(plan.remove).toEqual([{ id: 'entry-ada', employeeId: 'emp-ada-mensah' }]);
    expect(plan.add).toEqual([]);
  });

  it('keeps a settlement-only row while something is still open', () => {
    const plan = planSettlementOnlyRows(new Set(['emp-ada-mensah']), [
      { id: 'entry-ada', employeeId: 'emp-ada-mensah', settlementOnly: true },
    ]);
    expect(plan).toEqual({ add: [], remove: [] });
  });
});

describe('isCollectFromEmployee', () => {
  it('flags only a settlement-only row with a negative net', () => {
    expect(isCollectFromEmployee({ settlementOnly: true, netPay: -1800 })).toBe(true);
    expect(isCollectFromEmployee({ settlementOnly: true, netPay: 2500 })).toBe(false);
    expect(isCollectFromEmployee({ settlementOnly: false, netPay: -1800 })).toBe(false);
  });
});
