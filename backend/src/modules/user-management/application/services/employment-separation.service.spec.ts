import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EmploymentSeparationService } from './employment-separation.service';

const COMPANY = 'company-1';
const HR = 'hr-1';
const EMP = 'emp-1';
const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

interface State {
  user: { id: string; companyId: string; firstName: string; lastName: string; employmentDate: Date; employmentStatus: string; isActive: boolean; createdAt: Date; deletedAt: null };
  periods: Array<Record<string, any>>;
  contract: { id: string; contractNumber: string; startDate: Date; endDate: Date | null; terminatedAt: Date | null; terminationReason: string | null; status: string; deletedAt: null };
  sessions: number;
  runs: Array<{ id: string; runNumber: string; month: number; year: number; status: string; createdBy: string; attendanceSnapshotStale: boolean; deletedAt: null }>;
  /** Handover: pending tiers on the leaver, posts they lead, requests they submitted. */
  tiers?: Array<{ id: string; label: string; request: { id: string; requestNumber: string; title: string } }>;
  departments?: Array<{ id: string; name: string; leaderUserId?: string }>;
  submitted?: Array<{ id: string; requestNumber: string; title: string; status: string }>;
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    user: { id: EMP, companyId: COMPANY, firstName: 'Abebe', lastName: 'Kebede', employmentDate: d(2025, 1, 1), employmentStatus: 'ACTIVE', isActive: true, createdAt: d(2025, 1, 1), deletedAt: null },
    periods: [{ id: 'p1', userId: EMP, companyId: COMPANY, startDate: d(2025, 1, 1), endDate: null, separationType: null, separationReason: null, separatedById: null, separatedAt: null, separationContractId: null, separationContractPrevEndDate: null, loginDisabledBySeparation: false }],
    contract: { id: 'c1', contractNumber: 'EC-0001', startDate: d(2025, 1, 1), endDate: null, terminatedAt: null, terminationReason: null, status: 'ACTIVE', deletedAt: null },
    sessions: 2,
    runs: [],
    ...overrides,
  };
}

/** Minimal in-memory Prisma covering the calls the service makes. */
function makePrisma(state: State) {
  const runMatches = (where: any) => (r: State['runs'][number]) => {
    if (where.status?.in && !where.status.in.includes(r.status)) return false;
    if (where.status?.not && r.status === where.status.not) return false;
    if (where.month !== undefined && r.month !== where.month) return false;
    if (where.year !== undefined && typeof where.year === 'number' && r.year !== where.year) return false;
    if (where.OR) {
      return where.OR.some((c: any) =>
        c.year?.gt !== undefined ? r.year > c.year.gt : r.year === c.year && r.month >= c.month.gte,
      );
    }
    return true;
  };
  const prisma: any = {
    user: {
      findFirst: jest.fn(async () => ({ ...state.user })),
      update: jest.fn(async ({ data }: any) => Object.assign(state.user, data)),
    },
    employmentPeriod: {
      findFirst: jest.fn(async ({ where }: any) => {
        const list = [...state.periods].sort((a, b) => b.startDate - a.startDate);
        const found = list.find((p) => (where.endDate === null ? p.endDate === null : true));
        return found ? { ...found } : null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.endDate?.lt) {
          return state.periods
            .filter((p) => p.endDate && p.endDate < where.endDate.lt && p.separationType)
            .map((p) => ({ ...p, user: { ...state.user } }));
        }
        return [...state.periods].sort((a, b) => b.startDate - a.startDate).map((p) => ({ ...p }));
      }),
      count: jest.fn(async () => 0),
      create: jest.fn(),
      update: jest.fn(async ({ where, data }: any) => ({
        ...Object.assign(state.periods.find((p) => p.id === where.id)!, data),
      })),
    },
    employeeContract: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.status && where.status !== state.contract.status ? null : { ...state.contract },
      ),
      update: jest.fn(async ({ data }: any) => Object.assign(state.contract, data)),
    },
    userSession: { deleteMany: jest.fn(async () => { state.sessions = 0; }) },
    payrollRun: {
      findMany: jest.fn(async ({ where }: any) => state.runs.filter(runMatches(where))),
      updateMany: jest.fn(async ({ where, data }: any) => {
        state.runs.filter(runMatches(where)).forEach((r) => Object.assign(r, data));
      }),
    },
    approvalTier: {
      count: jest.fn(async () => 3),
      findMany: jest.fn(async ({ where }: any) => (where?.approverId ? state.tiers ?? [] : [])),
      findFirst: jest.fn(async () => ({ id: 'submitted-tier-1' })),
    },
    approvalRequest: {
      count: jest.fn(async () => 1),
      findMany: jest.fn(async ({ where }: any) => (where?.requestedBy ? state.submitted ?? [] : [])),
    },
    department: {
      findMany: jest.fn(async () => state.departments ?? []),
      updateMany: jest.fn(async ({ where, data }: any) => {
        (state.departments ?? [])
          .filter((dep) => dep.id === where.id)
          .forEach((dep) => Object.assign(dep, data));
      }),
    },
    discipline: { findMany: jest.fn(async () => []), updateMany: jest.fn() },
    // Approver roles held by the leaver (none) vs. notification recipients.
    userRole: {
      findMany: jest.fn(async ({ where }: any) =>
        where?.userId === EMP ? [] : [{ userId: 'hr-manager' }],
      ),
    },
    inactivePeriod: { findFirst: jest.fn(async () => null) },
  };
  prisma.user.findMany = jest.fn(async ({ where }: any) =>
    (where?.id?.in ?? []).map((id: string) => ({ id, isActive: true, employmentStatus: 'ACTIVE' })),
  );
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return prisma;
}

