import { ConflictException, Injectable } from '@nestjs/common';
import { ApprovalRequestStatus, WorkFromHomeScope } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  type CoverCheckDay,
  type CoverModule,
  type CoverSources,
  type DayCover,
  dateKey,
  dayCoverMessage,
  resolveDayCovers,
} from '../utils/day-coverage.util';
import { workFromHomeFormDates } from '../../../work-schedule/application/services/work-from-home-range.util';

const OPEN_OR_APPROVED = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'APPROVED',
] as const;

/**
 * Loads what already covers an employee's days (leave, site assignment, work
 * from home, field movement, attendance scans) so a new request for the same
 * day can be refused with a clear message.
 */
@Injectable()
export class DayCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async findCovers(
    companyId: string,
    employeeId: string,
    days: ReadonlyArray<CoverCheckDay>,
    check: ReadonlyArray<CoverModule>,
  ): Promise<DayCover[]> {
    if (days.length === 0 || check.length === 0) {
      return [];
    }
    const sources = await this.loadSources(companyId, employeeId, days, check);
    return resolveDayCovers(days, check, sources);
  }

  /** Throws 409 with e.g. "Leave has been requested for this day (2026-08-03)." */
  async assertUncovered(
    companyId: string,
    employeeId: string,
    days: ReadonlyArray<CoverCheckDay>,
    check: ReadonlyArray<CoverModule>,
  ): Promise<void> {
    const covers = await this.findCovers(companyId, employeeId, days, check);
    if (covers.length > 0) {
      throw new ConflictException(dayCoverMessage(covers[0]));
    }
  }

  private async loadSources(
    companyId: string,
    employeeId: string,
    days: ReadonlyArray<CoverCheckDay>,
    check: ReadonlyArray<CoverModule>,
  ): Promise<CoverSources> {
    const times = days.map((day) => day.date.getTime());
    const from = new Date(Math.min(...times));
    const to = new Date(Math.max(...times));
    const wants = (module: CoverModule): boolean => check.includes(module);

    const [leaves, siteAssignments, workFromHome, fieldMovements, scans] =
      await Promise.all([
        wants('LEAVE')
          ? this.prisma.leaveRequest.findMany({
              where: {
                companyId,
                employeeId,
                deletedAt: null,
                status: { in: [...OPEN_OR_APPROVED] },
                periods: { some: { startDate: { lte: to }, endDate: { gte: from } } },
              },
              select: {
                status: true,
                requestNumber: true,
                periods: { select: { startDate: true, endDate: true } },
              },
            })
          : Promise.resolve([]),
        wants('SITE_ASSIGNMENT')
          ? this.prisma.siteAssignment.findMany({
              where: {
                companyId,
                employeeId,
                deletedAt: null,
                status: { in: ['SUBMITTED', 'IN_REVIEW', 'RETURNED', 'APPROVED'] },
                startDate: { lte: to },
                endDate: { gte: from },
              },
              select: {
                status: true,
                requestNumber: true,
                startDate: true,
                endDate: true,
              },
            })
          : Promise.resolve([]),
        wants('WORK_FROM_HOME')
          ? this.loadWorkFromHome(companyId, employeeId, from, to)
          : Promise.resolve({
              approved: new Set<string>(),
              requested: new Map<string, string>(),
            }),
        wants('FIELD_MOVEMENT')
          ? this.prisma.fieldMovementEntry.findMany({
              where: {
                date: { gte: from, lte: to },
                log: {
                  companyId,
                  employeeId,
                  deletedAt: null,
                  status: { in: [...OPEN_OR_APPROVED] },
                },
              },
              select: {
                date: true,
                log: { select: { status: true, requestNumber: true } },
              },
            })
          : Promise.resolve([]),
        wants('ATTENDANCE')
          ? this.prisma.attendanceDailyLog.findMany({
              where: {
                date: { gte: from, lte: to },
                record: { companyId, employeeId },
                OR: [
                  { clockInLocal: { not: null } },
                  { clockOutLocal: { not: null } },
                  { correctedClockInLocal: { not: null } },
                  { correctedClockOutLocal: { not: null } },
                ],
              },
              select: { date: true },
            })
          : Promise.resolve([]),
      ]);

    return {
      leaves,
      siteAssignments,
      workFromHomeApproved: workFromHome.approved,
      workFromHomeRequested: workFromHome.requested,
      fieldMovements: fieldMovements.map((entry) => ({
        date: entry.date,
        status: entry.log.status,
        requestNumber: entry.log.requestNumber,
      })),
      attendanceScanKeys: new Set(scans.map((row) => dateKey(row.date))),
    };
  }

  private async loadWorkFromHome(
    companyId: string,
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<{ approved: Set<string>; requested: Map<string, string> }> {
    const [employee, rows, pending] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: employeeId, companyId },
        select: { departmentId: true },
      }),
      this.prisma.workFromHomeDay.findMany({
        where: { companyId, deletedAt: null, date: { gte: from, lte: to } },
        select: { date: true, scope: true, departmentIds: true, employeeIds: true },
      }),
      this.prisma.approvalRequest.findMany({
        where: {
          companyId,
          deletedAt: null,
          category: { code: 'WORK_FROM_HOME' },
          status: {
            in: [
              ApprovalRequestStatus.PENDING,
              ApprovalRequestStatus.SUBMITTED,
              ApprovalRequestStatus.IN_REVIEW,
              ApprovalRequestStatus.RETURNED,
            ],
          },
        },
        select: { formData: true, requestNumber: true },
      }),
    ]);

    const approved = new Set<string>();
    for (const row of rows) {
      const applies =
        row.employeeIds.includes(employeeId) ||
        row.scope === WorkFromHomeScope.ALL ||
        (row.scope === WorkFromHomeScope.DEPARTMENTS &&
          employee?.departmentId != null &&
          row.departmentIds.includes(employee.departmentId));
      if (applies) {
        approved.add(dateKey(row.date));
      }
    }

    const requested = new Map<string, string>();
    const fromKey = dateKey(from);
    const toKey = dateKey(to);
    for (const row of pending) {
      const data = row.formData as { employeeId?: string } | null;
      if (data?.employeeId !== employeeId) {
        continue;
      }
      // Range requests list their days in `dates`; legacy ones use `date`.
      for (const key of workFromHomeFormDates(row.formData)) {
        if (key >= fromKey && key <= toKey) {
          requested.set(key, row.requestNumber);
        }
      }
    }
    return { approved, requested };
  }
}
