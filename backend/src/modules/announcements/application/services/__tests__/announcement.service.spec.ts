import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../../shared/permissions/permission.service';
import type { PermissionFlags } from '../../../../../shared/permissions/permission.types';
import type { IStorageService } from '../../../../../shared/storage/storage.interface';
import type { ResendEmailService } from '../../../../../shared/mail/resend-email.service';
import { NotificationService } from '../../../../notifications/application/services/notification.service';
import { TemplateRendererService } from '../../../../notifications/application/services/template-renderer.service';
import { sanitizeAnnouncementMarkdown } from '../../utils/announcement-markdown.util';
import { AnnouncementAudienceService } from '../announcement-audience.service';
import { AnnouncementService } from '../announcement.service';
import { FakePrisma, FakeUser } from './announcement-fake-prisma';

const COMPANY = '00000000-0000-4000-8000-000000000002';
const DEPT_A = '00000000-0000-4000-8000-0000000000a1';
const DEPT_B = '00000000-0000-4000-8000-0000000000b1';
const HR_MANAGER = '00000000-0000-4000-8000-000000000101';
const HR_ASSISTANT = '00000000-0000-4000-8000-000000000102';
const NOW = new Date('2026-10-06T09:00:00.000Z');

const NONE: PermissionFlags = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};
const MANAGER: PermissionFlags = { ...NONE, canCreate: true, canEdit: true, canApprove: true, canExport: true };
const DRAFTS: PermissionFlags = { ...NONE, canCreate: true, canEdit: true };

function user(id: string, overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id,
    companyId: COMPANY,
    firstName: `User ${id.slice(-3)}`,
    lastName: 'Test',
    departmentId: null,
    engineeringDisciplineId: null,
    isActive: true,
    deletedAt: null,
    email: `${id.slice(-3)}@company.local`,
    preferredLanguage: null,
    ...overrides,
  };
}

function setup(options: { flags?: Record<string, PermissionFlags>; emailDisabled?: boolean } = {}) {
  const prisma = new FakePrisma();
  prisma.users = [
    user(HR_MANAGER),
    user(HR_ASSISTANT),
    user('00000000-0000-4000-8000-000000000201', { departmentId: DEPT_A }),
    user('00000000-0000-4000-8000-000000000202', { departmentId: DEPT_A, isActive: false }),
    user('00000000-0000-4000-8000-000000000203', { departmentId: DEPT_A, deletedAt: new Date('2026-01-01') }),
    user('00000000-0000-4000-8000-000000000204', { departmentId: DEPT_B }),
    user('00000000-0000-4000-8000-000000000205', { departmentId: DEPT_A }),
  ];

  const flags = options.flags ?? { [HR_MANAGER]: MANAGER, [HR_ASSISTANT]: DRAFTS };
  const permissions = {
    getUserModulePermissions: jest.fn(async (userId: string) => flags[userId] ?? NONE),
    getUserRoleNames: jest.fn(async () => ['HR Manager']),
  };

  const resend = { send: jest.fn(async () => true) };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'EMAIL_DISABLED') return options.emailDisabled === true;
      if (key === 'SEED_MODE') return false;
      if (key === 'FRONTEND_URL') return 'http://localhost:3000';
      return undefined;
    }),
  };
  // Real NotificationService over the fake database, so EMAIL_DISABLED and
  // the in-app row are exercised end to end.
  const notifications = new NotificationService(
    prisma as unknown as PrismaService,
    new TemplateRendererService(),
    resend as unknown as ResendEmailService,
    config as unknown as ConfigService,
  );
  const sendSpy = jest.spyOn(notifications, 'send');

  const service = new AnnouncementService(
    prisma as unknown as PrismaService,
    new AnnouncementAudienceService(prisma as unknown as PrismaService),
    notifications,
    permissions as unknown as PermissionService,
    config as unknown as ConfigService,
    { upload: jest.fn(), getPresignedDownloadUrl: jest.fn() } as unknown as IStorageService,
  );
  return { prisma, service, sendSpy, resend };
}

const hr = { companyId: COMPANY, userId: HR_MANAGER };
const assistant = { companyId: COMPANY, userId: HR_ASSISTANT };
const asUser = (userId: string) => ({ companyId: COMPANY, userId });

