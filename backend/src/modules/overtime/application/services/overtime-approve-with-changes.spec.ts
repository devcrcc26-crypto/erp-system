import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { OvertimeSheetStatus, PayrollRunStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import type { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import type { AuditService } from '../../../audit/application/services/audit.service';
import type { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import type { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import type { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import type { IStorageService } from '../../../../shared/storage/storage.interface';
import { PAYROLL_LOCKED_MESSAGE } from '../utils/overtime-entry-guards.util';
import { OvertimeService } from './overtime.service';
import type { OvertimeEntryService } from './overtime-entry.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000201';
const APPROVER_ID = '00000000-0000-4000-8000-000000000202';
const SHEET_ID = '00000000-0000-4000-8000-000000000301';
const ENTRY_1 = '00000000-0000-4000-8000-000000000311';
const ENTRY_2 = '00000000-0000-4000-8000-000000000312';

function classified(hours: number) {
  return {
    isHoliday: false,
    regularHours: hours,
    nightHours: 0,
    weekendHours: 0,
    holidayHours: 0,
    totalHours: hours,
    attendanceWarning: null,
    siteAssignmentId: null,
    siteWithinScheduleHours: 0,
  };
}

function makeEntry(
  id: string,
  opts?: { start?: string; end?: string; hours?: number; task?: string },
) {
  const start = opts?.start ?? '18:00';
  const end = opts?.end ?? '21:00';
  const hours = opts?.hours ?? 3;
  return {
    id,
    sheetId: SHEET_ID,
    date: new Date('2026-11-10T00:00:00.000Z'),
    startTime: new Date(`1970-01-01T${start}:00.000Z`),
    endTime: new Date(`1970-01-01T${end}:00.000Z`),
    endsAtEndOfDay: false,
    isHoliday: false,
    isOvernight: false,
    regularHours: hours,
    nightHours: 0,
    weekendHours: 0,
    holidayHours: 0,
    totalHours: hours,
    taskDescription: opts?.task ?? 'Pour concrete',
    claimedByRunId: null,
    claimedByRun: null,
  };
}

function makeService(options?: {
  payrollLocked?: boolean;
  sheetStatus?: OvertimeSheetStatus;
}): {
  service: OvertimeService;
  sheetUpdate: jest.Mock;
  entryDelete: jest.Mock;
  entryUpdate: jest.Mock;
  entryCreate: jest.Mock;
  classifyEntry: jest.Mock;
} {
  const entries = [makeEntry(ENTRY_1), makeEntry(ENTRY_2, { start: '21:00', end: '22:00', hours: 1, task: 'Cleanup' })];
  let liveEntries = [...entries];

  const sheetUpdate = jest.fn(async () => ({}));
  const entryDelete = jest.fn(async ({ where }: { where: { id: string } }) => {
    liveEntries = liveEntries.filter((e) => e.id !== where.id);
    return {};
  });
  const entryUpdate = jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    liveEntries = liveEntries.map((e) =>
      e.id === where.id
        ? {
            ...e,
            ...data,
            regularHours: Number(data.regularHours ?? e.regularHours),
            nightHours: Number(data.nightHours ?? e.nightHours),
            weekendHours: Number(data.weekendHours ?? e.weekendHours),
            holidayHours: Number(data.holidayHours ?? e.holidayHours),
            totalHours:
              Number(data.regularHours ?? e.regularHours) +
              Number(data.nightHours ?? e.nightHours) +
              Number(data.weekendHours ?? e.weekendHours) +
              Number(data.holidayHours ?? e.holidayHours),
          }
        : e,
    );
    return {};
  });
  const entryCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const created = {
      id: String(data.id),
      sheetId: SHEET_ID,
      date: data.date as Date,
      startTime: data.startTime as Date,
      endTime: data.endTime as Date,
      endsAtEndOfDay: false,
      isHoliday: Boolean(data.isHoliday),
      isOvernight: Boolean(data.isOvernight),
      regularHours: Number(data.regularHours),
      nightHours: Number(data.nightHours),
      weekendHours: Number(data.weekendHours),
      holidayHours: Number(data.holidayHours),
      totalHours:
        Number(data.regularHours) +
        Number(data.nightHours) +
        Number(data.weekendHours) +
        Number(data.holidayHours),
      taskDescription: String(data.taskDescription),
      claimedByRunId: null,
      claimedByRun: null,
    };
    liveEntries = [...liveEntries, created];
    return created;
  });

  const classifyEntry = jest.fn(
    async (
      _employeeId: string,
      _companyId: string,
      _date: Date,
      startTime: string,
      endTime: string,
    ) => {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const hours = (eh! * 60 + em! - (sh! * 60 + sm!)) / 60;
      return classified(hours);
    },
  );

  const prisma = {
    overtimeSheet: {
      findFirst: jest.fn(async () => ({
        id: SHEET_ID,
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        month: 11,
        year: 2026,
        status: options?.sheetStatus ?? OvertimeSheetStatus.SUBMITTED,
        lastApprovedSnapshot: null,
        approverAdjustment: null,
        entries: liveEntries.map((e) => ({ ...e })),
      })),
      update: sheetUpdate,
    },
    overtimeEntry: {
      findMany: jest.fn(async () => liveEntries.map((e) => ({ ...e }))),
      delete: entryDelete,
      update: entryUpdate,
      create: entryCreate,
    },
    payrollRun: {
      findFirst: jest.fn(async () =>
        options?.payrollLocked
          ? { id: 'run-1', status: PayrollRunStatus.GM_APPROVED }
          : null,
      ),
    },
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };

  // After txn, findFirst returns sheet with adjustment from last update.
  let lastAdjustment: unknown = null;
  sheetUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    if (data.approverAdjustment) {
      lastAdjustment = data.approverAdjustment;
    }
    return {};
  });
  const originalFindFirst = prisma.overtimeSheet.findFirst;
  prisma.overtimeSheet.findFirst = jest.fn(async (args?: { include?: unknown }) => {
    const base = await originalFindFirst(args);
    if (lastAdjustment && args?.include) {
      return {
        ...base,
        approverAdjustment: lastAdjustment,
        entries: liveEntries.map((e) => ({ ...e })),
      };
    }
    return base;
  });

  const service = new OvertimeService(
    prisma as unknown as PrismaService,
    {} as unknown as ApprovalsService,
    {} as unknown as HrApprovalChainService,
    {} as unknown as ApprovalDecisionRegistry,
    {
      hasPermission: jest.fn(async () => false),
    } as unknown as PermissionService,
    { classifyEntry } as unknown as OvertimeEntryService,
    {} as unknown as WorkScheduleService,
    {} as unknown as OnBehalfService,
    {} as unknown as AuditService,
    {} as unknown as IStorageService,
  );

  return {
    service,
    sheetUpdate,
    entryDelete,
    entryUpdate,
    entryCreate,
    classifyEntry,
  };
}

