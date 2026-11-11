import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PayrollPayslipService } from './payroll-payslip.service';

function dec(value: number): Decimal {
  return new Decimal(value);
}

describe('PayrollPayslipService', () => {
  jest.setTimeout(30_000);
  const ctx = { userId: 'hr-1', companyId: 'co-1' };

  function harness(): {
    service: PayrollPayslipService;
    prisma: {
      payrollRun: { findFirst: jest.Mock };
      payrollEntry: { findMany: jest.Mock };
      payrollPayslip: {
        findMany: jest.Mock;
        updateMany: jest.Mock;
        createMany: jest.Mock;
        findFirst: jest.Mock;
        update: jest.Mock;
      };
      user: { findFirst: jest.Mock };
    };
    notifications: { send: jest.Mock };
    permissions: { hasPermission: jest.Mock };
    pdf: { render: jest.Mock };
  } {
    const prisma = {
      payrollRun: { findFirst: jest.fn() },
      payrollEntry: { findMany: jest.fn() },
      payrollPayslip: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn() },
    };
    const notifications = { send: jest.fn().mockResolvedValue({ emailQueued: false }) };
    const permissions = { hasPermission: jest.fn().mockResolvedValue(false) };
    const pdf = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')) };
    const service = new PayrollPayslipService(
      prisma as never,
      pdf as never,
      notifications as never,
      permissions as never,
    );
    return { service, prisma, notifications, permissions, pdf };
  }

  it('rejects generation on a DRAFT run', async () => {
    const { service, prisma } = harness();
    prisma.payrollRun.findFirst.mockResolvedValue({
      id: 'run-1',
      status: 'DRAFT',
      month: 10,
      year: 2026,
      runNumber: 'PR-2026-10',
    });

    await expect(service.generate('run-1', ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.payrollPayslip.createMany).not.toHaveBeenCalled();
  });

  it('creates payslips once and updates them on a second generate', async () => {
    const { service, prisma } = harness();
    prisma.payrollRun.findFirst.mockResolvedValue({
      id: 'run-1',
      status: 'GM_APPROVED',
      month: 10,
      year: 2026,
      runNumber: 'PR-2026-10',
    });
    prisma.payrollEntry.findMany.mockResolvedValue([
      { id: 'e1', employeeId: 'emp-1', payrollDays: dec(30), netPay: dec(17667.18) },
      { id: 'e2', employeeId: 'emp-2', payrollDays: dec(0), netPay: dec(0) },
    ]);
    prisma.payrollPayslip.findMany.mockResolvedValueOnce([]);
    prisma.payrollPayslip.createMany.mockResolvedValue({ count: 1 });

    const first = await service.generate('run-1', ctx);
    expect(first).toEqual({ created: 1, updated: 0, skipped: 1, total: 1 });
    expect(prisma.payrollPayslip.createMany).toHaveBeenCalledTimes(1);
    const created = prisma.payrollPayslip.createMany.mock.calls[0][0].data as Array<{
      entryId: string;
    }>;
    expect(created.map((row) => row.entryId)).toEqual(['e1']);

    prisma.payrollPayslip.findMany.mockResolvedValueOnce([{ entryId: 'e1' }]);
    prisma.payrollPayslip.updateMany.mockResolvedValue({ count: 1 });
    const second = await service.generate('run-1', ctx);
    expect(second).toEqual({ created: 0, updated: 1, skipped: 1, total: 1 });
    expect(prisma.payrollPayslip.createMany).toHaveBeenCalledTimes(1);
  });

  it('releases generated payslips and notifies each employee once', async () => {
    const { service, prisma, notifications } = harness();
    prisma.payrollRun.findFirst.mockResolvedValue({
      id: 'run-1',
      status: 'PAID',
      month: 10,
      year: 2026,
      runNumber: 'PR-2026-10',
    });
    prisma.payrollPayslip.findMany.mockResolvedValue([
      { id: 'p1', employeeId: 'emp-1', releasedAt: null },
      { id: 'p2', employeeId: 'emp-2', releasedAt: new Date('2026-10-01') },
    ]);
    prisma.payrollPayslip.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.release('run-1', ctx);
    expect(result).toEqual({ released: 1, alreadyReleased: 1, notified: 1 });
    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(
      { companyId: 'co-1', userId: 'hr-1' },
      expect.objectContaining({
        recipientId: 'emp-1',
        channel: 'IN_APP',
        body: 'Your payslip for October 2026 is available.',
        link: '/profile?tab=payroll',
      }),
    );

    prisma.payrollPayslip.findMany.mockResolvedValue([
      { id: 'p1', employeeId: 'emp-1', releasedAt: new Date() },
      { id: 'p2', employeeId: 'emp-2', releasedAt: new Date() },
    ]);
    const again = await service.release('run-1', ctx);
    expect(again.released).toBe(0);
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });

  it('forbids an employee from an unreleased or someone else\'s payslip, and stamps the first own download', async () => {
    const { service, prisma, permissions, pdf } = harness();
    const payslip = {
      id: 'p1',
      employeeId: 'emp-1',
      generatedAt: new Date('2026-10-05T00:00:00.000Z'),
      releasedAt: null as Date | null,
      downloadedAt: null as Date | null,
      run: { id: 'run-1', runNumber: 'PR-2026-10', month: 10, year: 2026 },
      employee: {
        firstName: 'Armias',
        lastName: 'Bekele',
        chineseName: null,
        employeeId: 'EMP-014',
        department: { name: 'Engineering' },
        engineeringDiscipline: { name: 'Civil' },
      },
      entry: {
        payrollDays: dec(30),
        basicSalary: dec(13000),
        earnedSalary: dec(13000),
        normalOtHours: dec(8),
        eveningOtHours: dec(0),
        sundayOtHours: dec(0),
        holidayOtHours: dec(0),
        normalOtPay: dec(812.5),
        eveningOtPay: dec(0),
        sundayOtPay: dec(0),
        holidayOtPay: dec(0),
        transportAllowance: dec(2200),
        monthlyBonus: dec(3500),
        bonusTopUp: dec(0),
        bonusTopUpReason: null,
        contractNetBonus: dec(0),
        netTopUp: dec(0),
        netTopUpReason: null,
        grossIncome: dec(19512.5),
        pensionEmployee: dec(910),
        pensionEmployer: dec(1430),
        incomeTax: dec(935.32),
        totalDeductions: dec(1845.32),
        netPay: dec(17667.18),
        bankName: 'CBE',
        bankAccountNumber: '100012344412',
        contract: { pensionApplicable: true },
      },
    };
    prisma.payrollPayslip.findFirst.mockResolvedValue(payslip);

    await expect(
      service.getPdf('p1', { userId: 'emp-1', companyId: 'co-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getPdf('p1', { userId: 'emp-2', companyId: 'co-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    payslip.releasedAt = new Date('2026-10-06T00:00:00.000Z');
    prisma.payrollPayslip.update.mockResolvedValue(payslip);
    const file = await service.getPdf('p1', { userId: 'emp-1', companyId: 'co-1' });
    expect(file.filename).toBe('Payslip_2026_10_EMP-014_Armias_Bekele.pdf');
    expect(file.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(prisma.payrollPayslip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ updatedBy: 'emp-1' }),
      }),
    );
    expect(pdf.render).toHaveBeenCalledWith(
      expect.objectContaining({
        netPay: 17667.18,
        normalOtHours: 8,
        bankAccountMasked: '••••4412',
      }),
    );

    payslip.downloadedAt = new Date();
    prisma.payrollPayslip.update.mockClear();
    permissions.hasPermission.mockResolvedValue(true);
    await service.getPdf('p1', { userId: 'hr-1', companyId: 'co-1' });
    expect(prisma.payrollPayslip.update).not.toHaveBeenCalled();
  });

  it('builds a zip containing one named pdf per payslip', async () => {
    const { service, prisma, pdf } = harness();
    prisma.payrollRun.findFirst.mockResolvedValue({
      id: 'run-1',
      status: 'GM_APPROVED',
      month: 10,
      year: 2026,
      runNumber: 'PR-2026-10',
    });
    prisma.payrollPayslip.findMany.mockResolvedValue([
      {
        id: 'p1',
        employeeId: 'emp-1',
        generatedAt: new Date('2026-10-05T00:00:00.000Z'),
        releasedAt: null,
        downloadedAt: null,
        run: { id: 'run-1', runNumber: 'PR-2026-10', month: 10, year: 2026 },
        employee: {
          firstName: 'Armias',
          lastName: 'Bekele',
          chineseName: null,
          employeeId: 'EMP-014',
          department: null,
          engineeringDiscipline: null,
        },
        entry: {
          payrollDays: dec(30),
          basicSalary: dec(1),
          earnedSalary: dec(1),
          normalOtHours: dec(0),
          eveningOtHours: dec(0),
          sundayOtHours: dec(0),
          holidayOtHours: dec(0),
          normalOtPay: dec(0),
          eveningOtPay: dec(0),
          sundayOtPay: dec(0),
          holidayOtPay: dec(0),
          transportAllowance: dec(0),
          monthlyBonus: dec(0),
          bonusTopUp: dec(0),
          bonusTopUpReason: null,
          contractNetBonus: dec(0),
          netTopUp: dec(0),
          netTopUpReason: null,
          grossIncome: dec(1),
          pensionEmployee: dec(0),
          pensionEmployer: dec(0),
          incomeTax: dec(0),
          totalDeductions: dec(0),
          netPay: dec(1),
          bankName: null,
          bankAccountNumber: null,
          contract: { pensionApplicable: false },
        },
      },
    ]);
    pdf.render.mockResolvedValue(Buffer.from('%PDF-payslip'));

    const file = await service.getZip('run-1', ctx);
    expect(file.filename).toBe('Payslips_2026_10_PR-2026-10.zip');
    expect(file.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(file.buffer.toString('utf8')).toContain(
      'Payslip_2026_10_EMP-014_Armias_Bekele.pdf',
    );
  });
});
