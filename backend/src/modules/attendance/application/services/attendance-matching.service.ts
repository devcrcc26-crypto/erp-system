import { Injectable } from '@nestjs/common';
import Fuse from 'fuse.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import { loadEmploymentWindows } from '../../../../shared/employment/employment-window.util';
import type {
  AttendanceDailyRaw,
  AttendanceRawRow,
} from '../../utils/attendance-excel.parser';

export type MatchConfidence =
  | 'IDENTITY'
  | 'ID_MATCH'
  | 'NAME_HIGH'
  | 'NAME_REVIEW'
  | 'MAPPED_INACTIVE'
  | 'MANUAL'
  | 'NO_MATCH'
  | 'IGNORED';

export interface AttendanceMatchResult {
  attendanceName: string;
  attendanceId: string;
  matchedEmployeeId: string | null;
  matchedEmployeeName: string | null;
  matchedEmployeeErpId: string | null;
  confidence: MatchConfidence;
  score: number | null;
  /** Stored identity used for this row, when applicable. */
  identityId: string | null;
  /** HR-facing note (e.g. reused machine ID with a new name). */
  matchNote: string | null;
  data: {
    payableHours: number;
    dailyData: AttendanceDailyRaw[];
  };
}

type EmployeeMatchCandidate = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  isActive: boolean;
  fullName: string;
};

type StoredIdentity = {
  id: string;
  attendanceId: string;
  attendanceName: string;
  status: 'MAPPED' | 'IGNORED';
  userId: string | null;
};

type EmployeeRecord = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  isActive: boolean;
};

/**
 * Builds "First Middle Last", omitting blank middle names.
 */
