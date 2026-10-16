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
      findMany: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findFirst: jest.Mock;
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

  it('notifies the HR Officer and updates lastWarnedAt for a contract expiring within 90 days', async () => {
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
