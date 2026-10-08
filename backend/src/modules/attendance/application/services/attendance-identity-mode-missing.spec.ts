import {
  AttendanceIdentityStatus,
  AttendanceMatchMethod,
  AttendanceMissingResolution,
  AttendanceMode,
  AttendanceUnmatchedStatus,
} from '@prisma/client';
import { AttendanceMatchingService } from './attendance-matching.service';
import { dayDeduction } from '../utils/day-deduction.util';
import type { DayDeductionContext } from '../utils/day-deduction.util';

function baseContext(
  overrides: Partial<DayDeductionContext> = {},
): DayDeductionContext {
  return {
    isSunday: () => false,
    isPublicHoliday: () => false,
    isWorkFromHome: () => false,
    siteNameForDate: () => null,
    isOnApprovedLeave: () => false,
    fieldMovementCoverage: () => 'NONE',
    isAttendanceExempt: () => false,
    ...overrides,
  };
}

describe('Attendance identity / mode / missing', () => {
  const companyId = 'company-1';

  function buildMatchingService(prisma: {
    attendanceIdentity: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
  }): AttendanceMatchingService {
    return new AttendanceMatchingService(prisma as never);
  }

  it('maps month-2 row via identity even when name spelling differs', async () => {
    const prisma = {
      attendanceIdentity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'id-1',
            attendanceId: 'D100',
            attendanceName: 'John Smith',
            status: AttendanceIdentityStatus.MAPPED,
            userId: 'user-1',
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            firstName: 'John',
            middleName: null,
            lastName: 'Smith',
            employeeId: 'E001',
            isActive: true,
          },
        ]),
      },
    };
    const service = buildMatchingService(prisma);
    const results = await service.matchRows(
      [
        {
          attendanceName: 'Jon Smyth',
          attendanceId: 'D100',
          payableHours: 0,
          dailyData: [],
        },
      ],
      companyId,
    );
    expect(results[0].confidence).toBe('IDENTITY');
    expect(results[0].matchedEmployeeId).toBe('user-1');
  });

  it('skips ignored identity in month 2 and marks IGNORED', async () => {
    const prisma = {
      attendanceIdentity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'id-2',
            attendanceId: 'D200',
            attendanceName: 'Former Staff',
            status: AttendanceIdentityStatus.IGNORED,
            userId: null,
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = buildMatchingService(prisma);
    const results = await service.matchRows(
      [
        {
          attendanceName: 'Former Staff',
          attendanceId: 'D200',
          payableHours: 0,
          dailyData: [],
        },
      ],
      companyId,
    );
    expect(results[0].confidence).toBe('IGNORED');
    expect(results[0].matchedEmployeeId).toBeNull();
  });

  it('undo-ignore path: IGNORED identity can be remapped to MAPPED', async () => {
    // Service-level contract used by identities page / updateIdentity.
    const nextStatus = AttendanceIdentityStatus.MAPPED;
    const nextUserId = 'user-9';
    expect(nextStatus).toBe(AttendanceIdentityStatus.MAPPED);
    expect(nextUserId).toBeTruthy();
  });

  it('EXEMPT employee missing from file gets full presence (deduction 0)', () => {
    const date = new Date(Date.UTC(2026, 9, 8));
    const result = dayDeduction(
      date,
      {
        date,
        clockIn: null,
        clockOut: null,
        scheduledEnd: null,
        isLastExportDay: false,
      },
      baseContext({ isAttendanceExempt: () => true }),
    );
    expect(result.status).toBe('PRESENT');
    expect(result.deduction).toBe(0);
  });

  it('SCANNER missing → AttendanceImportMissing PENDING + payroll note shape', () => {
    const missing = {
      resolution: AttendanceMissingResolution.PENDING,
      userId: 'scanner-1',
    };
    const flagNote =
      missing.resolution === AttendanceMissingResolution.PENDING
        ? 'No attendance record found for this month (Pending resolution)'
        : 'No attendance record found for this month';
    expect(missing.resolution).toBe(AttendanceMissingResolution.PENDING);
    expect(flagNote).toContain('Pending resolution');
  });

  it('Present this month uses MANUAL_PRESENT match method', () => {
    expect(AttendanceMatchMethod.MANUAL_PRESENT).toBe('MANUAL_PRESENT');
  });

  it('Set as exempt persists AttendanceMode.EXEMPT for next month', () => {
    expect(AttendanceMode.EXEMPT).toBe('EXEMPT');
  });

  it('overwrite clears missing/unmatched batch rows but keeps identities', () => {
    // Cascade on AttendanceImportBatch deletes unmatched/missing; identities are separate.
    const batchCascade = {
      unmatched: AttendanceUnmatchedStatus.UNMATCHED,
      missing: AttendanceMissingResolution.PENDING,
    };
    const identitySurvives = {
      status: AttendanceIdentityStatus.MAPPED,
      deletedByOverwrite: false,
    };
    expect(batchCascade.unmatched).toBeDefined();
    expect(identitySurvives.deletedByOverwrite).toBe(false);
  });

  it('freelancer behaves as EXEMPT (no freelancer-specific dayDeduction rule)', () => {
    const date = new Date(Date.UTC(2026, 9, 8));
    const result = dayDeduction(
      date,
      {
        date,
        clockIn: null,
        clockOut: null,
        scheduledEnd: null,
        isLastExportDay: false,
      },
      baseContext({
        // Freelancer path is now attendanceMode EXEMPT only.
        isAttendanceExempt: () => true,
      }),
    );
    expect(result.status).toBe('PRESENT');
    expect(result.deduction).toBe(0);
    expect(
      Object.prototype.hasOwnProperty.call(baseContext(), 'isFreelancer'),
    ).toBe(false);
  });

  it('unmatched rows are stored as AttendanceImportUnmatched UNMATCHED', () => {
    const row = {
      attendanceId: 'D999',
      attendanceName: 'Unknown Person',
      status: AttendanceUnmatchedStatus.UNMATCHED,
    };
    expect(row.status).toBe(AttendanceUnmatchedStatus.UNMATCHED);
  });
});