export function formatEmployeeFullName(employee: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  return [employee.firstName, employee.middleName, employee.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
}

/**
 * Normalises a Deli attendance name for identity lookup/storage.
 */
export function normaliseAttendanceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Normalises a Deli attendance device id (`''` / null → `'-'`).
 */
export function normaliseAttendanceId(attendanceId: string | null | undefined): string {
  const trimmed = attendanceId?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : '-';
}

/**
 * Matches Deli attendance rows to ERP employees:
 * exact identity (id+name, or name-only when id is blank) →
 * reused machine-id conflict → exact employeeId → fuzzy full name.
 */
@Injectable()
export class AttendanceMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches parsed attendance rows against identities and employees.
   * Read-only - does not write to the database.
   */
  async matchRows(
    rows: AttendanceRawRow[],
    companyId: string,
    /** Import month: a leaver whose login is already off still matches for days they worked. */
    period?: { month: number; year: number },
  ): Promise<AttendanceMatchResult[]> {
    const [identities, employees] = await Promise.all([
      this.prisma.attendanceIdentity.findMany({
        where: { companyId, deletedAt: null },
        select: {
          id: true,
          attendanceId: true,
          attendanceName: true,
          status: true,
          userId: true,
        },
      }),
      // Approver-only accounts are never matched (rows fall to NO_MATCH).
      this.prisma.user.findMany({
        where: hrProcessEmployeeWhere({ companyId, deletedAt: null }),
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          employeeId: true,
          isActive: true,
          employmentDate: true,
        },
      }),
    ]);

    if (period) {
      const inactive = employees.filter((e) => !e.isActive);
      const windows = await loadEmploymentWindows(
        this.prisma,
        inactive,
        period.month,
        period.year,
      );
      for (const employee of inactive) {
        const window = windows.get(employee.id);
        if (window?.fromPeriods && window.overlapsMonth) {
          employee.isActive = true;
        }
      }
    }

    const identityByKey = new Map<string, StoredIdentity>();
    /** Non-blank machine IDs → all stored identities sharing that ID. */
    const identitiesByAttendanceId = new Map<string, StoredIdentity[]>();
    for (const identity of identities) {
      const attendanceId = normaliseAttendanceId(identity.attendanceId);
      const attendanceName = normaliseAttendanceName(identity.attendanceName);
      const normalised: StoredIdentity = {
        ...identity,
        attendanceId,
        attendanceName,
      };
      identityByKey.set(
        this.identityKey(attendanceId, attendanceName),
        normalised,
      );
      if (attendanceId !== '-') {
        const list = identitiesByAttendanceId.get(attendanceId) ?? [];
        list.push(normalised);
        identitiesByAttendanceId.set(attendanceId, list);
      }
    }

    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const activeEmployees = employees.filter((employee) => employee.isActive);

    const nameList: EmployeeMatchCandidate[] = activeEmployees.map(
      (employee) => ({
        ...employee,
        fullName: formatEmployeeFullName(employee),
      }),
    );

    const fuseByName = new Fuse(nameList, {
      keys: ['fullName'],
      threshold: 0.35,
      includeScore: true,
      shouldSort: true,
    });

    return rows.map((row) =>
      this.matchOne(
        row,
        identityByKey,
        identitiesByAttendanceId,
        employeeById,
        activeEmployees,
        fuseByName,
      ),
    );
  }

  private identityKey(attendanceId: string, attendanceName: string): string {
    return `${normaliseAttendanceId(attendanceId)}::${normaliseAttendanceName(attendanceName)}`;
  }

  private matchOne(
    row: AttendanceRawRow,
    identityByKey: Map<string, StoredIdentity>,
    identitiesByAttendanceId: Map<string, StoredIdentity[]>,
    employeeById: Map<string, EmployeeRecord>,
    activeEmployees: EmployeeRecord[],
    fuseByName: Fuse<EmployeeMatchCandidate>,
  ): AttendanceMatchResult {
    const data = {
      payableHours: row.payableHours,
      dailyData: row.dailyData,
    };
    const attendanceId = normaliseAttendanceId(row.attendanceId);
    const attendanceName = normaliseAttendanceName(row.attendanceName);

    const exactIdentity = identityByKey.get(
      this.identityKey(attendanceId, attendanceName),
    );
    if (exactIdentity) {
      return this.fromExactIdentity(
        exactIdentity,
        attendanceId,
        attendanceName,
        employeeById,
        data,
      );
    }

    // Same machine ID, different name → Needs Review (do not auto IGNORED / IDENTITY).
    if (attendanceId !== '-') {
      const sameIdIdentities = identitiesByAttendanceId.get(attendanceId) ?? [];
      const nameMismatch = sameIdIdentities.find(
        (identity) =>
          normaliseAttendanceName(identity.attendanceName) !== attendanceName,
      );
      if (nameMismatch) {
        return this.fromReusedMachineId(
          nameMismatch,
          attendanceId,
          attendanceName,
          employeeById,
          data,
        );
      }
    }

    if (attendanceId !== '-') {
      const found = activeEmployees.find(
        (employee) => employee.employeeId === attendanceId,
      );
      if (found) {
        return {
          attendanceName,
          attendanceId,
          matchedEmployeeId: found.id,
          matchedEmployeeName: formatEmployeeFullName(found),
          matchedEmployeeErpId: found.employeeId,
          confidence: 'ID_MATCH',
          score: 100,
          identityId: null,
          matchNote: null,
          data,
        };
      }
    }

    const results = fuseByName.search(attendanceName);
    if (results.length > 0) {
      const best = results[0];
      const score = Math.round((1 - (best.score ?? 1)) * 100);

      if (score >= 90) {
        return {
          attendanceName,
          attendanceId,
          matchedEmployeeId: best.item.id,
          matchedEmployeeName: best.item.fullName,
          matchedEmployeeErpId: best.item.employeeId,
          confidence: 'NAME_HIGH',
          score,
          identityId: null,
          matchNote: null,
          data,
        };
      }

      if (score >= 70) {
        return {
          attendanceName,
          attendanceId,
          matchedEmployeeId: best.item.id,
          matchedEmployeeName: best.item.fullName,
          matchedEmployeeErpId: best.item.employeeId,
          confidence: 'NAME_REVIEW',
          score,
          identityId: null,
          matchNote: null,
          data,
        };
      }
    }

    return {
      attendanceName,
      attendanceId,
      matchedEmployeeId: null,
      matchedEmployeeName: null,
      matchedEmployeeErpId: null,
      confidence: 'NO_MATCH',
      score: null,
      identityId: null,
      matchNote: null,
      data,
    };
  }

  private fromExactIdentity(
    identity: StoredIdentity,
    attendanceId: string,
    attendanceName: string,
    employeeById: Map<string, EmployeeRecord>,
    data: AttendanceMatchResult['data'],
  ): AttendanceMatchResult {
    if (identity.status === 'IGNORED') {
      return {
        attendanceName,
        attendanceId,
        matchedEmployeeId: null,
        matchedEmployeeName: null,
        matchedEmployeeErpId: null,
        confidence: 'IGNORED',
        score: null,
        identityId: identity.id,
        matchNote: null,
        data,
      };
    }

    if (identity.userId) {
      const mapped = employeeById.get(identity.userId);
      if (mapped) {
        return {
          attendanceName,
          attendanceId,
          matchedEmployeeId: mapped.id,
          matchedEmployeeName: formatEmployeeFullName(mapped),
          matchedEmployeeErpId: mapped.employeeId,
          confidence: mapped.isActive ? 'IDENTITY' : 'MAPPED_INACTIVE',
          score: mapped.isActive ? 100 : null,
          identityId: identity.id,
          matchNote: null,
          data,
        };
      }
    }

    return {
      attendanceName,
      attendanceId,
      matchedEmployeeId: null,
      matchedEmployeeName: null,
      matchedEmployeeErpId: null,
      confidence: 'NO_MATCH',
      score: null,
      identityId: identity.id,
      matchNote: null,
      data,
    };
  }

  private fromReusedMachineId(
    prior: StoredIdentity,
    attendanceId: string,
    attendanceName: string,
    employeeById: Map<string, EmployeeRecord>,
    data: AttendanceMatchResult['data'],
  ): AttendanceMatchResult {
    const oldName = prior.attendanceName;
    if (prior.status === 'IGNORED') {
      return {
        attendanceName,
        attendanceId,
        matchedEmployeeId: null,
        matchedEmployeeName: null,
        matchedEmployeeErpId: null,
        confidence: 'NAME_REVIEW',
        score: null,
        identityId: prior.id,
        matchNote: `Machine ID ${attendanceId} was previously ignored for ${oldName}`,
        data,
      };
    }

    const mapped = prior.userId ? employeeById.get(prior.userId) : undefined;
    return {
      attendanceName,
      attendanceId,
      matchedEmployeeId: mapped?.id ?? null,
      matchedEmployeeName: mapped ? formatEmployeeFullName(mapped) : null,
      matchedEmployeeErpId: mapped?.employeeId ?? null,
      confidence: 'NAME_REVIEW',
      score: null,
      identityId: prior.id,
      matchNote: `Machine ID ${attendanceId} was previously mapped for ${oldName}`,
      data,
    };
  }
}
