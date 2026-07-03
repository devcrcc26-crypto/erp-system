import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

const ALLOWED_DATA_SOURCES = [
  'users',
  'audit_logs',
  'branches',
  'departments',
] as const;

type AllowedDataSource = (typeof ALLOWED_DATA_SOURCES)[number];

export interface ReportExecutionResult {
  dataSource: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

@Injectable()
export class ReportExecutorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes a report definition against an allow-listed data source.
   */
  async execute(
    companyId: string,
    dataSource: string,
    fields: Prisma.JsonValue,
    filters: Prisma.JsonValue,
    sorting: Prisma.JsonValue,
  ): Promise<ReportExecutionResult> {
    if (!this.isAllowedDataSource(dataSource)) {
      throw new BadRequestException(`Unsupported data source: ${dataSource}`);
    }

    const selectedFields = this.parseFieldList(fields);
    const rows = await this.fetchRows(
      companyId,
      dataSource,
      filters,
      sorting,
    );
    const columns =
      selectedFields.length > 0
        ? selectedFields
        : rows.length > 0
          ? Object.keys(rows[0])
          : [];

    const projectedRows =
      selectedFields.length > 0
        ? rows.map((row) =>
            Object.fromEntries(
              selectedFields.map((field) => [field, row[field] ?? null]),
            ),
          )
        : rows;

    return {
      dataSource,
      columns,
      rows: projectedRows,
      rowCount: projectedRows.length,
    };
  }

  /**
   * Converts report rows to CSV text.
   */
  toCsv(result: ReportExecutionResult): string {
    const header = result.columns.join(',');
    const lines = result.rows.map((row) =>
      result.columns
        .map((column) => this.escapeCsvValue(row[column]))
        .join(','),
    );
    return [header, ...lines].join('\n');
  }

  private isAllowedDataSource(value: string): value is AllowedDataSource {
    return (ALLOWED_DATA_SOURCES as readonly string[]).includes(value);
  }

  private parseFieldList(fields: Prisma.JsonValue): string[] {
    if (!Array.isArray(fields)) {
      return [];
    }
    return fields
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (
          typeof item === 'object' &&
          item !== null &&
          'field' in item &&
          typeof (item as { field: unknown }).field === 'string'
        ) {
          return (item as { field: string }).field;
        }
        return null;
      })
      .filter((field): field is string => field !== null);
  }

  private async fetchRows(
    companyId: string,
    dataSource: AllowedDataSource,
    _filters: Prisma.JsonValue,
    sorting: Prisma.JsonValue,
  ): Promise<Record<string, unknown>[]> {
    const orderBy = this.parseSort(sorting);

    switch (dataSource) {
      case 'users':
        return this.prisma.user.findMany({
          where: activeOnly({ companyId }),
          orderBy,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            chineseName: true,
            isActive: true,
            createdAt: true,
          },
        });
      case 'audit_logs':
        return this.prisma.auditLog.findMany({
          where: { companyId },
          orderBy: orderBy ?? { createdAt: 'desc' },
          take: 1000,
          select: {
            id: true,
            module: true,
            action: true,
            recordType: true,
            recordId: true,
            userId: true,
            createdAt: true,
          },
        });
      case 'branches':
        return this.prisma.branch.findMany({
          where: activeOnly({ companyId }),
          orderBy,
          select: {
            id: true,
            name: true,
            city: true,
            country: true,
            isHeadOffice: true,
            isActive: true,
            createdAt: true,
          },
        });
      case 'departments':
        return this.prisma.department.findMany({
          where: activeOnly({ companyId }),
          orderBy,
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            createdAt: true,
          },
        });
      default:
        return [];
    }
  }

  private parseSort(
    sorting: Prisma.JsonValue,
  ): Record<string, 'asc' | 'desc'> | undefined {
    if (!Array.isArray(sorting) || sorting.length === 0) {
      return undefined;
    }

    const first = sorting[0];
    if (
      typeof first === 'object' &&
      first !== null &&
      'field' in first &&
      'direction' in first &&
      typeof (first as { field: unknown }).field === 'string'
    ) {
      const direction =
        (first as { direction: string }).direction === 'asc' ? 'asc' : 'desc';
      return { [(first as { field: string }).field]: direction };
    }

    return undefined;
  }

  private escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    const text =
      value instanceof Date ? value.toISOString() : String(value as string);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}
