import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OvertimeSheetStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { OvertimeEntryService } from './overtime-entry.service';
import type { OvertimeService } from './overtime.service';
import { OvertimeSiteSyncService } from './overtime-site-sync.service';

type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const asyncMock = (value?: unknown): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(value);

const ASSIGNMENT = {
  id: 'sa-1',
  companyId: 'company-1',
  employeeId: 'employee-1',
  startDate: new Date(Date.UTC(2026, 8, 1)),
  endDate: new Date(Date.UTC(2026, 8, 15)),
};
const REMOVED_FROM = new Date(Date.UTC(2026, 8, 11));

const DRAFT_ENTRY = {
  id: 'entry-draft',
  date: new Date(Date.UTC(2026, 8, 12)),
  startTime: new Date(Date.UTC(1970, 0, 1, 9, 0)),
  endTime: new Date(Date.UTC(1970, 0, 1, 12, 0)),
  endsAtEndOfDay: false,
  isHoliday: false,
  isOvernight: false,
  sheet: { id: 'sheet-1', companyId: 'company-1', employeeId: 'employee-1' },
};

describe('OvertimeSiteSyncService', () => {
  let prisma: {
    overtimeEntry: {
      count: AsyncMock;
      updateMany: AsyncMock;
      findMany: AsyncMock;
      findUnique: AsyncMock;
      update: AsyncMock;
    };
    $transaction: jest.Mock;
  };
  let entryService: { classifyEntry: AsyncMock };
  let overtimeService: { recalculateSheetTotals: AsyncMock };
  let service: OvertimeSiteSyncService;

  beforeEach(() => {
    prisma = {
      overtimeEntry: {
        count: asyncMock(0),
        updateMany: asyncMock({ count: 2 }),
        findMany: asyncMock([{ id: DRAFT_ENTRY.id }]),
        findUnique: asyncMock(DRAFT_ENTRY),
        update: asyncMock({}),
      },
      $transaction: jest.fn(async (fn: unknown) =>
        (fn as (tx: unknown) => Promise<unknown>)(prisma),
      ),
    };
    entryService = {
      classifyEntry: asyncMock({
        isHoliday: false,
        regularHours: 0,
        nightHours: 0,
        weekendHours: 0,
        holidayHours: 0,
        siteAssignmentId: null,
        siteWithinScheduleHours: 0,
      }),
    };
    overtimeService = { recalculateSheetTotals: asyncMock(undefined) };
    service = new OvertimeSiteSyncService(
      prisma as unknown as PrismaService,
      entryService as unknown as OvertimeEntryService,
      overtimeService as unknown as OvertimeService,
    );
  });

  it('counts linked entries from the removal date, split by sheet stage', async () => {
    prisma.overtimeEntry.count.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    await expect(service.countAffected(ASSIGNMENT, REMOVED_FROM)).resolves.toEqual({
      unsubmitted: 1,
      submitted: 4,
    });
    expect(prisma.overtimeEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        siteAssignmentId: 'sa-1',
        date: { gte: REMOVED_FROM },
        sheet: expect.objectContaining({
          status: { in: [OvertimeSheetStatus.DRAFT, OvertimeSheetStatus.RETURNED] },
        }),
      }),
    });
  });

  it('removal flags submitted/approved entries without touching their hours', async () => {
    const result = await service.syncAfterRemoval(
      ASSIGNMENT,
      REMOVED_FROM,
      'ASSIGNMENT_SHORTENED',
    );

    const flagCall = prisma.overtimeEntry.updateMany.mock.calls[0]?.[0] as {
      where: { sheet: { status: { in: OvertimeSheetStatus[] } } };
      data: Record<string, unknown>;
    };
    expect(flagCall.where.sheet.status.in).toEqual([
      OvertimeSheetStatus.SUBMITTED,
      OvertimeSheetStatus.IN_REVIEW,
      OvertimeSheetStatus.APPROVED,
    ]);
    expect(Object.keys(flagCall.data).sort()).toEqual([
      'siteReviewFlag',
      'siteReviewFlaggedAt',
    ]);
    expect(flagCall.data.siteReviewFlag).toBe('ASSIGNMENT_SHORTENED');
    expect(result).toEqual({ unsubmitted: 1, submitted: 2 });
  });

  it('removal re-prices unsubmitted entries without the selectable-window check', async () => {
    await service.syncAfterRemoval(ASSIGNMENT, REMOVED_FROM, 'ASSIGNMENT_CANCELLED');

    expect(entryService.classifyEntry).toHaveBeenCalledWith(
      'employee-1',
      'company-1',
      DRAFT_ENTRY.date,
      '09:00',
      '12:00',
      expect.objectContaining({ enforceSelectableWindows: false }),
    );
    expect(prisma.overtimeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-draft' },
        data: expect.objectContaining({ siteAssignmentId: null }),
      }),
    );
    expect(overtimeService.recalculateSheetTotals).toHaveBeenCalledWith(
      'sheet-1',
      prisma,
    );
  });

  it('flags an unsubmitted entry it cannot re-price', async () => {
    entryService.classifyEntry.mockRejectedValue(new Error('not employed'));

    const result = await service.syncAfterRemoval(
      ASSIGNMENT,
      REMOVED_FROM,
      'ASSIGNMENT_CANCELLED',
    );

    expect(result.unsubmitted).toBe(0);
    expect(prisma.overtimeEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-draft' },
      data: expect.objectContaining({ siteReviewFlag: 'ASSIGNMENT_CANCELLED' }),
    });
  });

  it('approval links submitted entries (link only) and re-prices drafts', async () => {
    await service.syncAfterApproval(ASSIGNMENT);

    expect(prisma.overtimeEntry.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        siteAssignmentId: null,
        date: { gte: ASSIGNMENT.startDate, lte: ASSIGNMENT.endDate },
      }),
      data: { siteAssignmentId: 'sa-1' },
    });
    expect(entryService.classifyEntry).toHaveBeenCalledTimes(1);
  });
});
