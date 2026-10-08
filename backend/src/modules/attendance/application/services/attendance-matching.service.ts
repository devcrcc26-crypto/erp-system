import { Injectable } from '@nestjs/common';
import Fuse from 'fuse.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
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
  /** True when a stored identity exists for this row. */
  identityId: string | null;
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
 * Matches Deli attendance rows to ERP employees:
 * stored identity → exact employeeId → fuzzy full name.
 */
@Injectable()
export class AttendanceMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches parsed attendance rows against identities and employees.
   * Read-only — does not write to the database.
   */
  async matchRows(
    rows: AttendanceRawRow[],
    companyId: string,
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
      this.prisma.user.findMany({
        where: { companyId, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          employeeId: true,
          isActive: true,
        },
      }),
    ]);

    const identityByKey = new Map<string, StoredIdentity>();
    /** Same device id under a different name spelling still resolves. */
    const identityByAttendanceId = new Map<string, StoredIdentity>();
    for (const identity of identities) {
      identityByKey.set(
        this.identityKey(identity.attendanceId, identity.attendanceName),
        identity,
      );
      if (identity.attendanceId && identity.attendanceId !== '-') {
        const existing = identityByAttendanceId.get(identity.attendanceId.trim());
        // Prefer IGNORED so a left-company decision wins over an older map.
        if (!existing || identity.status === 'IGNORED') {
          identityByAttendanceId.set(identity.attendanceId.trim(), identity);
        }
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
        identityByAttendanceId,
        employeeById,
        activeEmployees,
        fuseByName,
      ),
    );
  }

  private identityKey(attendanceId: string, attendanceName: string): string {
    return `${attendanceId.trim()}::${normaliseAttendanceName(attendanceName)}`;
  }

  private matchOne(
    row: AttendanceRawRow,
    identityByKey: Map<string, StoredIdentity>,
    identityByAttendanceId: Map<string, StoredIdentity>,
    employeeById: Map<
      string,
      {
        id: string;
        firstName: string;
        middleName: string | null;
        lastName: string;
        employeeId: string | null;
        isActive: boolean;
      }
    >,
    activeEmployees: Array<{
      id: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      employeeId: string | null;
      isActive: boolean;
    }>,
    fuseByName: Fuse<EmployeeMatchCandidate>,
  ): AttendanceMatchResult {
    const data = {
      payableHours: row.payableHours,
      dailyData: row.dailyData,
    };
    const attendanceId =
      row.attendanceId && row.attendanceId.trim().length > 0
        ? row.attendanceId.trim()
        : '-';
    const attendanceName = normaliseAttendanceName(row.attendanceName);

    const identity =
      identityByKey.get(this.identityKey(attendanceId, attendanceName)) ??
      (attendanceId !== '-'
        ? identityByAttendanceId.get(attendanceId)
        : undefined);
    if (identity) {
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
            data,
          };
        }
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
      data,
    };
  }
}
