import { Injectable, Logger } from '@nestjs/common';
import { OvertimeSheetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { addUtcDays } from '../../../work-schedule/application/services/work-schedule.dates';
import { END_OF_DAY_HHMM } from '../utils/overtime-selectable-windows.util';
import { OvertimeEntryService } from './overtime-entry.service';
import { OvertimeService } from './overtime.service';

/** Sheets the employee can still edit: entries are re-priced on site changes. */
const UNSUBMITTED_STATUSES: OvertimeSheetStatus[] = [
  OvertimeSheetStatus.DRAFT,
  OvertimeSheetStatus.RETURNED,
];

/** Sheets in or past approval: stored hours are kept and the entry is flagged. */
const SUBMITTED_STATUSES: OvertimeSheetStatus[] = [
  OvertimeSheetStatus.SUBMITTED,
  OvertimeSheetStatus.IN_REVIEW,
  OvertimeSheetStatus.APPROVED,
];

export type SiteReviewFlag = 'ASSIGNMENT_CANCELLED' | 'ASSIGNMENT_SHORTENED';

export interface SiteAssignmentRef {
  id: string;
  companyId: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
}

export interface AffectedOvertimeCounts {
  /** DRAFT/RETURNED sheets: hours will be recalculated. */
  unsubmitted: number;
  /** SUBMITTED/IN_REVIEW/APPROVED sheets: hours kept, entry flagged for HR. */
  submitted: number;
}

/**
 * Keeps overtime entries in step with site assignments.
 * Hours on submitted/approved sheets are never changed here.
 */
@Injectable()
export class OvertimeSiteSyncService {
  private readonly logger = new Logger(OvertimeSiteSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly overtimeEntryService: OvertimeEntryService,
    private readonly overtimeService: OvertimeService,
  ) {}

  /**
   * Entries linked to the assignment on dates from `removedFrom` that a
   * cancel (removedFrom = start) or shorten (removedFrom = new end + 1) affects.
   */
  async countAffected(
    assignment: SiteAssignmentRef,
    removedFrom: Date,
  ): Promise<AffectedOvertimeCounts> {
    const where = (statuses: OvertimeSheetStatus[]) =>
      this.linkedEntriesWhere(assignment, removedFrom, statuses);
    const [unsubmitted, submitted] = await Promise.all([
      this.prisma.overtimeEntry.count({ where: where(UNSUBMITTED_STATUSES) }),
      this.prisma.overtimeEntry.count({ where: where(SUBMITTED_STATUSES) }),
    ]);
    return { unsubmitted, submitted };
  }

  /**
   * After a cancel/shorten: re-price unsubmitted entries; flag submitted ones.
   */
  async syncAfterRemoval(
    assignment: SiteAssignmentRef,
    removedFrom: Date,
    flag: SiteReviewFlag,
  ): Promise<AffectedOvertimeCounts> {
    const now = new Date();
    const flagged = await this.prisma.overtimeEntry.updateMany({
      where: this.linkedEntriesWhere(assignment, removedFrom, SUBMITTED_STATUSES),
      data: { siteReviewFlag: flag, siteReviewFlaggedAt: now },
    });

    const drafts = await this.prisma.overtimeEntry.findMany({
      where: this.linkedEntriesWhere(assignment, removedFrom, UNSUBMITTED_STATUSES),
      select: { id: true },
    });
    let reclassified = 0;
    for (const entry of drafts) {
      if (await this.reclassifyEntry(entry.id, flag)) {
        reclassified += 1;
      }
    }
    return { unsubmitted: reclassified, submitted: flagged.count };
  }

  /**
   * After an assignment is approved: label entries already on those dates.
   * Unsubmitted entries are re-priced; submitted ones only gain the link.
   */
  async syncAfterApproval(assignment: SiteAssignmentRef): Promise<void> {
    const inRange = (statuses: OvertimeSheetStatus[]): Prisma.OvertimeEntryWhereInput => ({
      siteAssignmentId: null,
      date: { gte: assignment.startDate, lte: assignment.endDate },
      sheet: {
        companyId: assignment.companyId,
        employeeId: assignment.employeeId,
        deletedAt: null,
        status: { in: statuses },
      },
    });

    await this.prisma.overtimeEntry.updateMany({
      where: inRange(SUBMITTED_STATUSES),
      data: { siteAssignmentId: assignment.id },
    });

    const drafts = await this.prisma.overtimeEntry.findMany({
      where: inRange(UNSUBMITTED_STATUSES),
      select: { id: true },
    });
    for (const entry of drafts) {
      await this.reclassifyEntry(entry.id, null);
    }
  }

  /**
   * Re-prices one entry on an editable sheet with the current site status.
   * On failure the entry is flagged instead so HR/the employee can fix it.
   */
  private async reclassifyEntry(
    entryId: string,
    flagOnFailure: SiteReviewFlag | null,
  ): Promise<boolean> {
    const entry = await this.prisma.overtimeEntry.findUnique({
      where: { id: entryId },
      include: {
        sheet: { select: { id: true, companyId: true, employeeId: true } },
      },
    });
    if (!entry) {
      return false;
    }
    try {
      const classified = await this.overtimeEntryService.classifyEntry(
        entry.sheet.employeeId,
        entry.sheet.companyId,
        entry.date,
        formatTime(entry.startTime),
        entry.endsAtEndOfDay ? END_OF_DAY_HHMM : formatTime(entry.endTime),
        {
          holidayOverride: entry.isHoliday,
          isOvernight: entry.isOvernight,
          enforceSelectableWindows: false,
        },
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.overtimeEntry.update({
          where: { id: entry.id },
          data: {
            isHoliday: classified.isHoliday,
            regularHours: new Prisma.Decimal(classified.regularHours),
            nightHours: new Prisma.Decimal(classified.nightHours),
            weekendHours: new Prisma.Decimal(classified.weekendHours),
            holidayHours: new Prisma.Decimal(classified.holidayHours),
            siteAssignmentId: classified.siteAssignmentId,
            siteWithinScheduleHours: new Prisma.Decimal(
              classified.siteWithinScheduleHours,
            ),
            siteReviewFlag: null,
            siteReviewFlaggedAt: null,
          },
        });
        await this.overtimeService.recalculateSheetTotals(entry.sheet.id, tx);
      });
      return true;
    } catch (error: unknown) {
      this.logger.warn(
        `Could not reclassify overtime entry ${entry.id} after site change: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (flagOnFailure) {
        await this.prisma.overtimeEntry.update({
          where: { id: entry.id },
          data: { siteReviewFlag: flagOnFailure, siteReviewFlaggedAt: new Date() },
        });
      }
      return false;
    }
  }

  private linkedEntriesWhere(
    assignment: SiteAssignmentRef,
    removedFrom: Date,
    statuses: OvertimeSheetStatus[],
  ): Prisma.OvertimeEntryWhereInput {
    return {
      siteAssignmentId: assignment.id,
      date: { gte: removedFrom },
      sheet: {
        companyId: assignment.companyId,
        employeeId: assignment.employeeId,
        deletedAt: null,
        status: { in: statuses },
      },
    };
  }
}

/** First day no longer covered when an assignment is shortened to `newEnd`. */
export function dayAfter(newEnd: Date): Date {
  return addUtcDays(newEnd, 1);
}

function formatTime(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(
    value.getUTCMinutes(),
  ).padStart(2, '0')}`;
}
