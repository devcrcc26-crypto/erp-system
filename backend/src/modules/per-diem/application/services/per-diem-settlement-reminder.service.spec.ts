import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PerDiemStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { NotificationService } from '../../../notifications/application/services/notification.service';
import { PerDiemSettlementReminderService } from './per-diem-settlement-reminder.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000201';
const ADVANCE_ID = '00000000-0000-4000-8000-000000000301';

describe('PerDiemSettlementReminderService', () => {
  let service: PerDiemSettlementReminderService;
  let prisma: {
    perDiemRequest: {
      findMany: jest.Mock<() => Promise<unknown[]>>;
      updateMany: jest.Mock<() => Promise<{ count: number }>>;
    };
  };
  let notifications: {
    send: jest.Mock<() => Promise<{ emailQueued: boolean }>>;
  };

  beforeEach(() => {
    prisma = {
      perDiemRequest: {
        findMany: jest.fn<() => Promise<unknown[]>>(),
        updateMany: jest
          .fn<() => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
      },
    };
    notifications = {
      send: jest
        .fn<() => Promise<{ emailQueued: boolean }>>()
        .mockResolvedValue({ emailQueued: false }),
    };
    service = new PerDiemSettlementReminderService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationService,
    );
  });

  it('sends reminder for paid unsettled advance ended 8 days ago', async () => {
    const now = new Date('2026-10-05T08:00:00.000Z');
    const endDate = new Date('2026-09-27T00:00:00.000Z');

    prisma.perDiemRequest.findMany.mockResolvedValue([
      {
        id: ADVANCE_ID,
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        destination: 'Adama Site',
        lastSettlementReminderAt: null,
        status: PerDiemStatus.APPROVED,
        endDate,
      },
    ]);

    const result = await service.sendDueReminders(now);

    expect(result.sent).toBe(1);
    expect(notifications.send).toHaveBeenCalledWith(
      { companyId: COMPANY_ID, userId: EMPLOYEE_ID },
      expect.objectContaining({
        recipientId: EMPLOYEE_ID,
        eventType: 'per_diem.settlement_reminder',
        subject: 'Please submit your per diem settlement for Adama Site.',
      }),
    );
    expect(prisma.perDiemRequest.updateMany).toHaveBeenCalled();
  });

  it('does not repeat within 7 days', async () => {
    const now = new Date('2026-10-05T08:00:00.000Z');
    prisma.perDiemRequest.findMany.mockResolvedValue([]);

    const result = await service.sendDueReminders(now);

    expect(result.sent).toBe(0);
    expect(notifications.send).not.toHaveBeenCalled();
    expect(prisma.perDiemRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { lastSettlementReminderAt: null },
            {
              lastSettlementReminderAt: {
                lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          ]),
        }),
      }),
    );
  });
});