describe('AnnouncementService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('publishing to DEPARTMENTS creates recipients only for active members of those departments', async () => {
    const draft = await ctx.service.create(hr, {
      title: 'Department A safety briefing',
      body: 'Meet at the gate at **8:00**.',
      audienceScope: 'DEPARTMENTS',
      departmentIds: [DEPT_A],
    });

    await ctx.service.publish(hr, draft.id, {}, NOW);

    const recipientIds = ctx.prisma.recipients.map((r) => r.userId).sort();
    expect(recipientIds).toEqual([
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000205',
    ]);
    const stored = ctx.prisma.announcements.find((a) => a.id === draft.id);
    expect(stored?.status).toBe('PUBLISHED');
    expect(ctx.prisma.notifications).toHaveLength(2);
    expect(ctx.prisma.notifications[0]).toMatchObject({
      channel: 'IN_APP',
      subject: '📢 Department A safety briefing',
      link: `/announcements/${draft.id}`,
    });
  });

  it('publishes a scheduled announcement when due and notifies recipients once', async () => {
    const draft = await ctx.service.create(hr, {
      title: 'Holiday schedule',
      body: 'The office is closed on Friday.',
      audienceScope: 'DEPARTMENTS',
      departmentIds: [DEPT_A],
    });
    const scheduled = await ctx.service.publish(
      hr,
      draft.id,
      { publishAt: '2026-10-06T12:00:00.000Z' },
      NOW,
    );
    expect(scheduled.status).toBe('SCHEDULED');
    expect(ctx.prisma.recipients).toHaveLength(0);

    // Not yet due.
    expect(await ctx.service.publishDue(new Date('2026-10-06T11:55:00.000Z'))).toEqual({ published: 0 });

    // Due: published once even when two runs overlap.
    const due = new Date('2026-10-06T12:00:30.000Z');
    const [first, second] = await Promise.all([
      ctx.service.publishDue(due),
      ctx.service.publishDue(due),
    ]);
    expect(first.published + second.published).toBe(1);
    expect(await ctx.service.publishDue(new Date('2026-10-06T12:05:00.000Z'))).toEqual({ published: 0 });

    expect(ctx.prisma.recipients).toHaveLength(2);
    expect(ctx.sendSpy).toHaveBeenCalledTimes(2);
    expect(ctx.prisma.announcements[0]?.status).toBe('PUBLISHED');
  });

  it('opening marks it read; acknowledging records acknowledgedAt', async () => {
    const employee = '00000000-0000-4000-8000-000000000201';
    const draft = await ctx.service.create(hr, {
      title: 'New leave policy',
      body: 'Please read the attached policy.',
      requireAcknowledgement: true,
    });
    await ctx.service.publish(hr, draft.id, {}, NOW);

    const opened = new Date('2026-10-06T10:00:00.000Z');
    const read = await ctx.service.markRead(asUser(employee), draft.id, opened);
    expect(read.readAt).toEqual(opened);
    expect(read.acknowledgedAt).toBeNull();

    const later = new Date('2026-10-06T10:05:00.000Z');
    const ack = await ctx.service.acknowledge(asUser(employee), draft.id, later);
    expect(ack.acknowledgedAt).toEqual(later);
    expect(ack.readAt).toEqual(opened);

    const row = ctx.prisma.recipients.find((r) => r.userId === employee);
    expect(row).toMatchObject({ readAt: opened, acknowledgedAt: later });
  });

  it("returns 403 when an employee fetches an announcement they didn't receive", async () => {
    const draft = await ctx.service.create(hr, {
      title: 'Department B only',
      body: 'Site visit on Monday.',
      audienceScope: 'DEPARTMENTS',
      departmentIds: [DEPT_B],
    });
    await ctx.service.publish(hr, draft.id, {}, NOW);

    const outsider = asUser('00000000-0000-4000-8000-000000000201');
    await expect(ctx.service.getMine(outsider, draft.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctx.service.markRead(outsider, draft.id)).rejects.toBeInstanceOf(ForbiddenException);

    const insider = asUser('00000000-0000-4000-8000-000000000204');
    await expect(ctx.service.getMine(insider, draft.id)).resolves.toMatchObject({ id: draft.id });
  });

  it('lets an HR Assistant create a draft but not publish it', async () => {
    const draft = await ctx.service.create(assistant, {
      title: 'Draft from HR Assistant',
      body: 'Waiting for review.',
    });
    expect(draft.status).toBe('DRAFT');

    await expect(ctx.service.publish(assistant, draft.id, {}, NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ctx.prisma.announcements[0]?.status).toBe('DRAFT');
    expect(ctx.prisma.recipients).toHaveLength(0);
    expect(ctx.sendSpy).not.toHaveBeenCalled();
  });

  it('sanitises Markdown containing <script>', async () => {
    const malicious =
      'Hello **team**<script>alert("x")</script>\n<img src=x onerror=alert(1)>\n[click](javascript:alert(1))';
    const draft = await ctx.service.create(hr, { title: 'Sanitised', body: malicious });

    const stored = String(ctx.prisma.announcements.find((a) => a.id === draft.id)?.body);
    expect(stored).not.toMatch(/<script|<\/script>|alert\("x"\)|<img|onerror|javascript:/i);
    expect(stored).toContain('Hello **team**');
    expect(stored).toContain('[click](#)');
    expect(sanitizeAnnouncementMarkdown('<SCRIPT src="x.js">')).toBe('');
    expect(sanitizeAnnouncementMarkdown('a < b and 3 > 2')).toBe('a < b and 3 > 2');
  });

  it('"Remind unread" notifies only recipients who have not read it', async () => {
    const draft = await ctx.service.create(hr, {
      title: 'Read me',
      body: 'Important update.',
      audienceScope: 'DEPARTMENTS',
      departmentIds: [DEPT_A],
    });
    await ctx.service.publish(hr, draft.id, {}, NOW);
    await ctx.service.markRead(asUser('00000000-0000-4000-8000-000000000201'), draft.id, NOW);
    ctx.sendSpy.mockClear();

    const result = await ctx.service.remindUnread(hr, draft.id);

    expect(result).toEqual({ notified: 1 });
    expect(ctx.sendSpy).toHaveBeenCalledTimes(1);
    expect(ctx.sendSpy.mock.calls[0]?.[1]).toMatchObject({
      recipientId: '00000000-0000-4000-8000-000000000205',
      eventType: 'announcement.reminder',
    });
  });

  it('stops showing the banner for an expired URGENT announcement', async () => {
    const employee = asUser('00000000-0000-4000-8000-000000000201');
    const draft = await ctx.service.create(hr, {
      title: 'Power outage tonight',
      body: 'Save your work before 18:00.',
      priority: 'URGENT',
      requireAcknowledgement: true,
      expiresAt: '2026-10-06T18:00:00.000Z',
    });
    await ctx.service.publish(hr, draft.id, {}, NOW);

    const before = await ctx.service.summary(employee, new Date('2026-10-06T12:00:00.000Z'));
    expect(before.urgent.map((item) => item.id)).toEqual([draft.id]);
    expect(before.pendingAcknowledgement.map((item) => item.id)).toEqual([draft.id]);

    const after = await ctx.service.summary(employee, new Date('2026-10-06T18:00:01.000Z'));
    expect(after.urgent).toEqual([]);
    expect(after.pendingAcknowledgement).toEqual([]);
    expect(after.latest).toEqual([]);
    // Still in the list and history.
    const list = await ctx.service.listMine(employee, { page: 1, limit: 20, filter: 'all', type: 'COMPANY' });
    expect(list.data.map((item) => item.id)).toEqual([draft.id]);
  });

  it('editing the message of an acknowledged post asks everyone to acknowledge again', async () => {
    const reader = asUser('00000000-0000-4000-8000-000000000201');
    const draft = await ctx.service.create(hr, {
      title: 'Leave policy 2027',
      body: 'Annual leave is 16 days.',
      requireAcknowledgement: true,
      audienceScope: 'DEPARTMENTS',
      departmentIds: [DEPT_A],
    });
    await ctx.service.publish(hr, draft.id, {}, NOW);
    await ctx.service.acknowledge(reader, draft.id, NOW);
    ctx.sendSpy.mockClear();

    const result = await ctx.service.update(hr, draft.id, { body: 'Annual leave is 18 days.' });

    expect(result.acknowledgementsReset).toBe(1);
    expect(ctx.prisma.recipients.every((r) => r.acknowledgedAt === null && r.readAt === null)).toBe(true);
    expect(result.contentEditedAt).toBeTruthy();
    expect(ctx.sendSpy).toHaveBeenCalledTimes(2);
    expect(ctx.sendSpy.mock.calls[0]?.[1]).toMatchObject({
      eventType: 'announcement.updated',
      subject: '📢 Updated: Leave policy 2027',
      body: 'This announcement was updated - please review and acknowledge again.',
    });
    const summary = await ctx.service.summary(reader, NOW);
    expect(summary.unreadCount).toBe(1);
  });

  it('keeps acknowledgements when only the title changes', async () => {
    const reader = asUser('00000000-0000-4000-8000-000000000201');
    const draft = await ctx.service.create(hr, {
      title: 'Leave polcy 2027',
      body: 'Annual leave is 16 days.',
      requireAcknowledgement: true,
    });
    await ctx.service.publish(hr, draft.id, {}, NOW);
    await ctx.service.acknowledge(reader, draft.id, NOW);
    ctx.sendSpy.mockClear();

    const result = await ctx.service.update(hr, draft.id, { title: 'Leave policy 2027' });

    expect(result.acknowledgementsReset).toBe(0);
    expect(ctx.prisma.recipients.find((r) => r.userId === reader.userId)?.acknowledgedAt).toEqual(NOW);
    expect(ctx.sendSpy).not.toHaveBeenCalled();
  });

  it('with EMAIL_DISABLED=true sends the in-app notification but no email', async () => {
    ctx = setup({ emailDisabled: true });
    const draft = await ctx.service.create(hr, {
      title: 'Email me too',
      body: 'This one also goes by email.',
      sendEmail: true,
      audienceScope: 'DEPARTMENTS',
      departmentIds: [DEPT_A],
    });

    await ctx.service.publish(hr, draft.id, {}, NOW);

    expect(ctx.prisma.notifications.filter((n) => n.channel === 'IN_APP')).toHaveLength(2);
    expect(ctx.prisma.notifications.filter((n) => n.channel === 'EMAIL')).toHaveLength(0);
    expect(ctx.resend.send).not.toHaveBeenCalled();
    // The email was requested (sendEmail) and suppressed by NotificationService.
    expect(ctx.sendSpy.mock.calls.some((call) => call[1].channel === 'EMAIL')).toBe(true);
  });
});
