import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
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
  skippedReviewCount: number;
  rejectedCount: number;
  rejectedNames: string[];
}

type CachedAttendancePreview = AttendancePreviewResult & {
  companyId: string;
};

const EMPLOYEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  employeeId: true,
  departmentId: true,
} as const;

/**
 * Attendance import, list, and employee-year profile reads.
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
        error instanceof Error ? error.message : 'Failed to parse attendance file',
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

    const confirmedIndices = new Set(dto.confirmedReviewIndices ?? []);
    const confirmedReview = review.filter((_, index) =>
      confirmedIndices.has(index),
    );
    const skippedReviewCount = review.length - confirmedReview.length;

    const rowsToImport = [...matched, ...confirmedReview].filter(
      (row): row is AttendanceMatchResult & { matchedEmployeeId: string } =>
        typeof row.matchedEmployeeId === 'string' &&
        row.matchedEmployeeId.length > 0,
    );

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
          reviewRows: confirmedReview.length,
          rejectedRows: rejected.length,
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
      skippedReviewCount,
      rejectedCount: rejected.length,
      rejectedNames: rejected.map((row) => row.attendanceName),
    };
  }

  /**
   * Paginated attendance records. HR viewers see company-wide data; others
   * are scoped to their own employee id.
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
      ...(filters.search?.trim()
        ? {
            employee: {
              OR: [
                {
                  firstName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: filters.search.trim(),
                    mode: 'insensitive',
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
        orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
        include: {
          employee: { select: EMPLOYEE_SELECT },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return buildPaginatedResult(rows, total, page, limit);
  }

  /**
   * All attendance months for one employee in a calendar year (max 12 rows).
   */
  async getMyAttendance(
    employeeId: string,
    companyId: string,
    year: number,
  ): Promise<unknown[]> {
    return this.prisma.attendanceRecord.findMany({
      where: { companyId, employeeId, year },
      orderBy: { month: 'asc' },
      include: {
        employee: { select: EMPLOYEE_SELECT },
      },
    });
  }
}
