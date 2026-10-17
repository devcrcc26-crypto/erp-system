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
  let approvalsService: { submitRequest: AsyncMock };
  let attendanceService: { recalculateCompanyAttendanceMonth: AsyncMock };
  let audit: { create: AsyncMock; buildFromRequestContext: jest.Mock };
  let overtimeSiteSync: {
    syncAfterApproval: AsyncMock;
    syncAfterRemoval: AsyncMock;
    countAffected: AsyncMock;
  };
  let permissionService: { hasPermission: AsyncMock };
  let onBehalfService: {
    resolveHrProcessSubjectId: AsyncMock;
    resolveInitiation: AsyncMock;
    recordOnBehalfCreate: AsyncMock;
  };
  let hrApprovalChain: {
    buildSiteAssignmentApprovalChain: AsyncMock;
    startChainAboveSubmitter: AsyncMock;
  };
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
        create: asyncMock({}),
      },
      approvalRequest: { update: asyncMock({}) },
      user: { findFirst: asyncMock({ firstName: 'Crew', lastName: 'Member', employeeId: null }) },
    };
    let approvalSeq = 0;
    approvalsService = {
      submitRequest: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockImplementation(async () => {
          approvalSeq += 1;
          return { id: `approval-${approvalSeq}`, requestNumber: `SA-${approvalSeq}` };
        }),
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
    onBehalfService = {
      resolveHrProcessSubjectId: asyncMock(EMPLOYEE_ID),
      // Direct reports of SUPERVISOR_ID file as SUPERVISOR; OUTSIDER_ID is out of scope.
      resolveInitiation: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockImplementation(async (...args: unknown[]) => {
          const [actor, , , target] = args as [string, string, string, string | null];
          if (!target || target === actor) {
            throw new ForbiddenException("You can't file a site assignment for yourself.");
          }
          if (target === OUTSIDER_ID) {
            throw new ForbiddenException("You can't file a site assignment for this employee.");
          }
          return {
            employeeId: target,
            initiatedAs: actor === SUPERVISOR_ID ? 'SUPERVISOR' : 'DELEGATE',
          };
        }),
      recordOnBehalfCreate: asyncMock(undefined),
    };
    hrApprovalChain = {
      buildSiteAssignmentApprovalChain: asyncMock([]),
      startChainAboveSubmitter: asyncMock([
        {
          tierOrder: 1,
          label: "Submitter's Reports to",
          approverId: ABOVE_ID,
          resolver: 'SUBMITTER_REPORTS_TO',
        },
      ]),
    };
    backdatingPolicy = {
      validateSubmissionDates: asyncMock({
        isLateSubmission: false,
        lateReason: null,
      }),
    };
    dayCoverage = { assertUncovered: asyncMock(undefined) };

    service = new SiteAssignmentService(
      prisma as unknown as PrismaService,
      approvalsService as never,
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
          onBehalfOfEmployeeId: EMPLOYEE_ID,
        } as never,
        COMPANY_ID,
        HR_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(approvalsService.submitRequest).not.toHaveBeenCalled();
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

  describe('initiators and crews', () => {
    const base = {
      siteName: 'Dam site',
      startDate: '2026-11-02',
      endDate: '2026-11-06',
    };
    const reportsToTier = [
      { tierOrder: 1, label: 'Reports to', approverId: SUPERVISOR_ID, resolver: 'REPORTS_TO' },
    ];

    beforeEach(() => {
      hrApprovalChain.buildSiteAssignmentApprovalChain.mockResolvedValue(reportsToTier);
      jest.spyOn(service, 'getDetail').mockImplementation(async (id: string) => ({ id }));
    });

    it('supervisor files for a direct report: chain starts above the supervisor, initiatedAs recorded', async () => {
      await service.submitRequest(
        { ...base, onBehalfOfEmployeeId: REPORT_A } as never,
        COMPANY_ID,
        SUPERVISOR_ID,
      );

      expect(hrApprovalChain.startChainAboveSubmitter).toHaveBeenCalledWith(
        reportsToTier,
        SUPERVISOR_ID,
        COMPANY_ID,
      );
      const [, , subject, options] = approvalsService.submitRequest.mock.calls[0] as [
        unknown,
        string,
        string,
        { initiatedAs: string; createdByUserId: string; resolvedTiers: { tiers: Array<{ approverId: string }> } },
      ];
      expect(subject).toBe(REPORT_A);
      expect(options.initiatedAs).toBe('SUPERVISOR');
      expect(options.createdByUserId).toBe(SUPERVISOR_ID);
      expect(options.resolvedTiers.tiers.map((t) => t.approverId)).toEqual([ABOVE_ID]);
    });

    it('delegate filing keeps the normal chain', async () => {
      await service.submitRequest(
        { ...base, onBehalfOfEmployeeId: REPORT_A } as never,
        COMPANY_ID,
        HR_ID,
      );
      expect(hrApprovalChain.startChainAboveSubmitter).not.toHaveBeenCalled();
      const options = approvalsService.submitRequest.mock.calls[0]?.[3] as { initiatedAs: string };
      expect(options.initiatedAs).toBe('DELEGATE');
    });

    it('self filing is refused for site assignments', async () => {
      await expect(
        service.submitRequest(base as never, COMPANY_ID, REPORT_A),
      ).rejects.toThrow("You can't file a site assignment for yourself.");
      expect(approvalsService.submitRequest).not.toHaveBeenCalled();
    });

    it('crew: one assignment and one approval request per member, sharing a crewId', async () => {
      const result = (await service.submitRequest(
        { ...base, crewEmployeeIds: [REPORT_A, REPORT_B] } as never,
        COMPANY_ID,
        SUPERVISOR_ID,
      )) as { crewId: string; assignments: unknown[] };

      expect(approvalsService.submitRequest).toHaveBeenCalledTimes(2);
      expect(prisma.siteAssignment.create).toHaveBeenCalledTimes(2);
      const crewIds = prisma.siteAssignment.create.mock.calls.map(
        (call) => (call[0] as { data: { crewId: string; employeeId: string } }).data,
      );
      expect(crewIds.map((d) => d.employeeId)).toEqual([REPORT_A, REPORT_B]);
      expect(new Set(crewIds.map((d) => d.crewId))).toEqual(new Set([result.crewId]));
      expect(result.assignments).toHaveLength(2);
      // Each member's chain starts above the submitting supervisor.
      expect(hrApprovalChain.startChainAboveSubmitter).toHaveBeenCalledTimes(2);
    });

    it('crew: all-or-nothing - one invalid member and nothing is created', async () => {
      await expect(
        service.submitRequest(
          { ...base, crewEmployeeIds: [REPORT_A, OUTSIDER_ID, REPORT_B] } as never,
          COMPANY_ID,
          SUPERVISOR_ID,
        ),
      ).rejects.toThrow('No site assignments were created. 1 crew member(s) failed validation.');
      expect(approvalsService.submitRequest).not.toHaveBeenCalled();
      expect(prisma.siteAssignment.create).not.toHaveBeenCalled();
    });

    it('crew: the submitter cannot be a crew member', async () => {
      await expect(
        service.submitRequest(
          { ...base, crewEmployeeIds: [REPORT_A, SUPERVISOR_ID] } as never,
          COMPANY_ID,
          SUPERVISOR_ID,
        ),
      ).rejects.toThrow('not for yourself');
      expect(approvalsService.submitRequest).not.toHaveBeenCalled();
    });

    it('crew: a failure while creating cancels the members already created', async () => {
      prisma.siteAssignment.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('db down'));
      prisma.siteAssignment.update.mockResolvedValue({
        id: 'created-1',
        requestNumber: 'SA-1',
        approvalRequestId: 'approval-1',
      });

      await expect(
        service.submitRequest(
          { ...base, crewEmployeeIds: [REPORT_A, REPORT_B] } as never,
          COMPANY_ID,
          SUPERVISOR_ID,
        ),
      ).rejects.toThrow('db down');

      expect(prisma.siteAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SiteAssignmentStatus.CANCELLED }),
        }),
      );
      // The failed member's approval and the rolled-back member's approval are cancelled.
      expect(prisma.approvalRequest.update).toHaveBeenCalledTimes(2);
    });
  });
});
