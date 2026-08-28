import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogSource, Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../shared/context/request-context';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  buildOrderBy,
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { AuditLogQueryDto } from '../dtos/audit-log-query.dto';

export interface CreateAuditLogInput {
  userId?: string;
  companyId: string;
  sessionId?: string;
  correlationId?: string;
  module: string;
  action: string;
  recordType: string;
  recordId: string;
  recordReference?: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
  ipAddress?: string;
  deviceInfo?: string;
  source?: AuditLogSource;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends an immutable audit log entry.
   */
  async create(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId,
          companyId: input.companyId,
          sessionId: input.sessionId,
          correlationId: input.correlationId,
          batchId: null,
          source: input.source ?? AuditLogSource.USER_ACTION,
          module: input.module,
          action: input.action,
          recordType: input.recordType,
          recordId: input.recordId,
          recordReference: input.recordReference,
          beforeValue: input.beforeValue,
          afterValue: input.afterValue,
          ipAddress: input.ipAddress,
          deviceInfo: input.deviceInfo,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        'Failed to write audit log',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Returns paginated audit logs for a company with optional filters.
   */
  async list(
    companyId: string,
    query: AuditLogQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.recordType ? { recordType: query.recordType } : {}),
      ...(query.recordId ? { recordId: query.recordId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Returns a single audit log entry scoped to the company.
   */
  async getById(companyId: string, id: string): Promise<unknown> {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, companyId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
      },
    });

    if (!log) {
      throw new NotFoundException('Audit log entry not found');
    }

    return log;
  }

  /**
   * Returns aggregate audit log counts for dashboard stat cards.
   */
  async getStats(companyId: string): Promise<{
    total: number;
    userActions: number;
    systemJobs: number;
    integrations: number;
  }> {
    const [total, bySource] = await Promise.all([
      this.prisma.auditLog.count({ where: { companyId } }),
      this.prisma.auditLog.groupBy({
        by: ['source'],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    const countFor = (source: string): number =>
      bySource.find((row) => row.source === source)?._count._all ?? 0;

    return {
      total,
      userActions: countFor('USER_ACTION'),
      systemJobs: countFor('SYSTEM_JOB'),
      integrations:
        countFor('API_INTEGRATION') + countFor('MIGRATION'),
    };
  }

  /**
   * Builds audit input from the current HTTP request context.
   */
  buildFromRequestContext(
    partial: Omit<CreateAuditLogInput, 'correlationId' | 'ipAddress' | 'deviceInfo'>,
  ): CreateAuditLogInput {
    const ctx = getRequestContext();
    return {
      ...partial,
      correlationId: ctx?.correlationId,
      ipAddress: ctx?.ipAddress,
      deviceInfo: ctx?.userAgent,
    };
  }
}
