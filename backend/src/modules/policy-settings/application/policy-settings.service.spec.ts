import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PolicySettingsService } from './policy-settings.service';
import { todayInAddisUtc } from '../../../shared/employment/separation-dates.util';
import { policyMonthStart } from '../../../shared/policy/policy-reader.util';

const COMPANY = 'company-1';

interface Run {
  id: string;
  runNumber: string;
  month: number;
  year: number;
  status: string;
  attendanceSnapshotStale: boolean;
  policyReviewRequired: boolean;
  policyReviewNote: string | null;
}

function makeService(opts: { roles: string[]; runs?: Run[] }) {
  const settings: Array<Record<string, any>> = [];
  const runs = opts.runs ?? [];
  const prisma: any = {
    userRole: {
      findMany: jest.fn(async () => opts.roles.map((name) => ({ role: { name } }))),
    },
    user: {
      findMany: jest.fn(async () => [{ id: 'hr-manager', firstName: 'Hana', lastName: 'Manager' }]),
    },
    policySetting: {
      findMany: jest.fn(async () => settings.map((s) => ({ ...s }))),
      findFirst: jest.fn(async ({ where }: any) => {
        const later = settings
          .filter((s) => s.key === where.key && s.effectiveFrom > where.effectiveFrom.gt)
          .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
        return later[0] ? { effectiveFrom: later[0].effectiveFrom } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `ps-${settings.length + 1}`, createdAt: new Date(Date.now() + settings.length), ...data };
        settings.push(row);
        return row;
      }),
    },
    payrollRun: {
      findMany: jest.fn(async () => runs.map((r) => ({ ...r }))),
      updateMany: jest.fn(async ({ where, data }: any) => {
        runs.filter((r) => where.id.in.includes(r.id)).forEach((r) => Object.assign(r, data));
      }),
    },
  };
  const audit = { create: jest.fn(async () => undefined), buildFromRequestContext: (x: any) => x };
  const service = new PolicySettingsService(prisma, audit as any);
  return { service, prisma, settings, runs, audit };
}

const ctx = { companyId: COMPANY, userId: 'hr-manager' };
const run = (id: string, month: number, status: string): Run => ({
  id,
  runNumber: `PR-2026-${String(month).padStart(2, '0')}`,
  month,
  year: 2026,
  status,
  attendanceSnapshotStale: false,
  policyReviewRequired: false,
  policyReviewNote: null,
});

