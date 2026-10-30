import { BadRequestException } from '@nestjs/common';
import { LeaveType } from '@prisma/client';
import { LeaveBalanceService } from './leave-balance.service';
import {
  buildLeaveCalendar,
  formatLeaveYearRange,
  leaveYearFor,
  toDateOnlyKey,
} from '../../../leave-policy/application/utils/leave-year.util';

function d(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

describe('LeaveBalanceService.getLeaveBalance + assert', () => {
  const employment = d('2023-10-10');
  const companyId = 'c1';
  const employeeId = 'e1';

  function buildService(remainingByYear: Record<number, number>): LeaveBalanceService {
    const leaveLedger = {
      // No contracts: leave years fall back to the employment anniversary.
      leaveCalendar: jest.fn(async () => buildLeaveCalendar([], employment)),
      ensureLeaveYear: jest.fn(async () => undefined),
      currentYearLabel: jest.fn(async () => 2026),
      yearLabelForDate: jest.fn(async (_e: string, _c: string, date: Date) =>
        leaveYearFor(employment, date).label,
      ),
      getLeaveBalance: jest.fn(
        async (
          _employeeId: string,
          _companyId: string,
          leaveType: LeaveType,
          date: Date | string,
        ) => {
          const year = leaveYearFor(employment, date);
          const remaining = remainingByYear[year.label] ?? 0;
          return {
            employeeId,
            leaveType,
            year: {
              label: year.label,
              start: toDateOnlyKey(year.start),
              end: toDateOnlyKey(year.end),
            },
            entitled: remaining,
            broughtForward: 0,
            used: 0,
            pending: 0,
            remaining,
            leavePolicyId: null,
          };
        },
      ),
    };

    const prisma = {
      user: {
        findFirst: jest.fn(async () => ({
          employmentDate: employment,
        })),
      },
      leaveBalance: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    return new LeaveBalanceService(prisma as never, leaveLedger as never);
  }

  it('date before 2026 anniversary uses leave year 2025', async () => {
    const service = buildService({ 2025: 10, 2026: 20 });
    const balance = await service.getLeaveBalance(
      employeeId,
      companyId,
      LeaveType.ANNUAL,
      d('2026-10-05'),
    );
    expect(balance.year).toBe(2025);
    expect(balance.leaveYearStart).toBe('2025-10-10');
    expect(balance.remaining).toBe(10);
  });

  it('seeded OPENING remaining 10 allows a 1-day request in that year', async () => {
    const service = buildService({ 2025: 10 });
    const year = leaveYearFor(employment, d('2026-10-05'));
    await expect(
      service.assertSufficientBalance(
        employeeId,
        LeaveType.ANNUAL,
        year.label,
        1,
        companyId,
      ),
    ).resolves.toBeUndefined();
  });

  it('error message includes leave type and leave-year range', async () => {
    const service = buildService({ 2025: 0 });
    const year = leaveYearFor(employment, d('2026-10-05'));
    await expect(
      service.assertSufficientBalance(
        employeeId,
        LeaveType.ANNUAL,
        year.label,
        1,
        companyId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    try {
      await service.assertSufficientBalance(
        employeeId,
        LeaveType.ANNUAL,
        year.label,
        1,
        companyId,
      );
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        `Insufficient leave balance for Annual in leave year ${formatLeaveYearRange(year)}. Remaining: 0, requested: 1`,
      );
    }
  });

  it('UI balance for forDate equals validator balance for the same date', async () => {
    const service = buildService({ 2025: 10, 2026: 20 });
    const date = d('2026-10-05');
    const ui = await service.getLeaveBalance(
      employeeId,
      companyId,
      LeaveType.ANNUAL,
      date,
    );
    const year = leaveYearFor(employment, date);
    // Validator path
    const validator = await service.getLeaveBalance(
      employeeId,
      companyId,
      LeaveType.ANNUAL,
      year.start,
    );
    expect(ui.remaining).toBe(validator.remaining);
    expect(ui.year).toBe(validator.year);
  });

  it('chargeDaysByLeaveYear splits a breakdown across the anniversary', async () => {
    const service = buildService({});
    const charges = await service.chargeDaysByLeaveYear(employeeId, companyId, [
      { date: d('2026-10-09'), weight: 1 },
      { date: d('2026-10-10'), weight: 1 },
    ]);
    expect(charges).toHaveLength(2);
    expect(charges[0]!.year.label).toBe(2025);
    expect(charges[0]!.days).toBe(1);
    expect(charges[1]!.year.label).toBe(2026);
    expect(charges[1]!.days).toBe(1);
  });
});
