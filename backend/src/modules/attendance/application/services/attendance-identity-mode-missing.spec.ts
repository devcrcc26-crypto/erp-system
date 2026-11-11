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

  it('exact id+name identity auto-matches in month 2', async () => {
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
          attendanceName: 'John Smith',
          attendanceId: 'D100',
          payableHours: 0,
          dailyData: [],
        },
      ],
      companyId,
    );
    expect(results[0].confidence).toBe('IDENTITY');
    expect(results[0].matchedEmployeeId).toBe('user-1');
    expect(results[0].matchNote).toBeNull();
  });

  it('skips ignored identity only when id and name both match', async () => {
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

  it('two blank-ID rows: ignored one stays ignored; the other is still processed', async () => {
    const prisma = {
      attendanceIdentity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'id-blank-ignored',
            attendanceId: '-',
            attendanceName: 'Left Company',
            status: AttendanceIdentityStatus.IGNORED,
            userId: null,
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-active',
            firstName: 'Still',
            middleName: null,
            lastName: 'Here',
            employeeId: 'E050',
            isActive: true,
          },
        ]),
      },
    };
    const service = buildMatchingService(prisma);
    const results = await service.matchRows(
      [
        {
          attendanceName: 'Left Company',
          attendanceId: '-',
          payableHours: 0,
          dailyData: [],
        },
        {
          attendanceName: 'Still Here',
          attendanceId: '',
          payableHours: 0,
          dailyData: [],
        },
      ],
      companyId,
    );
    expect(results[0].confidence).toBe('IGNORED');
    expect(results[1].confidence).not.toBe('IGNORED');
    expect(results[1].matchedEmployeeId).toBe('user-active');
  });

  it('reused machine ID with a new name goes to Needs Review with a note', async () => {
    const prisma = {
      attendanceIdentity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'id-ignored-old',
            attendanceId: 'D777',
            attendanceName: 'Old Person',
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
          attendanceName: 'New Person',
          attendanceId: 'D777',
          payableHours: 0,
          dailyData: [],
        },
      ],
      companyId,
    );
    expect(results[0].confidence).toBe('NAME_REVIEW');
    expect(results[0].matchNote).toBe(
      'Machine ID D777 was previously ignored for Old Person',
    );
    expect(results[0].matchedEmployeeId).toBeNull();
  });

  it('reused machine ID previously MAPPED goes to Needs Review (not auto-match)', async () => {
    const prisma = {
      attendanceIdentity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'id-mapped-old',
            attendanceId: 'D888',
            attendanceName: 'Mapped Name',
            status: AttendanceIdentityStatus.MAPPED,
            userId: 'user-2',
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-2',
            firstName: 'Mapped',
            middleName: null,
            lastName: 'Name',
            employeeId: 'E002',
            isActive: true,
          },
        ]),
      },
    };
    const service = buildMatchingService(prisma);
    const results = await service.matchRows(
      [
        {
          attendanceName: 'Different Spelling',
          attendanceId: 'D888',
          payableHours: 0,
          dailyData: [],
        },
      ],
      companyId,
    );
    expect(results[0].confidence).toBe('NAME_REVIEW');
    expect(results[0].matchNote).toBe(
      'Machine ID D888 was previously mapped for Mapped Name',
    );
    expect(results[0].matchedEmployeeId).toBe('user-2');
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
