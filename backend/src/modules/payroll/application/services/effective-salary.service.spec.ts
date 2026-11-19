import { describe, expect, it, jest } from '@jest/globals';
import { EffectiveSalaryService } from './effective-salary.service';

const USER = 'user-1';
const COMPANY = 'company-1';
const ON = new Date(Date.UTC(2026, 10, 15));

function serviceWith(prisma: {
  user: { findFirst: () => Promise<{ companyId: string } | null> };
  positionHistory: { findFirst: () => Promise<{ salaryOverride: number } | null> };
  employeeContract: { findFirst: () => Promise<{ basicSalary: number } | null> };
}): EffectiveSalaryService {
  return new EffectiveSalaryService(prisma as never);
}

describe('EffectiveSalaryService', () => {
  it('uses the position-history salary override when one covers the date', async () => {
    const history = jest.fn(async () => ({ salaryOverride: 22000 }));
    const contract = jest.fn(async () => ({ basicSalary: 15000 }));
    const service = serviceWith({
      user: { findFirst: async () => ({ companyId: COMPANY }) },
      positionHistory: { findFirst: history },
      employeeContract: { findFirst: contract },
    });

    await expect(service.getEffectiveSalary(USER, ON)).resolves.toBe(22000);
    expect(contract).not.toHaveBeenCalled();
    expect(history).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: COMPANY,
          userId: USER,
          effectiveFrom: { lte: ON },
        }),
      }),
    );
  });

  it('falls back to the contract basic salary when no override is in force', async () => {
    const service = serviceWith({
      user: { findFirst: async () => ({ companyId: COMPANY }) },
      positionHistory: { findFirst: async () => null },
      employeeContract: { findFirst: async () => ({ basicSalary: 15000 }) },
    });

    await expect(service.getEffectiveSalary(USER, ON)).resolves.toBe(15000);
  });

  it('returns null when the employee does not exist', async () => {
    const history = jest.fn(async () => ({ salaryOverride: 1 }));
    const service = serviceWith({
      user: { findFirst: async () => null },
      positionHistory: { findFirst: history },
      employeeContract: { findFirst: async () => ({ basicSalary: 1 }) },
    });

    await expect(service.getEffectiveSalary(USER, ON)).resolves.toBeNull();
    expect(history).not.toHaveBeenCalled();
  });
});
