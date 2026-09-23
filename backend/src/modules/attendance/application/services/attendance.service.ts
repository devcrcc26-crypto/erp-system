import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { parseAttendanceExcel } from '../../utils/attendance-excel.parser';
import {
  ConfirmAttendanceImportDto,
  ListAttendanceDto,
} from '../dtos/attendance.dto';
import {
  AttendanceMatchResult,
  AttendanceMatchingService,
} from './attendance-matching.service';
import { AttendancePreviewCache } from './attendance-preview.cache';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface AttendancePreviewResult {
  previewToken: string;
  month: number;
  year: number;
  fileName: string;
  alreadyImported: boolean;
  totalRows: number;
  matched: AttendanceMatchResult[];
  review: AttendanceMatchResult[];
  rejected: AttendanceMatchResult[];
}

export interface AttendanceImportSummary {
  month: number;
  year: number;
  importedCount: number;
  autoMatchedCount: number;
  manualAssignedCount: number;
  skippedReviewCount: number;
  rejectedCount: number;
  rejectedNames: string[];
}

export interface AttendanceEmployeeSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  department: { id: string; name: string } | null;
}

type CachedAttendancePreview = AttendancePreviewResult & {
  companyId: string;
};

/**
 * Attendance rate as a whole-number percentage, or null when expected days is 0.
 */
function computeAttendanceRate(
  expectedDays: Prisma.Decimal | number,
  actualDays: Prisma.Decimal | number,
): number | null {
  const expected = Number(expectedDays);
  if (!(expected > 0)) {
    return null;
  }
  return Math.round((Number(actualDays) / expected) * 100);
}

