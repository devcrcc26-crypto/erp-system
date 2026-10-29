import { describe, expect, it } from 'vitest';
import { perDiemAmounts } from '@/lib/utils/per-diem-display';

describe('perDiemAmounts', () => {
  it('uses the approved rate for the approved total and remaining amount', () => {
    expect(
      perDiemAmounts({
        dailyRate: '500.00',
        approvedDailyRate: '600.00',
        days: 5,
        disbursements: [{ amount: '1200.00' }],
      }),
    ).toEqual({
      standardRate: 500,
      approvedRate: 600,
      days: 5,
      approvedTotal: 3000,
      disbursed: 1200,
      remaining: 1800,
    });
  });

  it('falls back to the standard rate until an approver sets one', () => {
    const amounts = perDiemAmounts({ dailyRate: 500, days: 4 });
    expect(amounts.approvedRate).toBeNull();
    expect(amounts.approvedTotal).toBe(2000);
    expect(amounts.remaining).toBe(2000);
  });

  it('never shows a negative remaining amount', () => {
    expect(
      perDiemAmounts({
        dailyRate: 500,
        days: 1,
        disbursements: [{ amount: 700 }],
      }).remaining,
    ).toBe(0);
  });
});