function makeService(state: State) {
  const prisma = makePrisma(state);
  const audit = { create: jest.fn(async () => undefined), buildFromRequestContext: (x: any) => x };
  const notifications = { send: jest.fn(async () => ({ emailQueued: false })) };
  const reassignment = { reassignTier: jest.fn(async () => undefined) };
  const approvals = { rejectTier: jest.fn(async () => undefined) };
  const service = new EmploymentSeparationService(
    prisma,
    audit as any,
    notifications as any,
    reassignment as any,
    approvals as any,
  );
  return { service, prisma, audit, notifications, reassignment, approvals };
}

const ctx = { companyId: COMPANY, userId: HR };

describe('EmploymentSeparationService', () => {
  it('back-dated separation takes effect now: period closed, contract terminated, login off, sessions revoked', async () => {
    const state = makeState();
    const { service, audit } = makeService(state);
    await service.separate(ctx, EMP, {
      leavingDate: '2026-08-20',
      separationType: 'RESIGNATION',
      reason: 'Moved abroad',
    });
    expect(state.periods[0]).toMatchObject({
      endDate: d(2026, 8, 20),
      separationType: 'RESIGNATION',
      separationReason: 'Moved abroad',
      separatedById: HR,
      separationContractId: 'c1',
      separationContractPrevEndDate: null,
      loginDisabledBySeparation: true,
    });
    expect(state.contract).toMatchObject({
      endDate: d(2026, 8, 20),
      terminatedAt: d(2026, 8, 20),
      status: 'TERMINATED',
    });
    expect(state.user).toMatchObject({ employmentStatus: 'SEPARATED', isActive: false });
    expect(state.sessions).toBe(0);
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'separate' }));
  });

  it('future-dated separation keeps employment and login until the date passes', async () => {
    const state = makeState();
    const { service } = makeService(state);
    await service.separate(ctx, EMP, {
      leavingDate: '2099-12-31',
      separationType: 'CONTRACT_END',
      reason: 'Fixed term ends',
    });
    expect(state.periods[0].endDate).toEqual(d(2099, 12, 31));
    expect(state.periods[0].loginDisabledBySeparation).toBe(false);
    expect(state.contract).toMatchObject({ endDate: d(2099, 12, 31), terminatedAt: d(2099, 12, 31), status: 'ACTIVE' });
    expect(state.user).toMatchObject({ employmentStatus: 'ACTIVE', isActive: true });
    expect(state.sessions).toBe(2);
  });

  it('never extends a contract: endDate = min(endDate, leaving date)', async () => {
    const state = makeState();
    state.contract.endDate = d(2026, 6, 30);
    state.contract.startDate = d(2026, 1, 1);
    const { service } = makeService(state);
    await service.separate(ctx, EMP, { leavingDate: '2026-06-30', separationType: 'OTHER', reason: 'x' });
    expect(state.contract.endDate).toEqual(d(2026, 6, 30));
  });

  it('back-dated into a paid payroll month needs confirmation, then marks the run stale and notifies payroll', async () => {
    const state = makeState({
      runs: [{ id: 'run-aug', runNumber: 'PR-2026-08', month: 8, year: 2026, status: 'PAID', createdBy: 'payroll-officer', attendanceSnapshotStale: false, deletedAt: null }],
    });
    const { service, notifications } = makeService(state);
    const input = { leavingDate: '2026-08-20', separationType: 'TERMINATION' as const, reason: 'Misconduct' };

    await expect(service.separate(ctx, EMP, input)).rejects.toBeInstanceOf(ConflictException);
    expect(state.periods[0].endDate).toBeNull();

    await service.separate(ctx, EMP, { ...input, confirmLockedPayroll: true });
    expect(state.runs[0].attendanceSnapshotStale).toBe(true);
    const recipients = (notifications.send.mock.calls as any[]).map((c) => c[1].recipientId).sort();
    expect(recipients).toEqual(['hr-manager', 'payroll-officer']);
  });

  it('rejects a leaving date before the employment start', async () => {
    const { service } = makeService(makeState());
    await expect(
      service.separate(ctx, EMP, { leavingDate: '2024-12-31', separationType: 'OTHER', reason: 'x' }),
    ).rejects.toThrow('cannot be before the employment start');
  });

  it('cancel restores the period, the contract end date, employment status and login', async () => {
    const state = makeState();
    state.contract.endDate = d(2026, 12, 31);
    const { service } = makeService(state);
    await service.separate(ctx, EMP, { leavingDate: '2026-08-20', separationType: 'RESIGNATION', reason: 'x' });
    expect(state.user.isActive).toBe(false);

    await service.cancel(ctx, EMP);
    expect(state.periods[0]).toMatchObject({ endDate: null, separationType: null, loginDisabledBySeparation: false });
    expect(state.contract).toMatchObject({ endDate: d(2026, 12, 31), terminatedAt: null, status: 'ACTIVE' });
    expect(state.user).toMatchObject({ employmentStatus: 'ACTIVE', isActive: true });
  });

  it('cancel is blocked once the leaving date is inside approved/paid payroll', async () => {
    const state = makeState();
    const { service } = makeService(state);
    await service.separate(ctx, EMP, { leavingDate: '2026-08-20', separationType: 'RESIGNATION', reason: 'x' });
    state.runs.push({ id: 'run-aug', runNumber: 'PR-2026-08', month: 8, year: 2026, status: 'GM_APPROVED', createdBy: HR, attendanceSnapshotStale: false, deletedAt: null });
    await expect(service.cancel(ctx, EMP)).rejects.toThrow('Cannot cancel');
  });

  it('updateLeavingDate moves the leaving date and keeps the contract in sync', async () => {
    const state = makeState();
    state.contract.endDate = d(2026, 12, 31);
    const { service, audit } = makeService(state);
    await service.separate(ctx, EMP, {
      leavingDate: '2026-08-20',
      separationType: 'RESIGNATION',
      reason: 'x',
    });

    await service.updateLeavingDate(ctx, EMP, { leavingDate: '2026-09-15' });

    expect(state.periods[0].endDate).toEqual(d(2026, 9, 15));
    expect(state.contract).toMatchObject({
      endDate: d(2026, 9, 15),
      terminatedAt: d(2026, 9, 15),
      status: 'TERMINATED',
    });
    expect(state.user).toMatchObject({ employmentStatus: 'SEPARATED', isActive: false });
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update_leaving_date' }),
    );
  });

  it('updateLeavingDate to a future date restores login until the date passes', async () => {
    const state = makeState();
    const { service } = makeService(state);
    await service.separate(ctx, EMP, {
      leavingDate: '2026-08-20',
      separationType: 'RESIGNATION',
      reason: 'x',
    });
    expect(state.user.isActive).toBe(false);

    await service.updateLeavingDate(ctx, EMP, { leavingDate: '2099-06-01' });

    expect(state.periods[0]).toMatchObject({
      endDate: d(2099, 6, 1),
      loginDisabledBySeparation: false,
    });
    expect(state.contract.status).toBe('ACTIVE');
    expect(state.user).toMatchObject({ employmentStatus: 'ACTIVE', isActive: true });
  });

  it('preview reports pending approvals and submitted requests', async () => {
    const { service } = makeService(makeState());
    const preview = await service.preview(ctx, EMP, '2026-08-20');
    expect(preview.pendingApprovalTiers.count).toBe(3);
    expect(preview.pendingSubmittedRequests.count).toBe(1);
    expect(preview.effectiveImmediately).toBe(true);
    expect(preview.activeContract?.contractNumber).toBe('EC-0001');
  });

  describe('daily job', () => {
    it('applies a future separation once its date has passed, and is idempotent', async () => {
      const state = makeState();
      const { service, audit } = makeService(state);
      await service.separate(ctx, EMP, { leavingDate: '2099-01-10', separationType: 'RESIGNATION', reason: 'x' });
      expect(state.user.isActive).toBe(true);

      const onLeavingDay = await service.processDueSeparations(new Date('2099-01-10T08:00:00Z'));
      expect(onLeavingDay.processed).toBe(0);
      expect(state.user.isActive).toBe(true);

      const dayAfter = await service.processDueSeparations(new Date('2099-01-11T00:10:00+03:00'));
      expect(dayAfter.processed).toBe(1);
      expect(state.user).toMatchObject({ isActive: false, employmentStatus: 'SEPARATED' });
      expect(state.contract.status).toBe('TERMINATED');
      expect(state.sessions).toBe(0);
      expect(state.periods[0].loginDisabledBySeparation).toBe(true);
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'separation_effective', source: 'SYSTEM_JOB' }),
      );

      const again = await service.processDueSeparations(new Date('2099-01-12T00:10:00+03:00'));
      expect(again.processed).toBe(0);
    });
  });

  describe('handover', () => {
    const handoverState = (): State =>
      makeState({
        tiers: [{ id: 'tier-1', label: 'Department Head', request: { id: 'req-1', requestNumber: 'AR-1', title: 'Leave' } }],
        departments: [{ id: 'dep-1', name: 'Finance', leaderUserId: EMP }],
        submitted: [{ id: 'req-9', requestNumber: 'AR-9', title: 'Overtime', status: 'IN_PROGRESS' }],
      });
    const input = { leavingDate: '2026-12-31', separationType: 'RESIGNATION' as const, reason: 'Moving abroad' };

    it('preview lists every tier, leadership post and submitted request to decide', async () => {
      const { service } = makeService(handoverState());
      const preview = await service.preview(ctx, EMP, '2026-12-31');
      expect(preview.handover.tiers.map((t) => t.tierId)).toEqual(['tier-1']);
      expect(preview.handover.leadership).toEqual([{ kind: 'DEPARTMENT_LEADER', id: 'dep-1', name: 'Finance' }]);
      expect(preview.handover.submittedRequests.map((r) => r.requestId)).toEqual(['req-9']);
    });

    it('confirm is refused until the handover is complete', async () => {
      const state = handoverState();
      const { service } = makeService(state);
      const error = await service.separate(ctx, EMP, input).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        error: 'HANDOVER_REQUIRED',
        details: {
          code: 'HANDOVER_REQUIRED',
          missing: { tiers: ['tier-1'], leadership: ['DEPARTMENT_LEADER:dep-1'], submittedRequests: ['req-9'] },
        },
      });
      expect(state.periods[0].endDate).toBeNull();

      // A skip needs a real reason.
      await expect(
        service.separate(ctx, EMP, {
          ...input,
          handover: {
            tiers: [{ id: 'tier-1', skipReason: 'x' }],
            leadership: [{ kind: 'DEPARTMENT_LEADER', id: 'dep-1', replacementId: 'emp-2' }],
            submittedRequests: [{ requestId: 'req-9', action: 'KEEP' }],
          },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('applies the handover: tier reassigned, leader replaced, request cancelled', async () => {
      const state = handoverState();
      const { service, reassignment, approvals } = makeService(state);
      await service.separate(ctx, EMP, {
        ...input,
        handover: {
          tiers: [{ id: 'tier-1', replacementId: 'emp-2' }],
          leadership: [{ kind: 'DEPARTMENT_LEADER', id: 'dep-1', replacementId: 'emp-3' }],
          submittedRequests: [{ requestId: 'req-9', action: 'CANCEL' }],
        },
      });
      expect(reassignment.reassignTier).toHaveBeenCalledWith(
        ctx,
        'tier-1',
        'emp-2',
        expect.stringContaining('Handover'),
        { skipPermissionCheck: true },
      );
      expect(state.departments![0].leaderUserId).toBe('emp-3');
      expect(approvals.rejectTier).toHaveBeenCalledWith(
        'req-9',
        'submitted-tier-1',
        HR,
        expect.stringContaining('Cancelled at separation'),
        { bypassApproverCheck: true },
      );
      expect(state.periods[0].endDate).toEqual(d(2026, 12, 31));
    });

    it('the leaver cannot be their own replacement', async () => {
      const { service } = makeService(handoverState());
      await expect(
        service.separate(ctx, EMP, {
          ...input,
          handover: {
            tiers: [{ id: 'tier-1', replacementId: EMP }],
            leadership: [{ kind: 'DEPARTMENT_LEADER', id: 'dep-1', skipReason: 'Post is being abolished' }],
            submittedRequests: [{ requestId: 'req-9', action: 'KEEP' }],
          },
        }),
      ).rejects.toThrow('own replacement');
    });
  });
});