/**
 * Attendance import, list, and employee-year profile reads.
 *
 * PermissionService comes from the global PermissionsModule. Preview sessions
 * use AttendancePreviewCache (Redis when REDIS_ENABLED, else in-memory) —
 * the project does not use @nestjs/cache-manager.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: AttendanceMatchingService,
    private readonly permissionService: PermissionService,
    private readonly previewCache: AttendancePreviewCache,
  ) {}

  /**
   * Parses an uploaded Deli export, matches employees, and caches the preview
   * for 10 minutes pending confirm.
   */
  async previewImport(
    file: Express.Multer.File,
    companyId: string,
    userId: string,
  ): Promise<AttendancePreviewResult> {
    let parseResult;
    try {
      parseResult = await parseAttendanceExcel(
        file.buffer,
        file.originalname,
      );
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to parse attendance file',
      );
    }

    const { month, year, fileName, rows } = parseResult;
    const matchResults = await this.matchingService.matchRows(rows, companyId);

    const existing = await this.prisma.attendanceImportBatch.findUnique({
      where: {
        companyId_month_year: { companyId, month, year },
      },
    });

    const matched = matchResults.filter(
      (row) =>
        row.confidence === 'ID_MATCH' || row.confidence === 'NAME_HIGH',
    );
    const review = matchResults.filter(
      (row) => row.confidence === 'NAME_REVIEW',
    );
    const rejected = matchResults.filter(
      (row) => row.confidence === 'NO_MATCH',
    );

    const previewToken = `attendance:preview:${companyId}:${userId}:${Date.now()}`;
    const preview: CachedAttendancePreview = {
      previewToken,
      companyId,
      month,
      year,
      fileName,
      alreadyImported: !!existing,
      totalRows: rows.length,
      matched,
      review,
      rejected,
    };

    await this.previewCache.set(previewToken, preview);

    return {
      previewToken,
      month,
      year,
      fileName,
      alreadyImported: !!existing,
      totalRows: rows.length,
      matched,
      review,
      rejected,
    };
  }

  /**
   * Persists a cached preview as an import batch + attendance records.
   * Optionally overwrites an existing month batch (cascade deletes records).
   * Supports manualAssignments for review overrides and rejected assignments.
   */
  async confirmImport(
    dto: ConfirmAttendanceImportDto,
    companyId: string,
    userId: string,
  ): Promise<AttendanceImportSummary> {
    const cached = await this.previewCache.get<CachedAttendancePreview>(
      dto.previewToken,
    );
    if (!cached) {
      throw new BadRequestException(
        'Import session expired. Please upload the file again.',
      );
    }
    if (cached.companyId !== companyId) {
      throw new ForbiddenException(
        'Preview does not belong to the current company',
      );
    }

    const { month, year, fileName, matched, review, rejected, totalRows } =
      cached;

    const existing = await this.prisma.attendanceImportBatch.findUnique({
      where: {
        companyId_month_year: { companyId, month, year },
      },
    });

    if (existing && !dto.overwrite) {
      const monthName = MONTH_NAMES[month - 1] ?? String(month);
      throw new ConflictException(
        `Attendance data for ${monthName} ${year} has already been imported. Set overwrite to true to replace it.`,
      );
    }

    const assignments = dto.manualAssignments ?? [];
    const reviewAssignmentByIndex = new Map<number, string>();
    const rejectedAssignmentByIndex = new Map<number, string>();

    for (const assignment of assignments) {
      if (assignment.bucket === 'review') {
        if (
          assignment.rowIndex < 0 ||
          assignment.rowIndex >= review.length
        ) {
          throw new BadRequestException(
            `Invalid review row index: ${assignment.rowIndex}`,
          );
        }
        if (reviewAssignmentByIndex.has(assignment.rowIndex)) {
          throw new BadRequestException(
            `Duplicate manual assignment for review row ${assignment.rowIndex}`,
          );
        }
        reviewAssignmentByIndex.set(assignment.rowIndex, assignment.employeeId);
      } else {
        if (
          assignment.rowIndex < 0 ||
          assignment.rowIndex >= rejected.length
        ) {
          throw new BadRequestException(
            `Invalid rejected row index: ${assignment.rowIndex}`,
          );
        }
        if (rejectedAssignmentByIndex.has(assignment.rowIndex)) {
          throw new BadRequestException(
            `Duplicate manual assignment for rejected row ${assignment.rowIndex}`,
          );
        }
        rejectedAssignmentByIndex.set(
          assignment.rowIndex,
          assignment.employeeId,
        );
      }
    }

    const assignmentEmployeeIds = assignments.map((item) => item.employeeId);
    if (new Set(assignmentEmployeeIds).size !== assignmentEmployeeIds.length) {
      throw new BadRequestException(
        'Each ERP employee can only be matched once in an import',
      );
    }

    const employeeById = new Map<
      string,
      {
        id: string;
        firstName: string;
        lastName: string;
        employeeId: string | null;
      }
    >();

    if (assignmentEmployeeIds.length > 0) {
      const employees = await this.prisma.user.findMany({
        where: {
          companyId,
          deletedAt: null,
          isActive: true,
          id: { in: [...new Set(assignmentEmployeeIds)] },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
        },
      });
      if (employees.length !== new Set(assignmentEmployeeIds).size) {
        throw new BadRequestException(
          'One or more selected employees were not found in this company',
        );
      }
      for (const employee of employees) {
        employeeById.set(employee.id, employee);
      }
    }

    const confirmedIndices = new Set(dto.confirmedReviewIndices ?? []);
    for (const rowIndex of reviewAssignmentByIndex.keys()) {
      confirmedIndices.add(rowIndex);
    }

    const skippedReviewCount = review.filter(
      (_, index) => !confirmedIndices.has(index),
    ).length;

    type ImportRow = AttendanceMatchResult & { matchedEmployeeId: string };
    const rowsToImport: ImportRow[] = [];
    const takenEmployeeIds = new Set<string>();

    const claimEmployee = (employeeId: string): void => {
      if (takenEmployeeIds.has(employeeId)) {
        throw new BadRequestException(
          'Each ERP employee can only be matched once in an import',
        );
      }
      takenEmployeeIds.add(employeeId);
    };

    let autoMatchedCount = 0;
    let manualAssignedCount = 0;

    for (const row of matched) {
      if (!row.matchedEmployeeId) {
        continue;
      }
      claimEmployee(row.matchedEmployeeId);
      rowsToImport.push({
        ...row,
        matchedEmployeeId: row.matchedEmployeeId,
      });
      autoMatchedCount += 1;
    }

    for (let index = 0; index < review.length; index += 1) {
      if (!confirmedIndices.has(index)) {
        continue;
      }
      const row = review[index];
      const overrideId = reviewAssignmentByIndex.get(index);
      if (overrideId) {
        const employee = employeeById.get(overrideId);
        if (!employee) {
          throw new BadRequestException(
            'One or more selected employees were not found in this company',
          );
        }
        claimEmployee(overrideId);
        rowsToImport.push({
          ...row,
          matchedEmployeeId: employee.id,
          matchedEmployeeName: `${employee.firstName} ${employee.lastName}`,
          matchedEmployeeErpId: employee.employeeId,
          confidence: 'MANUAL',
          score: 100,
        });
        manualAssignedCount += 1;
      } else if (row.matchedEmployeeId) {
        claimEmployee(row.matchedEmployeeId);
        rowsToImport.push({
          ...row,
          matchedEmployeeId: row.matchedEmployeeId,
        });
        autoMatchedCount += 1;
      }
    }

    const stillRejected: AttendanceMatchResult[] = [];
    for (let index = 0; index < rejected.length; index += 1) {
      const row = rejected[index];
      const assignedId = rejectedAssignmentByIndex.get(index);
      if (assignedId) {
        const employee = employeeById.get(assignedId);
        if (!employee) {
          throw new BadRequestException(
            'One or more selected employees were not found in this company',
          );
        }
        claimEmployee(assignedId);
        rowsToImport.push({
          ...row,
          matchedEmployeeId: employee.id,
          matchedEmployeeName: `${employee.firstName} ${employee.lastName}`,
          matchedEmployeeErpId: employee.employeeId,
          confidence: 'MANUAL',
          score: 100,
        });
        manualAssignedCount += 1;
      } else {
        stillRejected.push(row);
      }
    }

    const confirmedReviewCount = [...confirmedIndices].filter(
      (index) => index >= 0 && index < review.length,
    ).length;

    await this.prisma.$transaction(async (tx) => {
      if (existing && dto.overwrite) {
        await tx.attendanceImportBatch.delete({
          where: { id: existing.id },
        });
      }

      const batch = await tx.attendanceImportBatch.create({
        data: {
          id: randomUUID(),
          companyId,
          month,
          year,
          fileName,
          importedBy: userId,
          totalRows,
          matchedRows: rowsToImport.length,
          reviewRows: confirmedReviewCount,
          rejectedRows: stillRejected.length,
          importedAt: new Date(),
        },
      });

      if (rowsToImport.length > 0) {
        await tx.attendanceRecord.createMany({
          data: rowsToImport.map((row) => ({
            id: randomUUID(),
            companyId,
            employeeId: row.matchedEmployeeId,
            importBatchId: batch.id,
            month,
            year,
            expectedDays: row.data.expectedDays,
            actualDays: row.data.actualDays,
            expectedHours: row.data.expectedHours,
            actualHours: row.data.actualHours,
            payableHours: row.data.payableHours,
            overtimePaidHours: row.data.overtimePaidHours,
            overtimeTimeOffHours: row.data.overtimeTimeOffHours,
            lateCount: row.data.lateCount,
            lateMinutes: row.data.lateMinutes,
            earlyLeaveCount: row.data.earlyLeaveCount,
            earlyLeaveMinutes: row.data.earlyLeaveMinutes,
            missingClockIn: row.data.missingClockIn,
            missingClockOut: row.data.missingClockOut,
            absentDays: row.data.absentDays,
          })),
        });
      }
    });

    await this.previewCache.del(dto.previewToken);

    return {
      month,
      year,
      importedCount: rowsToImport.length,
      autoMatchedCount,
      manualAssignedCount,
      skippedReviewCount,
      rejectedCount: stillRejected.length,
      rejectedNames: stillRejected.map((row) => row.attendanceName),
    };
  }

  /**
   * Searches active company employees for manual attendance assignment.
   */
  async searchEmployees(
    query: string,
    companyId: string,
  ): Promise<AttendanceEmployeeSearchResult[]> {
    const trimmed = query?.trim() ?? '';
    if (trimmed.length < 2) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        OR: [
          { firstName: { contains: trimmed, mode: 'insensitive' } },
          { lastName: { contains: trimmed, mode: 'insensitive' } },
          { employeeId: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        department: { select: { id: true, name: true } },
      },
      take: 10,
      orderBy: { firstName: 'asc' },
    });
  }

  /**
   * Paginated attendance records. HR viewers see company-wide data; others
   * are scoped to their own employee id. Search applies to HR only.
   */
  async listRecords(
    filters: ListAttendanceDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const now = new Date();
    const month = filters.month ?? now.getMonth() + 1;
    const year = filters.year ?? now.getFullYear();

    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );

    const where: Prisma.AttendanceRecordWhereInput = {
      companyId,
      month,
      year,
      ...(isHrViewer && filters.employeeId
        ? { employeeId: filters.employeeId }
        : !isHrViewer
          ? { employeeId: userId }
          : {}),
      ...(isHrViewer && filters.search?.trim()
        ? {
            employee: {
              OR: [
                {
                  firstName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  lastName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        skip,
        take,
        orderBy: [{ employee: { lastName: 'asc' } }],
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              departmentId: true,
              department: {
                select: { id: true, name: true },
              },
            },
          },
          importBatch: {
            select: {
              id: true,
              fileName: true,
              importedAt: true,
            },
          },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    const data = rows.map((record) => ({
      ...record,
      attendanceRate: computeAttendanceRate(
        record.expectedDays,
        record.actualDays,
      ),
    }));

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * Year profile for one employee: month rows with rates plus aggregate summary.
   */
  async getMyAttendance(
    employeeId: string,
    companyId: string,
    year: number,
  ): Promise<unknown> {
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId, employeeId, year },
      orderBy: { month: 'asc' },
      include: {
        importBatch: {
          select: { fileName: true, importedAt: true },
        },
      },
    });

    const data = records.map((record) => ({
      ...record,
      monthName: MONTH_NAMES[record.month - 1],
      attendanceRate: computeAttendanceRate(
        record.expectedDays,
        record.actualDays,
      ),
    }));

    const rates = data
      .map((row) => row.attendanceRate)
      .filter((rate): rate is number => rate !== null);

    const summary = {
      totalExpectedDays: data.reduce(
        (sum, row) => sum + Number(row.expectedDays),
        0,
      ),
      totalActualDays: data.reduce(
        (sum, row) => sum + Number(row.actualDays),
        0,
      ),
      totalAbsentDays: data.reduce(
        (sum, row) => sum + Number(row.absentDays),
        0,
      ),
      totalLateCount: data.reduce((sum, row) => sum + row.lateCount, 0),
      totalOvertimePaidHours: data.reduce(
        (sum, row) => sum + Number(row.overtimePaidHours),
        0,
      ),
      averageAttendanceRate:
        rates.length > 0
          ? Math.round(
              rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
            )
          : null,
    };

    return {
      employee,
      year,
      records: data,
      summary,
    };
  }

  /**
   * Import batch history for HR — which months were imported and by whom.
   */
  async getImportHistory(companyId: string): Promise<unknown> {
    return this.prisma.attendanceImportBatch.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        importer: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { records: true } },
      },
    });
  }
}
