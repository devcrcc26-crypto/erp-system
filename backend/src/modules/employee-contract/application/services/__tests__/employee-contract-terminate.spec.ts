import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { EmployeeContractService } from '../employee-contract.service';

const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

function makeService(contract: { startDate: Date; endDate: Date | null }) {
  const prisma: any = {
    employeeContract: {
      findFirst: jest.fn(async () => ({
        id: 'c1',
        contractNumber: 'EC-0001',
        status: 'ACTIVE',
        ...contract,
      })),
      update: jest.fn(async () => ({})),
    },
  };
  const permissions = { hasPermission: jest.fn(async () => true) };
  const service = new EmployeeContractService(
    prisma,
    permissions as any,
    {} as any,
    {} as any,
    {} as any,
  );
  jest.spyOn(service, 'getContract').mockResolvedValue({} as never);
  return { service, prisma };
}

describe('EmployeeContractService.terminateContract', () => {
  it('sets endDate = terminatedAt so payroll and attendance stop at the termination', async () => {
    const { service, prisma } = makeService({ startDate: d(2025, 1, 1), endDate: null });
    await service.terminateContract('c1', 'hr', 'company', {
      terminatedAt: '2026-08-20',
      terminationReason: 'Resigned',
    });
    expect(prisma.employeeContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'TERMINATED',
          terminatedAt: d(2026, 8, 20),
          endDate: d(2026, 8, 20),
        }),
      }),
    );
  });

  it('rejects a termination before the contract start', async () => {
    const { service, prisma } = makeService({ startDate: d(2026, 9, 1), endDate: null });
    await expect(
      service.terminateContract('c1', 'hr', 'company', {
        terminatedAt: '2026-08-20',
        terminationReason: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employeeContract.update).not.toHaveBeenCalled();
  });

  it('rejects a termination after the contract end', async () => {
    const { service } = makeService({ startDate: d(2025, 1, 1), endDate: d(2026, 6, 30) });
    await expect(
      service.terminateContract('c1', 'hr', 'company', {
        terminatedAt: '2026-08-20',
        terminationReason: 'x',
      }),
    ).rejects.toThrow('cannot be after the contract end');
  });
});
