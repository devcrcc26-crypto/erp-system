import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EmployeeContractStatus, EmployeeContractType } from '@prisma/client';
import { NotificationService } from '../../../../notifications/application/services/notification.service';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EmployeeContractCronService } from '../employee-contract-cron.service';

describe('EmployeeContractCronService', () => {
  const companyId = 'company-1';
  const hrOfficerId = 'hr-officer-1';
  const contractId = 'contract-1';
  const today = new Date('2026-08-22T12:00:00.000Z');
  const endDate = new Date('2026-09-16T00:00:00.000Z');

  const expiringContract = {
    id: contractId,
    companyId,
    contractNumber: 'EC-0001',
    employeeId: 'employee-1',
    contractType: EmployeeContractType.FIXED_TERM,
    status: EmployeeContractStatus.ACTIVE,
    signedAt: new Date('2026-01-01T00:00:00.000Z'),
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate,
    terminatedAt: null,
    terminationReason: null,
    notes: null,
    basicSalary: null,
    transportationAllowance: null,
    monthlyBonus: null,
    probationEndDate: null,
    governedBy: null,
    lastWarnedAt: null as Date | null,
    attachmentFolderId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: 'admin-1',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedBy: 'admin-1',
    deletedAt: null,
    deletedBy: null,
    employee: {
      id: 'employee-1',
      firstName: 'Jane',
      lastName: 'Doe',
      companyId,
    },
  };

  let prisma: {
    employeeContract: {
      findMany: jest.Mock<() => Promise<(typeof expiringContract)[]>>;
      update: jest.Mock;
    };
    user: {
      findFirst: jest.Mock<() => Promise<{ id: string } | null>>;
      findMany: jest.Mock<() => Promise<{ id: string }[]>>;
    };
  };
  let notificationService: { send: jest.Mock };
  let service: EmployeeContractCronService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(today);

    prisma = {
      employeeContract: {
        findMany: jest
          .fn<() => Promise<typeof expiringContract[]>>()
          .mockResolvedValue([expiringContract]),
        update: jest
          .fn<() => Promise<typeof expiringContract>>()
          .mockResolvedValue(expiringContract),
      },
      user: {
        findFirst: jest
          .fn<() => Promise<{ id: string } | null>>()
          .mockResolvedValue({ id: hrOfficerId }),
        findMany: jest
          .fn<() => Promise<{ id: string }[]>>()
          .mockResolvedValue([]),
      },
    };
    notificationService = {
      send: jest
        .fn<() => Promise<{ inAppId: string }>>()
        .mockResolvedValue({ inAppId: 'notification-1' }),
    };

    service = new EmployeeContractCronService(
      prisma as unknown as PrismaService,
      notificationService as unknown as NotificationService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('notifies the HR Officer and updates lastWarnedAt for a contract ending within 3 months', async () => {
    await service.checkExpiringContracts();

    expect(notificationService.send).toHaveBeenCalledWith(
      { companyId, userId: hrOfficerId },
      expect.objectContaining({
        recipientId: hrOfficerId,
        eventType: 'employee_contract.expiry_warning',
        channel: 'IN_APP',
        subject: 'Contract Expiry Warning - Jane Doe',
        body: expect.stringContaining('expires in 25 days on 2026-09-16'),
        link: `/hr/employee-contract/${contractId}`,
      }),
    );

    expect(prisma.employeeContract.update).toHaveBeenCalledWith({
      where: { id: contractId },
      data: { lastWarnedAt: new Date('2026-08-22T00:00:00.000Z') },
    });
  });

  it('queries active contracts ending between today and 3 calendar months ahead', async () => {
    await service.checkExpiringContracts();

    expect(prisma.employeeContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: EmployeeContractStatus.ACTIVE,
          endDate: {
            gte: new Date('2026-08-22T00:00:00.000Z'),
            lte: new Date('2026-11-22T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('also notifies every Local HR Manager, once each', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'local-hr-1' },
      { id: hrOfficerId },
      { id: 'local-hr-2' },
    ]);

    await service.checkExpiringContracts();

    const recipients = notificationService.send.mock.calls.map(
      (call) => (call[1] as { recipientId: string }).recipientId,
    );
    expect(recipients).toEqual([hrOfficerId, 'local-hr-1', 'local-hr-2']);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userRoles: {
            some: expect.objectContaining({
              role: expect.objectContaining({ name: 'Local HR Manager' }),
            }),
          },
        }),
      }),
    );
    expect(prisma.employeeContract.update).toHaveBeenCalledTimes(1);
  });

  it('still notifies Local HR Managers when the company has no HR Officer', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([{ id: 'local-hr-1' }]);

    await service.checkExpiringContracts();

    expect(notificationService.send).toHaveBeenCalledTimes(1);
    expect(notificationService.send).toHaveBeenCalledWith(
      { companyId, userId: 'local-hr-1' },
      expect.objectContaining({ recipientId: 'local-hr-1' }),
    );
    expect(prisma.employeeContract.update).toHaveBeenCalledTimes(1);
  });

  it('skips the contract when there is nobody to notify', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await service.checkExpiringContracts();

    expect(notificationService.send).not.toHaveBeenCalled();
    expect(prisma.employeeContract.update).not.toHaveBeenCalled();
  });

  it('says "today" when the contract ends today', async () => {
    prisma.employeeContract.findMany.mockResolvedValue([
      { ...expiringContract, endDate: new Date('2026-08-22T00:00:00.000Z') },
    ]);

    await service.checkExpiringContracts();

    expect(notificationService.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('expires today on 2026-08-22'),
      }),
    );
  });

  it('skips duplicate notifications when warned within the last 7 days', async () => {
    prisma.employeeContract.findMany = jest
      .fn<() => Promise<typeof expiringContract[]>>()
      .mockResolvedValue([
        {
          ...expiringContract,
          lastWarnedAt: new Date('2026-08-20T00:00:00.000Z'),
        },
      ]);

    await service.checkExpiringContracts();

    expect(notificationService.send).not.toHaveBeenCalled();
    expect(prisma.employeeContract.update).not.toHaveBeenCalled();
  });
});
