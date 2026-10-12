import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SiteAssignmentStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { SiteAssignmentService } from './site-assignment.service';

const APPROVAL_ID = 'approval-1';
const ASSIGNMENT_ID = 'assignment-1';
const COMPANY_ID = 'company-1';
const EMPLOYEE_ID = 'employee-1';

describe('SiteAssignmentService.onApprovalDecision', () => {
  let service: SiteAssignmentService;
  let prisma: {
    siteAssignment: {
      findFirst: jest.Mock<() => Promise<unknown>>;
      update: jest.Mock<() => Promise<unknown>>;
    };
  };
  let attendanceService: {
    recalculateCompanyAttendanceMonth: jest.Mock<
      () => Promise<{ updated: number }>
    >;
  };

  beforeEach(() => {
    prisma = {
      siteAssignment: {
        findFirst: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<() => Promise<unknown>>(),
      },
    };
    attendanceService = {
      recalculateCompanyAttendanceMonth: jest
        .fn<() => Promise<{ updated: number }>>()
        .mockResolvedValue({
          updated: 1,
        }),
    };

    service = new SiteAssignmentService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      attendanceService as unknown as AttendanceService,
      {} as never,
      {} as never,
    );
  });

  it('Approving at the single tier → APPROVED and attendance recalculates', async () => {
    const startDate = new Date(Date.UTC(2026, 7, 1));
    const endDate = new Date(Date.UTC(2026, 7, 15));

    prisma.siteAssignment.findFirst.mockResolvedValue({
      id: ASSIGNMENT_ID,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      startDate,
      endDate,
      status: SiteAssignmentStatus.IN_REVIEW,
    });
    prisma.siteAssignment.update.mockResolvedValue({});

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
    ).toHaveBeenCalledWith(COMPANY_ID, 8, 2026, EMPLOYEE_ID);
  });
});