describe('OvertimeService.applyApproverChanges', () => {
  it('shortens one entry and removes another with reasons', async () => {
    const { service, entryDelete, entryUpdate, sheetUpdate } = makeService();

    const result = await service.applyApproverChanges(
      SHEET_ID,
      COMPANY_ID,
      APPROVER_ID,
      {
        entries: [
          {
            id: ENTRY_1,
            date: '2026-11-10',
            startTime: '18:00',
            endTime: '20:00',
            taskDescription: 'Pour concrete',
            reason: 'Shortened evening pour',
          },
        ],
        removedEntries: [
          {
            id: ENTRY_2,
            reason: 'Cleanup not worked',
          },
        ],
      },
    );

    expect(entryUpdate).toHaveBeenCalled();
    expect(entryDelete).toHaveBeenCalledWith({ where: { id: ENTRY_2 } });
    expect(sheetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approverAdjustment: expect.objectContaining({
            previousTotalHours: 4,
            newTotalHours: 2,
            changes: expect.arrayContaining([
              expect.objectContaining({ kind: 'updated', increased: false }),
              expect.objectContaining({ kind: 'removed' }),
            ]),
          }),
        }),
      }),
    );
    expect(result.previousTotalHours).toBe(4);
    expect(result.newTotalHours).toBe(2);
    expect(result.timelineNote).toContain('Approved with changes');
  });

  it('extends time, adds entry, changes date and flags increases', async () => {
    const { service, entryCreate, sheetUpdate } = makeService();

    const result = await service.applyApproverChanges(
      SHEET_ID,
      COMPANY_ID,
      APPROVER_ID,
      {
        entries: [
          {
            id: ENTRY_1,
            date: '2026-11-11',
            startTime: '17:00',
            endTime: '22:00',
            taskDescription: 'Pour concrete',
            reason: 'Extended and moved to next day',
          },
          {
            id: ENTRY_2,
            date: '2026-11-10',
            startTime: '21:00',
            endTime: '22:00',
            taskDescription: 'Cleanup',
          },
          {
            date: '2026-11-12',
            startTime: '18:00',
            endTime: '20:00',
            taskDescription: 'Extra formwork',
            reason: 'Missed site hours added',
          },
        ],
      },
    );

    expect(entryCreate).toHaveBeenCalled();
    expect(result.newTotalHours).toBeGreaterThan(result.previousTotalHours);
    expect(sheetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approverAdjustment: expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                kind: 'updated',
                increased: true,
              }),
              expect.objectContaining({
                kind: 'added',
                increased: true,
              }),
            ]),
          }),
        }),
      }),
    );
    expect(result.timelineNote).toMatch(/\d+h → \d+h/);
  });

  it('rejects short change reasons', async () => {
    const { service } = makeService();
    await expect(
      service.applyApproverChanges(SHEET_ID, COMPANY_ID, APPROVER_ID, {
        entries: [
          {
            id: ENTRY_1,
            date: '2026-11-10',
            startTime: '18:00',
            endTime: '20:00',
            taskDescription: 'Pour concrete',
            reason: 'no',
          },
          {
            id: ENTRY_2,
            date: '2026-11-10',
            startTime: '21:00',
            endTime: '22:00',
            taskDescription: 'Cleanup',
          },
        ],
      }),
    ).rejects.toThrow('Enter a reason so the submitter knows what to change.');
  });

  it('rejects when payroll is locked', async () => {
    const { service } = makeService({ payrollLocked: true });
    await expect(
      service.applyApproverChanges(SHEET_ID, COMPANY_ID, APPROVER_ID, {
        entries: [
          {
            id: ENTRY_1,
            date: '2026-11-10',
            startTime: '18:00',
            endTime: '20:00',
            taskDescription: 'Pour concrete',
            reason: 'Shortened evening pour',
          },
          {
            id: ENTRY_2,
            date: '2026-11-10',
            startTime: '21:00',
            endTime: '22:00',
            taskDescription: 'Cleanup',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.applyApproverChanges(SHEET_ID, COMPANY_ID, APPROVER_ID, {
        entries: [
          {
            id: ENTRY_1,
            date: '2026-11-10',
            startTime: '18:00',
            endTime: '20:00',
            taskDescription: 'Pour concrete',
            reason: 'Shortened evening pour',
          },
          {
            id: ENTRY_2,
            date: '2026-11-10',
            startTime: '21:00',
            endTime: '22:00',
            taskDescription: 'Cleanup',
          },
        ],
      }),
    ).rejects.toThrow(PAYROLL_LOCKED_MESSAGE);
  });

  it('rejects outside sheet month', async () => {
    const { service } = makeService();
    await expect(
      service.applyApproverChanges(SHEET_ID, COMPANY_ID, APPROVER_ID, {
        entries: [
          {
            id: ENTRY_1,
            date: '2026-10-10',
            startTime: '18:00',
            endTime: '20:00',
            taskDescription: 'Pour concrete',
            reason: 'Wrong month attempt',
          },
          {
            id: ENTRY_2,
            date: '2026-11-10',
            startTime: '21:00',
            endTime: '22:00',
            taskDescription: 'Cleanup',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