describe('PolicySettingsService', () => {
  describe('permissions', () => {
    it('HR Officer can view but not edit', async () => {
      const { service } = makeService({ roles: ['HR Officer'] });
      const list = await service.list(ctx);
      expect(list.canEdit).toBe(false);
      await expect(
        service.save(ctx, 'lateGraceMinutes', { value: 20, effectiveFrom: '2026-11-01', reason: 'New rule' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('HR Manager edits HR policies but not tax or pension', async () => {
      const { service } = makeService({ roles: ['HR Manager'] });
      await expect(
        service.save(ctx, 'lateGraceMinutes', { value: 20, effectiveFrom: '2026-11-01', reason: 'New rule' }),
      ).resolves.toMatchObject({ key: 'lateGraceMinutes' });
      await expect(
        service.save(ctx, 'pensionEmployeePct', { value: 8, effectiveFrom: '2026-11-01', reason: 'Law change' }),
      ).rejects.toThrow('Only a System Administrator');
      await expect(
        service.save(ctx, 'incomeTaxBrackets', {
          value: [{ upTo: null, rate: 10, deduction: 0 }],
          effectiveFrom: '2026-11-01',
          reason: 'Law change',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('System Administrator can edit tax and pension', async () => {
      const { service } = makeService({ roles: ['System Administrator'] });
      const saved = await service.save(ctx, 'pensionEmployeePct', {
        value: 8,
        effectiveFrom: '2026-11-01',
        reason: 'Pension proclamation',
      });
      expect(saved.scheduled).toEqual([{ effectiveFrom: '2026-11-01', value: 8 }]);
    });
  });

  describe('validation', () => {
    it('rejects bad dates, bad values, missing reasons and locked keys', async () => {
      const { service } = makeService({ roles: ['System Administrator'] });
      await expect(
        service.save(ctx, 'lateGraceMinutes', { value: 20, effectiveFrom: '2026-11-15', reason: 'x y z' }),
      ).rejects.toThrow('first day of a month');
      await expect(
        service.save(ctx, 'lateGraceMinutes', { value: -5, effectiveFrom: '2026-11-01', reason: 'x y z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.save(ctx, 'lateGraceMinutes', { value: 20, effectiveFrom: '2026-11-01', reason: '  ' }),
      ).rejects.toThrow('reason');
      await expect(
        service.save(ctx, 'monthDays', { value: 30, effectiveFrom: '2026-11-01', reason: 'x y z' }),
      ).rejects.toThrow('fixed');
      await expect(
        service.save(ctx, 'notAPolicy', { value: 1, effectiveFrom: '2026-11-01', reason: 'x y z' }),
      ).rejects.toThrow('Unknown policy');
      await expect(
        service.save(ctx, 'earlyDepartureDeductMinutes', { value: 10, effectiveFrom: '2026-11-01', reason: 'x y z' }),
      ).rejects.toThrow('longer than the early-departure grace');
    });
  });

  describe('existing payroll runs', () => {
    it('warns first, then marks open runs stale and approved/paid runs "review required" - no recalculation', async () => {
      const runs = [run('oct', 10, 'PAID'), run('nov', 11, 'DRAFT'), run('dec', 12, 'GM_APPROVED'), run('sep', 9, 'PAID')];
      const { service, prisma } = makeService({ roles: ['HR Manager'], runs });
      const input = { value: { regular: 2, night: 2, weekend: 2.5, holiday: 3 }, effectiveFrom: '2026-10-01', reason: 'New CBA' };

      const preview = await service.preview(ctx, 'multipliers', '2026-10-01');
      expect(preview.affectedRuns.map((r) => [r.id, r.effect])).toEqual([
        ['oct', 'REVIEW_REQUIRED'],
        ['nov', 'STALE'],
        ['dec', 'REVIEW_REQUIRED'],
      ]);

      await expect(service.save(ctx, 'multipliers', input)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.policySetting.create).not.toHaveBeenCalled();

      await service.save(ctx, 'multipliers', { ...input, confirmAffectedRuns: true });
      const byId = new Map(runs.map((r) => [r.id, r]));
      expect(byId.get('nov')!.attendanceSnapshotStale).toBe(true);
      expect(byId.get('oct')!.policyReviewRequired).toBe(true);
      expect(byId.get('dec')!.policyReviewNote).toContain('multipliers');
      expect(byId.get('sep')).toMatchObject({ attendanceSnapshotStale: false, policyReviewRequired: false });
    });

    it('a later existing version caps the affected range', async () => {
      const runs = [run('nov', 11, 'DRAFT'), run('dec', 12, 'DRAFT')];
      const { service } = makeService({ roles: ['HR Manager'], runs });
      await service.save(ctx, 'lateGraceMinutes', { value: 10, effectiveFrom: '2026-12-01', reason: 'Tighter', confirmAffectedRuns: true });
      const preview = await service.preview(ctx, 'lateGraceMinutes', '2026-11-01');
      expect(preview.affectedRuns.map((r) => r.id)).toEqual(['nov']);
    });

    it('separation settlement policies now affect runs (final settlement reads them)', async () => {
      const { service } = makeService({ roles: ['HR Manager'], runs: [run('nov', 11, 'PAID')] });
      const preview = await service.preview(ctx, 'noticePay', '2026-11-01');
      expect(preview.affectedRuns.map((r) => r.effect)).toEqual(['REVIEW_REQUIRED']);
    });
  });

  describe('history', () => {
    it('records who, when, why and old → new', async () => {
      const { service, audit } = makeService({ roles: ['HR Manager'] });
      await service.save(ctx, 'forgotToClockFlagThreshold', { value: 4, effectiveFrom: '2026-11-01', reason: 'Too many flags' });
      const item = await service.save(ctx, 'forgotToClockFlagThreshold', {
        value: 5,
        effectiveFrom: '2027-01-01',
        reason: 'Still too many',
      });
      expect(item.history).toHaveLength(2);
      expect(item.history[0]).toMatchObject({
        value: 5,
        previousValue: 4,
        reason: 'Still too many',
        effectiveFrom: '2027-01-01',
        createdBy: { id: 'hr-manager', name: 'Hana Manager' },
      });
      expect(item.history[1]).toMatchObject({ value: 4, previousValue: 3 });
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'policy_settings', beforeValue: { key: 'forgotToClockFlagThreshold', value: 4 } }),
      );
    });
  });

  describe('allowedInitiators (immediate)', () => {
    const value = {
      SITE_ASSIGNMENT: ['SUPERVISOR', 'DELEGATE'],
      WORK_FROM_HOME: ['SELF', 'SUPERVISOR', 'DELEGATE'],
      FLIGHT_APPLICATION: ['SELF'],
      BUSINESS_TRIP: ['SELF', 'SUPERVISOR', 'DELEGATE'],
    };

    it('System Administrator only', async () => {
      const { service } = makeService({ roles: ['HR Manager'] });
      await expect(
        service.save(ctx, 'allowedInitiators', { value, effectiveFrom: '2027-01-01', reason: 'Tighter flights' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('takes effect when saved: dated to the current month, no payroll runs touched, audited', async () => {
      const runs = [run('oct', 10, 'PAID')];
      const { service, settings, prisma, audit } = makeService({ roles: ['System Administrator'], runs });
      const saved = await service.save(ctx, 'allowedInitiators', {
        value,
        effectiveFrom: '2027-01-01',
        reason: 'Tighter flights',
      });
      expect(settings[0]!.effectiveFrom).toEqual(policyMonthStart(todayInAddisUtc()));
      expect(prisma.payrollRun.updateMany).not.toHaveBeenCalled();
      expect(saved.currentValue).toEqual(value);
      expect(saved.immediate).toBe(true);
      expect(audit.create).toHaveBeenCalled();
      await expect(service.preview(ctx, 'allowedInitiators', '2026-10-01')).resolves.toEqual({ affectedRuns: [] });
    });

    it('rejects empty, duplicate or unknown initiators', async () => {
      const { service } = makeService({ roles: ['System Administrator'] });
      for (const bad of [
        { ...value, FLIGHT_APPLICATION: [] },
        { ...value, FLIGHT_APPLICATION: ['SELF', 'SELF'] },
        { ...value, FLIGHT_APPLICATION: ['MANAGER'] },
        { ...value, LEAVE: ['SELF'] },
      ]) {
        await expect(
          service.save(ctx, 'allowedInitiators', { value: bad, effectiveFrom: '2026-10-01', reason: 'x y z' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });
});
