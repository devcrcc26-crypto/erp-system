import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { PayrollRunService } from './payroll-run.service';
import { employmentReviewFlag } from '../utils/payroll-employment-flag.util';
import {
  unusedLeaveDaysAtLeaving,
  type LeaveYearBalance,
} from '../utils/payroll-final-settlement.util';

const COMPANY = 'co-1';
const ctx = { companyId: COMPANY, userId: 'hr-manager' };

const entryRows = [
  { id: 'e1', flag: 'CONTRACT_ENDED_NOT_RENEWED', flagNote: 'Contract ended - renew, convert or separate; paid on the ended contract terms (ended 2026-09-30)', employee: { id: 'u1', employeeId: 'EM-001', firstName: 'Abebe', lastName: 'K' } },
  { id: 'e2', flag: 'NONE', flagNote: null, employee: { id: 'u2', employeeId: 'EM-002', firstName: 'Bethel', lastName: 'M' } },
  // Data-problem flag took the slot; the leaver note was appended.
  { id: 'e3', flag: 'MISSING_ATTENDANCE', flagNote: 'No attendance; Leaver final month - final settlement handled outside the system (leaving date 2026-10-20)', employee: { id: 'u3', employeeId: 'EM-003', firstName: 'Chala', lastName: 'T' } },
  { id: 'e4', flag: 'INACTIVE_IN_MONTH', flagNote: 'Inactive (Suspended) 10 day(s) - unpaid', employee: { id: 'u4', employeeId: 'EM-004', firstName: 'Dawit', lastName: 'A' } },
];

function makeService(status: 'REVIEWED' | 'SUBMITTED' | 'APPROVED', rows = entryRows) {
  const run = { id: 'run-1', companyId: COMPANY, runNumber: 'PR-2026-10', month: 10, year: 2026, status, createdBy: 'hr-1' };
  const prisma: any = {
    payrollRun: {
      findFirst: jest.fn(async () => ({ ...run })),
      update: jest.fn(async ({ data }: any) => Object.assign(run, data)),
    },
    payrollEntry: {
      findMany: jest.fn(async () => rows),
      groupBy: jest.fn(async () => []),
    },
    userRole: { findFirst: jest.fn(async () => ({ id: 'ur-1' })), findMany: jest.fn(async () => []) },
  };
  const audit = { create: jest.fn(async () => undefined), buildFromRequestContext: (x: any) => x };
  const permissions = {
    hasPermission: jest.fn(async () => true),
  };
  const service = new PayrollRunService(
    prisma,
    {} as never,
    { send: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    audit as never,
    permissions as never,
  );
  return { service, run, audit };
}

describe('payroll run employment review before submit / approve', () => {
  it('lists contract-ended, leaver (even under another flag) and inactive entries', async () => {
    const { service } = makeService('REVIEWED');
    const entries = await service.employmentReviewEntries('run-1', COMPANY);
    expect(entries.map((e) => [e.employeeCode, e.flag])).toEqual([
      ['EM-001', 'CONTRACT_ENDED_NOT_RENEWED'],
      ['EM-003', 'LEAVER_FINAL_MONTH'],
      ['EM-004', 'INACTIVE_IN_MONTH'],
    ]);
  });

  it('submit is refused until the N employees are confirmed; the confirmation is audited on the run', async () => {
    const { service, run, audit } = makeService('REVIEWED');
    const refused = await service.submitRun('run-1', ctx).catch((e) => e);
    expect(refused).toBeInstanceOf(BadRequestException);
    expect((refused as BadRequestException).getResponse()).toMatchObject({
      error: 'EMPLOYMENT_REVIEW_REQUIRED',
      details: { code: 'EMPLOYMENT_REVIEW_REQUIRED', count: 3 },
    });
    // A stale count (list changed since it was shown) is refused too.
    await expect(service.submitRun('run-1', ctx, { confirmEmploymentReview: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(run.status).toBe('REVIEWED');

    await service.submitRun('run-1', ctx, { confirmEmploymentReview: 3 });
    expect(run.status).toBe('SUBMITTED');
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'payroll',
        action: 'employment_review_confirmed',
        recordType: 'PayrollRun',
        recordId: 'run-1',
        afterValue: expect.objectContaining({ step: 'submit', count: 3 }),
      }),
    );
  });

  it('HR approve and GM approve need the same confirmation', async () => {
    const hr = makeService('SUBMITTED');
    await expect(hr.service.approveRun('run-1', ctx)).rejects.toBeInstanceOf(BadRequestException);
    await hr.service.approveRun('run-1', ctx, { confirmEmploymentReview: 3 });
    expect(hr.run.status).toBe('APPROVED');

    const gm = makeService('APPROVED');
    await expect(gm.service.gmApproveRun('run-1', ctx)).rejects.toBeInstanceOf(BadRequestException);
    await gm.service.gmApproveRun('run-1', ctx, { confirmEmploymentReview: 3 });
    expect(gm.run.status).toBe('GM_APPROVED');
    expect(gm.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ afterValue: expect.objectContaining({ step: 'gm_approve' }) }),
    );
  });

  it('no employment-flagged entries → no confirmation needed, nothing audited', async () => {
    const { service, run, audit } = makeService('REVIEWED', [entryRows[1]]);
    await service.submitRun('run-1', ctx);
    expect(run.status).toBe('SUBMITTED');
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('employmentReviewFlag ignores unrelated flags', () => {
    expect(employmentReviewFlag({ flag: 'MISSING_CONTRACT', flagNote: 'No contract' })).toBeNull();
    expect(employmentReviewFlag({ flag: 'LOGIN_DISABLED_STILL_EMPLOYED' })).toBe('LOGIN_DISABLED_STILL_EMPLOYED');
  });
});

describe('unused leave payout: prorateCurrentYear', () => {
  const balance: LeaveYearBalance = {
    entitled: 16,
    broughtForward: 2,
    used: 3,
    pending: 1,
    remaining: 14,
    yearStart: '2026-01-01',
    yearEnd: '2026-12-31',
  };

  it('prorated: leave earned to the leaving date, not the full year', () => {
    // 1 Jan → 1 Jul 2026 = 182 of 365 days → 16 × 182/365 = 7.98 earned; + 2 − 3 − 1 = 5.98
    expect(unusedLeaveDaysAtLeaving(balance, new Date(Date.UTC(2026, 6, 1)), true)).toBe(5.98);
  });

  it('not prorated: the full-year remaining balance', () => {
    expect(unusedLeaveDaysAtLeaving(balance, new Date(Date.UTC(2026, 6, 1)), false)).toBe(14);
  });

  it('never negative when more was taken than earned', () => {
    expect(unusedLeaveDaysAtLeaving({ ...balance, used: 10 }, new Date(Date.UTC(2026, 1, 1)), true)).toBe(0);
  });
});
