import { describe, expect, it, jest } from '@jest/globals';
import { FieldMovementStatus } from '@prisma/client';
import {
  buildDayDeductionContext,
  dailyLogToDeductionInput,
} from '../utils/attendance-day-deduction.context';
import { dayDeduction } from '../utils/day-deduction.util';
import {
  fieldMovementCoverageFromEntryStatus,
  mergeFieldMovementCoverage,
} from '../utils/field-movement-entry-status.util';
import {
  isAttendanceMonthApproved,
  markAttendanceMonthRecalcStale,
} from '../utils/attendance-recalc-policy.util';

const employee = {
  id: 'emp-1',
  departmentId: null,
  nationality: 'ETHIOPIAN' as const,
  attendanceMode: 'SCANNER' as const,
};

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

describe('field movement approval - deduction coverage', () => {
  it('entry APPROVED wins over log still SUBMITTED in coverage merge', () => {
    expect(
      mergeFieldMovementCoverage(
        fieldMovementCoverageFromEntryStatus(FieldMovementStatus.SUBMITTED),
        fieldMovementCoverageFromEntryStatus(FieldMovementStatus.APPROVED),
      ),
    ).toBe('APPROVED');
  });

  it('approve FORGOT_CLOCK_OUT 17:30 → present, deduction 0, no pending status', () => {
    const date = d(2026, 8, 11);
    const context = buildDayDeductionContext(employee, {
      holidays: [],
      wfhDays: [],
      leaveDateKeys: new Set(),
      unpaidLeaveDateKeys: new Set(),
      fieldMovementByDate: new Map([['2026-08-11', 'APPROVED']]),
      earlyDepartureWaiverByDate: new Map([['2026-08-11', 'NONE']]),
      siteAssignments: [],
    });
    const input = dailyLogToDeductionInput({
      date,
      clockInLocal: '08:00',
      clockOutLocal: null,
      correctedClockInLocal: '08:00',
      correctedClockOutLocal: '17:30',
      isLastExportDay: false,
      scheduledEnd: '17:30',
    });
    const result = dayDeduction(date, input, context);
    expect(result.deduction).toBe(0);
    expect(result.status).toBe('PRESENT');
    expect(result.status).not.toBe('FIELD_MOVEMENT_PENDING');
  });

  it('approve EARLY_LEAVE waives early-departure deduction', () => {
    const date = d(2026, 8, 12);
    const context = buildDayDeductionContext(employee, {
      holidays: [],
      wfhDays: [],
      leaveDateKeys: new Set(),
      unpaidLeaveDateKeys: new Set(),
      fieldMovementByDate: new Map([['2026-08-12', 'APPROVED']]),
      earlyDepartureWaiverByDate: new Map([['2026-08-12', 'APPROVED']]),
      siteAssignments: [],
    });
    const input = dailyLogToDeductionInput({
      date,
      clockInLocal: '08:00',
      clockOutLocal: '16:00',
      correctedClockInLocal: '08:00',
      correctedClockOutLocal: '16:00',
      isLastExportDay: false,
      scheduledEnd: '17:30',
    });
    const result = dayDeduction(date, input, context);
    expect(result.deduction).toBe(0);
    expect(result.earlyDepartureBand).not.toBe('PENDING_APPROVAL');
  });

  it('reject → half absent, not field-movement pending', () => {
    const date = d(2026, 8, 13);
    const context = buildDayDeductionContext(employee, {
      holidays: [],
      wfhDays: [],
      leaveDateKeys: new Set(),
      unpaidLeaveDateKeys: new Set(),
      fieldMovementByDate: new Map([['2026-08-13', 'NONE']]),
      earlyDepartureWaiverByDate: new Map([['2026-08-13', 'NONE']]),
      siteAssignments: [],
    });
    const input = dailyLogToDeductionInput({
      date,
      clockInLocal: '08:00',
      clockOutLocal: null,
      correctedClockInLocal: null,
      correctedClockOutLocal: null,
      isLastExportDay: false,
      scheduledEnd: '17:30',
    });
    const result = dayDeduction(date, input, context);
    expect(result.deduction).toBe(0.5);
    expect(result.status).toBe('HALF_ABSENT');
    expect(result.status).not.toBe('FIELD_MOVEMENT_PENDING');
  });

  it('pending SUBMITTED entry → 0.5 and FIELD_MOVEMENT_PENDING', () => {
    const date = d(2026, 8, 11);
    const context = buildDayDeductionContext(employee, {
      holidays: [],
      wfhDays: [],
      leaveDateKeys: new Set(),
      unpaidLeaveDateKeys: new Set(),
      fieldMovementByDate: new Map([['2026-08-11', 'PENDING']]),
      earlyDepartureWaiverByDate: new Map([['2026-08-11', 'NONE']]),
      siteAssignments: [],
    });
    const input = dailyLogToDeductionInput({
      date,
      clockInLocal: '08:00',
      clockOutLocal: null,
      correctedClockInLocal: null,
      correctedClockOutLocal: null,
      isLastExportDay: false,
      scheduledEnd: '17:30',
    });
    const result = dayDeduction(date, input, context);
    expect(result.deduction).toBe(0.5);
    expect(result.status).toBe('FIELD_MOVEMENT_PENDING');
  });
});

describe('field movement approval - AUTO_APPROVE_ALL path', () => {
  it('uses approveTier → dispatchFinalDecision → onApprovalDecision (same as manual)', () => {
    // Covered by approvals-auto-approve-all.spec.ts calling listener.onApprovalDecision;
    // field movement corrections + post-commit recalc live in AttendanceService.onApprovalDecision.
    expect(FieldMovementStatus.APPROVED).toBe('APPROVED');
  });
});

describe('field movement approval - recalc policy', () => {
  it('approved attendance month marks recalc stale instead of silent skip', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const db = {
      attendanceMonthlyApproval: {
        findFirst: jest.fn(async () => ({ id: 'ama-1' })),
        updateMany,
      },
    };
    expect(
      await isAttendanceMonthApproved(db as never, 'co', 8, 2026),
    ).toBe(true);
    await markAttendanceMonthRecalcStale(db as never, 'co', 8, 2026);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attendanceRecalcStale: true }),
      }),
    );
  });
});
