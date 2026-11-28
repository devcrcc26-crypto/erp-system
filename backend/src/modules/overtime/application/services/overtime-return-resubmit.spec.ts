import { describe, expect, it, jest } from '@jest/globals';
import { OvertimeSheetStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import type { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import type { AuditService } from '../../../audit/application/services/audit.service';
import type { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import type { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import type { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import type { IStorageService } from '../../../../shared/storage/storage.interface';
import {
  buildOvertimeApprovedSnapshot,
} from '../utils/overtime-edit-snapshot.util';
import { OvertimeService } from './overtime.service';
import type { OvertimeEntryService } from './overtime-entry.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000201';
const SHEET_ID = '00000000-0000-4000-8000-000000000301';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000401';

const baseEntry = {
  id: 'entry-1',
  date: new Date('2026-11-10T00:00:00.000Z'),
  startTime: new Date('1970-01-01T18:00:00.000Z'),
  endTime: new Date('1970-01-01T21:00:00.000Z'),
  endsAtEndOfDay: false,
  isHoliday: false,
  isOvernight: false,
  regularHours: 3,
  nightHours: 0,
  weekendHours: 0,
  holidayHours: 0,
  totalHours: 3,
  taskDescription: 'Pour concrete',
};

function makeService(sheet: Record<string, unknown>): {
  service: OvertimeService;
  approvals: {
    resubmitRequest: jest.Mock;
    restartChainAfterEdit: jest.Mock;
  };
} {
  const approvals = {
    resubmitRequest: jest.fn(async () => ({})),
    restartChainAfterEdit: jest.fn(async () => undefined),
  };

  const prisma = {
    overtimeSheet: {
      findFirst: jest.fn(async () => sheet),
      update: jest.fn(async () => ({})),
    },
    approvalRequest: {
      findFirst: jest.fn(async () => ({
        tiers: [
          {
            tierOrder: 1,
            label: 'Reports to',
            decision: 'APPROVED',
          },
          {
            tierOrder: 2,
            label: 'HR Manager',
            decision: 'RETURNED',
          },
        ],
      })),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };

  const overtimeEntryService = {
    collectUnregisteredHolidayDates: jest.fn(async () => []),
  };

  const permissionService = {
    hasPermission: jest.fn(async () => false),
  };

  const service = new OvertimeService(
    prisma as unknown as PrismaService,
    approvals as unknown as ApprovalsService,
    {} as unknown as HrApprovalChainService,
    {} as unknown as ApprovalDecisionRegistry,
    permissionService as unknown as PermissionService,
    overtimeEntryService as unknown as OvertimeEntryService,
    {} as unknown as WorkScheduleService,
    {} as unknown as OnBehalfService,
    {} as unknown as AuditService,
    {} as unknown as IStorageService,
  );

  // Bypass ownership / view helpers used after submit.
  (
    service as unknown as {
      canActForEmployee: () => Promise<boolean>;
      getSheet: () => Promise<unknown>;
      mergeApprovalFormData: () => Promise<void>;
    }
  ).canActForEmployee = async () => true;
  (
    service as unknown as { getSheet: () => Promise<unknown> }
  ).getSheet = async () => ({ id: SHEET_ID, status: 'SUBMITTED' });
  (
    service as unknown as { mergeApprovalFormData: () => Promise<void> }
  ).mergeApprovalFormData = async () => undefined;

  return { service, approvals };
}

describe('OvertimeService.submitSheet - returned resubmit paths', () => {
  it('restarts from first approver when entries changed since return', async () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const changedEntry = {
      ...baseEntry,
      startTime: new Date('1970-01-01T17:00:00.000Z'),
      regularHours: 4,
      totalHours: 4,
    };
    const { service, approvals } = makeService({
      id: SHEET_ID,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      month: 11,
      year: 2026,
      status: OvertimeSheetStatus.RETURNED,
      approvalRequestId: APPROVAL_ID,
      lastApprovedSnapshot: snapshot,
      totalRegularHours: 4,
      totalNightHours: 0,
      totalWeekendHours: 0,
      totalHolidayHours: 0,
      entries: [changedEntry],
    });

    await service.submitSheet(SHEET_ID, COMPANY_ID, EMPLOYEE_ID);

    expect(approvals.restartChainAfterEdit).toHaveBeenCalledWith(
      APPROVAL_ID,
      COMPANY_ID,
      EMPLOYEE_ID,
      'Resubmitted with changes – restarted from first approver',
      { restartFromFirst: true },
    );
    expect(approvals.resubmitRequest).not.toHaveBeenCalled();
  });

  it('resumes at the returned tier when only attachments changed (entries unchanged)', async () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const { service, approvals } = makeService({
      id: SHEET_ID,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      month: 11,
      year: 2026,
      status: OvertimeSheetStatus.RETURNED,
      approvalRequestId: APPROVAL_ID,
      lastApprovedSnapshot: snapshot,
      totalRegularHours: 3,
      totalNightHours: 0,
      totalWeekendHours: 0,
      totalHolidayHours: 0,
      entries: [baseEntry],
    });

    await service.submitSheet(SHEET_ID, COMPANY_ID, EMPLOYEE_ID);

    expect(approvals.resubmitRequest).toHaveBeenCalledWith(
      APPROVAL_ID,
      COMPANY_ID,
      EMPLOYEE_ID,
      'Resubmitted without changes – resumed at HR Manager',
      [],
    );
    expect(approvals.restartChainAfterEdit).not.toHaveBeenCalled();
  });
});
