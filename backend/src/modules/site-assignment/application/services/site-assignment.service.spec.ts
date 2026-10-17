import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { SiteAssignmentStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { SiteAssignmentService } from './site-assignment.service';

const APPROVAL_ID = 'approval-1';
const ASSIGNMENT_ID = 'assignment-1';
const COMPANY_ID = 'company-1';
const EMPLOYEE_ID = 'employee-1';
const HR_ID = 'hr-1';

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
    };
  };
  let attendanceService: { recalculateCompanyAttendanceMonth: AsyncMock };
  let audit: { create: AsyncMock; buildFromRequestContext: jest.Mock };
  let overtimeSiteSync: {
    syncAfterApproval: AsyncMock;
    syncAfterRemoval: AsyncMock;
    countAffected: AsyncMock;
  };
  let permissionService: { hasPermission: AsyncMock };
  let onBehalfService: { resolveHrProcessSubjectId: AsyncMock };
  let hrApprovalChain: { buildSiteAssignmentApprovalChain: AsyncMock };
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
      },
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
    permissionService = { hasPermission: asyncMock(true) };
    onBehalfService = { resolveHrProcessSubjectId: asyncMock(EMPLOYEE_ID) };
    hrApprovalChain = { buildSiteAssignmentApprovalChain: asyncMock([]) };
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
      hrApprovalChain as never,
      {} as never,
      onBehalfService as never,
      permissionService as never,
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

  it('Empty approval chain → rejected, never auto-approved', async () => {
    await expect(
      service.submitRequest(
        {
          siteName: 'Dam site',
          startDate: '2026-11-02',
          endDate: '2026-11-06',
        } as never,
        COMPANY_ID,
        EMPLOYEE_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Delegate auto-approve tier is rejected for site assignments', async () => {
    await expect(
      service.submitRequest(
        {
          siteName: 'Dam site',
          startDate: '2026-11-02',
          endDate: '2026-11-06',
          onBehalfOfEmployeeId: EMPLOYEE_ID,
          autoApproveTier: true,
        } as never,
        COMPANY_ID,
        HR_ID,
      ),
    ).rejects.toThrow('Auto-approve is not available for site assignments');
    expect(onBehalfService.resolveHrProcessSubjectId).not.toHaveBeenCalled();
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
});
