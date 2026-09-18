import { EmployeeContractStatus, EmployeeContractType } from '@prisma/client';
import { EmployeeContractService } from './employee-contract.service';

const PAY_FIELDS = [
  'basicSalary',
  'transportationAllowance',
  'monthlyBonus',
  'netSalary',
] as const;

describe('EmployeeContractService.getMyActiveContract', () => {
  const findFirst = jest.fn();
  const prisma = { employeeContract: { findFirst } };
  const service = new EmployeeContractService(
    prisma as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    findFirst.mockReset();
  });

  it('returns { contract: null } when the employee has no active contract', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.getMyActiveContract('company-1', 'user-1'),
    ).resolves.toEqual({ contract: null });
  });

  it('scopes to the current user and ACTIVE status, and never selects pay fields', async () => {
    findFirst.mockResolvedValue(null);

    await service.getMyActiveContract('company-1', 'user-1');

    const args = findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({
      companyId: 'company-1',
      employeeId: 'user-1',
      status: EmployeeContractStatus.ACTIVE,
    });
    for (const field of PAY_FIELDS) {
      expect(args.select).not.toHaveProperty(field);
    }
  });

  it('returns date-only strings and no pay fields even if the row had them', async () => {
    findFirst.mockResolvedValue({
      id: 'contract-1',
      contractNumber: 'EC-2026-0001',
      contractType: EmployeeContractType.FIXED_TERM,
      status: EmployeeContractStatus.ACTIVE,
      signedAt: new Date('2026-01-05T00:00:00.000Z'),
      startDate: new Date('2026-01-10T00:00:00.000Z'),
      endDate: null,
      probationEndDate: new Date('2026-04-10T00:00:00.000Z'),
      governedBy: 'Ethiopian Labour Proclamation 1156/2019',
      basicSalary: 50000,
      netSalary: 42000,
    });

    const result = await service.getMyActiveContract('company-1', 'user-1');

    expect(result.contract).toEqual({
      id: 'contract-1',
      contractNumber: 'EC-2026-0001',
      contractType: EmployeeContractType.FIXED_TERM,
      status: EmployeeContractStatus.ACTIVE,
      signedAt: '2026-01-05',
      startDate: '2026-01-10',
      endDate: null,
      probationEndDate: '2026-04-10',
      governedBy: 'Ethiopian Labour Proclamation 1156/2019',
    });
    for (const field of PAY_FIELDS) {
      expect(result.contract).not.toHaveProperty(field);
    }
  });
});
