import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  clearPayrollAttendanceSnapshotStale,
  isAttendanceMonthApproved,
  isPayrollMonthLocked,
  markAttendanceMonthRecalcStale,
  markPayrollAttendanceSnapshotStale,
} from './attendance-recalc-policy.util';

describe('attendance-recalc-policy.util', () => {
  const db = {
    payrollRun: {
      findFirst: jest.fn<() => Promise<{ id: string } | null>>(),
      updateMany: jest.fn<() => Promise<{ count: number }>>(),
    },
    attendanceMonthlyApproval: {
      findFirst: jest.fn<() => Promise<{ id: string } | null>>(),
      updateMany: jest.fn<() => Promise<{ count: number }>>(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('isPayrollMonthLocked → true when approved run exists', async () => {
    db.payrollRun.findFirst.mockResolvedValue({ id: 'run-1' });
    const locked = await isPayrollMonthLocked(db as never, 'co-1', 8, 2026);
    expect(locked).toBe(true);
  });

  it('markPayrollAttendanceSnapshotStale sets flag on any run for the month', async () => {
    db.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    await markPayrollAttendanceSnapshotStale(db as never, 'co-1', 8, 2026);
    expect(db.payrollRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'co-1',
          month: 8,
          year: 2026,
          deletedAt: null,
        }),
        data: { attendanceSnapshotStale: true },
      }),
    );
    expect(db.payrollRun.updateMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        where: expect.objectContaining({ status: expect.anything() }),
      }),
    );
  });

  it('clearPayrollAttendanceSnapshotStale clears the flag', async () => {
    db.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    await clearPayrollAttendanceSnapshotStale(db as never, 'run-1');
    expect(db.payrollRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { attendanceSnapshotStale: false },
      }),
    );
  });

  it('markAttendanceMonthRecalcStale only when status APPROVED', async () => {
    db.attendanceMonthlyApproval.updateMany.mockResolvedValue({ count: 1 });
    await markAttendanceMonthRecalcStale(db as never, 'co-1', 8, 2026);
    expect(db.attendanceMonthlyApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'APPROVED' }),
        data: { attendanceRecalcStale: true },
      }),
    );
  });

  it('isAttendanceMonthApproved → true when APPROVED row exists', async () => {
    db.attendanceMonthlyApproval.findFirst.mockResolvedValue({ id: 'a1' });
    await expect(
      isAttendanceMonthApproved(db as never, 'co-1', 8, 2026),
    ).resolves.toBe(true);
  });
});
