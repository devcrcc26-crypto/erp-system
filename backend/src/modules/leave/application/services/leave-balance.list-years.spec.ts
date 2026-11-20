import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { buildLeaveCalendar } from '../../../leave-policy/application/utils/leave-year.util';
import { LeaveBalanceService } from './leave-balance.service';

const COMPANY = 'company-1';
const EMPLOYEE = 'employee-1';

const utc = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

describe('LeaveBalanceService.listLeaveYears', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('only lists leave years that a contract covers', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-20T09:00:00.000Z'));

    // Contract A: one year. Contract B starts after a gap and is fixed-term.
    const contracts = [
      {
        id: 'a',
        contractNumber: 'EC-0001',
        startDate: utc('2025-01-10'),
        endDate: utc('2026-01-09'),
        terminatedAt: null,
      },
      {
        id: 'b',
        contractNumber: 'EC-0002',
        startDate: utc('2026-06-05'),
        endDate: utc('2027-06-04'),
        terminatedAt: null,
      },
    ];
    const calendar = buildLeaveCalendar(
      contracts.map((contract) => contract.startDate),
      null,
    );

    const prisma = {
      employeeContract: { findMany: jest.fn(async () => contracts) },
      // A legacy balance row from before the first contract.
      leaveBalance: { findMany: jest.fn(async () => [{ year: 2024 }]) },
    };
    const leaveLedger = { leaveCalendar: jest.fn(async () => calendar) };

    const service = Object.assign(
      Object.create(LeaveBalanceService.prototype) as object,
      { prisma, leaveLedger },
    ) as unknown as LeaveBalanceService;

    const result = await service.listLeaveYears(EMPLOYEE, COMPANY);

    // Kept: B's year (current) and A's first year, each with its contract.
    expect(result.years.map((year) => [year.start, year.contract?.id])).toEqual([
      ['2026-06-05', 'b'],
      ['2025-01-10', 'a'],
    ]);
    // Left out: 2026-01-10 (A had ended), 2027-06-05 (B ends 2027-06-04),
    // and the 2024 legacy year (before any contract).
    const starts = result.years.map((year) => year.start);
    expect(starts).not.toContain('2026-01-10');
    expect(starts).not.toContain('2027-06-05');
    expect(result.years.every((year) => year.contract != null)).toBe(true);
    expect(result.current.start).toBe('2026-06-05');
  });
});
