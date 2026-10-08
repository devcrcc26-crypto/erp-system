import { Injectable } from '@nestjs/common';
import Fuse from 'fuse.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  AttendanceDailyRaw,
  AttendanceRawRow,
} from '../../utils/attendance-excel.parser';

export type MatchConfidence =
  | 'ID_MATCH'
  | 'NAME_HIGH'
  | 'NAME_REVIEW'
  | 'MANUAL'
  | 'NO_MATCH';

export interface AttendanceMatchResult {
  attendanceName: string;
  attendanceId: string;
  matchedEmployeeId: string | null;
  matchedEmployeeName: string | null;
  matchedEmployeeErpId: string | null;
  confidence: MatchConfidence;
  score: number | null;
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
  fullName: string;
};

/**
 * Builds "First Middle Last", omitting blank middle names.
 */
function formatEmployeeFullName(employee: {
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
 * Matches Deli attendance rows to ERP employees by employee ID first,
 * then by fuzzy full-name search via fuse.js (first + middle + last).
 */
@Injectable()
export class AttendanceMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches parsed attendance rows against active company employees.
   * Read-only — does not write to the database.
   */
  async matchRows(
    rows: AttendanceRawRow[],
    companyId: string,
  ): Promise<AttendanceMatchResult[]> {
    const employees = await this.prisma.user.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
      },
    });

    const nameList: EmployeeMatchCandidate[] = employees.map((employee) => ({
      ...employee,
      fullName: formatEmployeeFullName(employee),
    }));

    const fuseByName = new Fuse(nameList, {
      keys: ['fullName'],
      threshold: 0.35,
      includeScore: true,
      shouldSort: true,
    });

    return rows.map((row) => this.matchOne(row, employees, fuseByName));
  }

  private matchOne(
    row: AttendanceRawRow,
    employees: Array<{
      id: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      employeeId: string | null;
    }>,
    fuseByName: Fuse<EmployeeMatchCandidate>,
  ): AttendanceMatchResult {
    const data = {
      payableHours: row.payableHours,
      dailyData: row.dailyData,
    };

    if (row.attendanceId && row.attendanceId !== '-') {
      const found = employees.find(
        (employee) => employee.employeeId === row.attendanceId,
      );
      if (found) {
        return {
          attendanceName: row.attendanceName,
          attendanceId: row.attendanceId,
          matchedEmployeeId: found.id,
          matchedEmployeeName: formatEmployeeFullName(found),
          matchedEmployeeErpId: found.employeeId,
          confidence: 'ID_MATCH',
          score: 100,
          data,
        };
      }
    }

    const results = fuseByName.search(row.attendanceName);
    if (results.length > 0) {
      const best = results[0];
      const score = Math.round((1 - (best.score ?? 1)) * 100);

      if (score >= 90) {
        return {
          attendanceName: row.attendanceName,
          attendanceId: row.attendanceId,
          matchedEmployeeId: best.item.id,
          matchedEmployeeName: best.item.fullName,
          matchedEmployeeErpId: best.item.employeeId,
          confidence: 'NAME_HIGH',
          score,
          data,
        };
      }

      if (score >= 70) {
        return {
          attendanceName: row.attendanceName,
          attendanceId: row.attendanceId,
          matchedEmployeeId: best.item.id,
          matchedEmployeeName: best.item.fullName,
          matchedEmployeeErpId: best.item.employeeId,
          confidence: 'NAME_REVIEW',
          score,
          data,
        };
      }
    }

    return {
      attendanceName: row.attendanceName,
      attendanceId: row.attendanceId,
      matchedEmployeeId: null,
      matchedEmployeeName: null,
      matchedEmployeeErpId: null,
      confidence: 'NO_MATCH',
      score: null,
      data,
    };
  }
}
