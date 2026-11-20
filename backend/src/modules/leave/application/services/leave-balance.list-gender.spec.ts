import { describe, expect, it, jest } from '@jest/globals';
import { LeaveType, Prisma } from '@prisma/client';
import { LeaveBalanceService } from './leave-balance.service';

const COMPANY = 'company-1';
const YEAR = 2026;

function balanceRow(employeeId: string, leaveType: LeaveType) {
  return {
    id: `${employeeId}-${leaveType}`,
    companyId: COMPANY,
    employeeId,
    year: YEAR,
    leaveType,
    entitled: new Prisma.Decimal(10),
    broughtForward: new Prisma.Decimal(0),
    used: new Prisma.Decimal(0),
    pending: new Prisma.Decimal(0),
    remaining: new Prisma.Decimal(10),
  };
}

const ALL_TYPES = [
  LeaveType.ANNUAL,
  LeaveType.SICK,
  LeaveType.MATERNITY,
  LeaveType.PATERNITY,
];

describe('LeaveBalanceService.listCompanyBalances gender filter', () => {
  it('returns maternity only for female and paternity only for male employees', async () => {
    const employees = [
      { id: 'f1', firstName: 'Hana', lastName: 'A', gender: 'FEMALE', employeeId: 'E-001' },
      { id: 'm1', firstName: 'Abel', lastName: 'B', gender: 'MALE', employeeId: 'E-002' },
      { id: 'u1', firstName: 'Sam', lastName: 'C', gender: null, employeeId: null },
    ].map((e) => ({ middleName: null, email: null, chineseName: null, ...e }));

    const prisma = {
      user: {
        findMany: jest.fn(async () => employees),
        count: jest.fn(async () => employees.length),
      },
      leaveBalance: {
        // Every employee has a cached row for every type (e.g. legacy data).
        findMany: jest.fn(async () =>
          employees.flatMap((e) => ALL_TYPES.map((type) => balanceRow(e.id, type))),
        ),
      },
    };

    const service = Object.assign(
      Object.create(LeaveBalanceService.prototype) as object,
      { prisma, leaveLedger: {} },
    ) as unknown as LeaveBalanceService;

    const result = (await service.listCompanyBalances(
      { year: YEAR, page: 1, limit: 20 } as never,
      COMPANY,
    )) as unknown as {
      data: Array<{
        employee: { id: string; employeeCode: string | null };
        annual: unknown;
        sick: unknown;
        maternity: unknown;
        paternity: unknown;
      }>;
    };

    const byId = new Map(result.data.map((row) => [row.employee.id, row]));
    const female = byId.get('f1')!;
    const male = byId.get('m1')!;
    const unknown = byId.get('u1')!;

    expect(female.maternity).not.toBeNull();
    expect(female.paternity).toBeNull();
    expect(male.paternity).not.toBeNull();
    expect(male.maternity).toBeNull();
    expect(unknown.maternity).toBeNull();
    expect(unknown.paternity).toBeNull();

    for (const row of [female, male, unknown]) {
      expect(row.annual).not.toBeNull();
      expect(row.sick).not.toBeNull();
    }
    expect(female.employee.employeeCode).toBe('E-001');
    expect(unknown.employee.employeeCode).toBeNull();
  });
});
