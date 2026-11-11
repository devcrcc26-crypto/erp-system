import { describe, expect, it, jest } from '@jest/globals';
import { NotificationService } from './notification.service';

function makeService(recipient: { id: string; isActive: boolean; email: string | null }) {
  const prisma: any = {
    user: { findFirst: jest.fn(async () => recipient) },
    notificationPreference: { findFirst: jest.fn(async () => null) },
    notificationTemplate: { findFirst: jest.fn(async () => null) },
    notification: { create: jest.fn(async () => ({ id: 'n1' })) },
  };
  const config = { get: jest.fn(() => undefined) };
  const mail = { send: jest.fn() };
  const service = new NotificationService(prisma, {} as any, mail as any, config as any);
  return { service, prisma, mail };
}

const ctx = { companyId: 'company-1', userId: 'actor' };
const dto = {
  recipientId: 'u1',
  eventType: 'payroll.run_submitted',
  subject: 'Subject',
  body: 'Body',
};

describe('NotificationService - inactive recipients', () => {
  it('skips in-app and email for a login-disabled recipient and counts it', async () => {
    const { service, prisma, mail } = makeService({ id: 'u1', isActive: false, email: 'a@b.c' });
    const result = await service.send(ctx, dto);
    expect(result).toEqual({ emailQueued: false });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.notificationPreference.findFirst).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(service.skippedInactiveRecipients).toBe(1);
  });

  it('still reaches active recipients', async () => {
    const { service, prisma } = makeService({ id: 'u1', isActive: true, email: null });
    await service.send(ctx, { ...dto, channel: 'IN_APP' });
    expect(prisma.notificationPreference.findFirst).toHaveBeenCalled();
    expect(service.skippedInactiveRecipients).toBe(0);
  });
});
