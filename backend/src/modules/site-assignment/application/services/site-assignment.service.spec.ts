import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SiteAssignmentStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { SiteAssignmentService } from './site-assignment.service';

const APPROVAL_ID = 'approval-1';
const ASSIGNMENT_ID = 'assignment-1';
const COMPANY_ID = 'company-1';
const EMPLOYEE_ID = 'employee-1';
const HR_ID = 'hr-1';
const SUPERVISOR_ID = 'supervisor-1';
const ABOVE_ID = 'above-supervisor-1';
const REPORT_A = 'report-a';
const REPORT_B = 'report-b';
const OUTSIDER_ID = 'outsider-1';

type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const asyncMock = (value?: unknown): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(value);

describe('SiteAssignmentService', () => {
  let service: SiteAssignmentService;
  let prisma: {
    siteAssignment: {
      findFirst: AsyncMock;
      findMany: AsyncMock;
      update: AsyncMock;
      create: AsyncMock;
    };
    approvalRequest: { update: AsyncMock };
    user: { findFirst: AsyncMock };
  };
  let attendanceService: { recalculateCompanyAttendanceMonth: AsyncMock };
  let audit: { create: AsyncMock; buildFromRequestContext: jest.Mock };
  let overtimeSiteSync: {
    syncAfterApproval: AsyncMock;
    syncAfterRemoval: AsyncMock;
    countAffected: AsyncMock;
  };
  let permissionService: { hasPermission: AsyncMock };
  let notificationService: { send: AsyncMock };
  let backdatingPolicy: { validateSubmissionDates: AsyncMock };
  let dayCoverage: { assertUncovered: AsyncMock };

  const approvedRow = {
    id: ASSIGNMENT_ID,
    companyId: COMPANY_ID,
    employeeId: EMPLOYEE_ID,
    requestNumber: 'SA-0001',
    startDate: new Date(Date.UTC(2026, 8, 1)),
    endDate: new Date(Date.UTC(2026, 8, 15)),
    reason: null,
    status: SiteAssignmentStatus.APPROVED,
    isLateSubmission: false,
  };

  beforeEach(() => {
    prisma = {
      siteAssignment: {
        findFirst: asyncMock(),
        findMany: asyncMock([]),
        update: asyncMock({}),
        create: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: ASSIGNMENT_ID,
            ...args.data,
          })),
      },
      approvalRequest: { update: asyncMock({}) },
      approvalCategory: {
        findFirst: asyncMock({ numberPrefix: 'SA' }),
      },
      user: {
        findFirst: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockImplementation(async (args: { where: { id?: string } }) => {
            const id = args.where.id;
            if (id === EMPLOYEE_ID) {
              return { id, reportsToUserId: SUPERVISOR_ID };
            }
            if (id === SUPERVISOR_ID) {
              return { id, firstName: 'Sup', middleName: null, lastName: 'One' };
            }
            if (id === REPORT_A) {
              return { id, reportsToUserId: SUPERVISOR_ID };
            }
            if (id === OUTSIDER_ID) {
              return { id, reportsToUserId: null };
            }
            return null;
          }),
      },
      $queryRawUnsafe: asyncMock([{ nextval: 42 }]),
    };
    attendanceService = {
      recalculateCompanyAttendanceMonth: asyncMock({ updated: 1 }),
    };
    audit = {
      create: asyncMock(undefined),
      buildFromRequestContext: jest.fn((input: unknown) => input),
    };
    overtimeSiteSync = {
      syncAfterApproval: asyncMock(undefined),
      syncAfterRemoval: asyncMock({ unsubmitted: 1, submitted: 2 }),
      countAffected: asyncMock({ unsubmitted: 1, submitted: 2 }),
    };
    permissionService = {
      hasPermission: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockImplementation(async (...args: unknown[]) => {
          const [userId, , module, action] = args as [string, string, string, string];
          if (userId !== HR_ID) {
            return false;
          }
          return (
            (module === 'site-assignment' && action === 'manage') ||
            (module === 'hr' && action === 'view')
          );
        }),
    };
    notificationService = { send: asyncMock({ inAppId: 'n-1', emailQueued: false }) };
    backdatingPolicy = {
      validateSubmissionDates: asyncMock({
        isLateSubmission: false,
        lateReason: null,
      }),
    };
    dayCoverage = { assertUncovered: asyncMock(undefined) };

    service = new SiteAssignmentService(
      prisma as unknown as PrismaService,
      {} as never,
      permissionService as never,
      notificationService as never,
      attendanceService as unknown as AttendanceService,
      dayCoverage as never,
      backdatingPolicy as never,
      audit as never,
      overtimeSiteSync as never,
    );
  });

  it('Approving at the single tier → APPROVED, attendance recalculates, OT linked, audited', async () => {
    prisma.siteAssignment.findFirst.mockResolvedValue({
      ...approvedRow,
      status: SiteAssignmentStatus.IN_REVIEW,
    });

    await service.onApprovalDecision(APPROVAL_ID, 'APPROVED');

    expect(prisma.siteAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSIGNMENT_ID },
        data: expect.objectContaining({
          status: SiteAssignmentStatus.APPROVED,
        }),
      }),
    );
    expect(
      attendanceService.recalculateCompanyAttendanceMonth,
    ).toHaveBeenCalledWith(COMPANY_ID, 9, 2026, EMPLOYEE_ID);
    expect(overtimeSiteSync.syncAfterApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: ASSIGNMENT_ID }),
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'site_assignment',
        action: 'approve',
        recordId: ASSIGNMENT_ID,
      }),
    );
  });

  it('Rejecting does not link overtime but is audited', async () => {
    prisma.siteAssignment.findFirst.mockResolvedValue({
      ...approvedRow,
      status: SiteAssignmentStatus.IN_REVIEW,
    });

    await service.onApprovalDecision(APPROVAL_ID, 'REJECTED');

    expect(overtimeSiteSync.syncAfterApproval).not.toHaveBeenCalled();
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reject' }),
    );
  });

  it('rejects self-submission', async () => {
    await expect(
      service.submitRequest(
        {
          employeeId: SUPERVISOR_ID,
          siteName: 'Dam site',
          startDate: '2026-11-02',
          endDate: '2026-11-06',
        },
        COMPANY_ID,
        SUPERVISOR_ID,
      ),
    ).rejects.toThrow('You cannot submit a site assignment for yourself');
  });

  it('supervisor creates an immediately approved assignment for a direct report', async () => {
    prisma.siteAssignment.findMany.mockResolvedValue([]);
    jest.spyOn(service, 'getDetail').mockResolvedValue({ id: ASSIGNMENT_ID });

    await service.submitRequest(
      {
        employeeId: REPORT_A,
        siteName: 'Dam site',
        startDate: '2026-11-02',
        endDate: '2026-11-06',
      },
      COMPANY_ID,
      SUPERVISOR_ID,
    );

    expect(prisma.siteAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: REPORT_A,
          status: SiteAssignmentStatus.APPROVED,
          createdBy: SUPERVISOR_ID,
          approvalRequestId: null,
        }),
      }),
    );
    expect(notificationService.send).toHaveBeenCalled();
    expect(overtimeSiteSync.syncAfterApproval).toHaveBeenCalled();
  });

  it('HR cancel → OT synced from the start date and audited with counts', async () => {
    prisma.siteAssignment.findFirst.mockResolvedValue(approvedRow);
    jest.spyOn(service, 'getDetail').mockResolvedValue({});

    await service.cancelApproved(ASSIGNMENT_ID, COMPANY_ID, HR_ID, 'Returned early');

    expect(overtimeSiteSync.syncAfterRemoval).toHaveBeenCalledWith(
      approvedRow,
      approvedRow.startDate,
      'ASSIGNMENT_CANCELLED',
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cancel',
        userId: HR_ID,
        afterValue: expect.objectContaining({
          overtimeReclassified: 1,
          overtimeFlagged: 2,
        }),
      }),
    );
  });

  it('HR shorten → OT synced from the day after the new end and audited', async () => {
    prisma.siteAssignment.findFirst.mockResolvedValue(approvedRow);
    jest.spyOn(service, 'getDetail').mockResolvedValue({});

    await service.shortenApproved(
      ASSIGNMENT_ID,
      { endDate: '2026-09-10', reason: 'Work finished' },
      COMPANY_ID,
      HR_ID,
    );

    expect(overtimeSiteSync.syncAfterRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ id: ASSIGNMENT_ID }),
      new Date(Date.UTC(2026, 8, 11)),
      'ASSIGNMENT_SHORTENED',
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'shorten',
        beforeValue: { endDate: '2026-09-15' },
        afterValue: expect.objectContaining({ endDate: '2026-09-10' }),
      }),
    );
  });

  it('OT impact for a shorten counts from the day after the new end', async () => {
    prisma.siteAssignment.findFirst.mockResolvedValue(approvedRow);

    const counts = await service.getOvertimeImpact(
      ASSIGNMENT_ID,
      COMPANY_ID,
      HR_ID,
      '2026-09-15',
    );

    expect(counts).toEqual({ unsubmitted: 1, submitted: 2 });
    expect(overtimeSiteSync.countAffected).toHaveBeenCalledWith(
      approvedRow,
      new Date(Date.UTC(2026, 8, 16)),
    );
  });

  it('OT impact requires HR', async () => {
    permissionService.hasPermission.mockResolvedValue(false);
    await expect(
      service.getOvertimeImpact(ASSIGNMENT_ID, COMPANY_ID, EMPLOYEE_ID),
    ).rejects.toThrow('HR access required');
  });

  it('uses reason as lateReason fallback for backdating validation', async () => {
    prisma.siteAssignment.findMany.mockResolvedValue([]);
    jest.spyOn(service, 'getDetail').mockResolvedValue({ id: ASSIGNMENT_ID });

    await service.submitRequest(
      {
        employeeId: REPORT_A,
        siteName: 'Dam site',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        reason: 'Backfilled from attendance',
      },
      COMPANY_ID,
      SUPERVISOR_ID,
    );

    expect(backdatingPolicy.validateSubmissionDates).toHaveBeenCalledWith(
      expect.objectContaining({
        lateReason: 'Backfilled from attendance',
      }),
    );
  });

  it('supervisor cannot assign an employee outside their team', async () => {
    await expect(
      service.submitRequest(
        {
          employeeId: OUTSIDER_ID,
          siteName: 'Dam site',
          startDate: '2026-11-02',
          endDate: '2026-11-06',
        },
        COMPANY_ID,
        SUPERVISOR_ID,
      ),
    ).rejects.toThrow('You may only submit site assignments for your direct reports');
  });
});
