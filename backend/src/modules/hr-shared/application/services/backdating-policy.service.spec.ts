import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import type { HrApprovalChainService } from './hr-approval-chain.service';
import { BackdatingPolicyService } from './backdating-policy.service';
import { firstDayOfMonthUtc } from '../utils/earliest-allowed-date.util';

const COMPANY = 'co-1';
const EMPLOYEE = 'emp-1';
const HR_USER = 'hr-1';
const TODAY = new Date(Date.UTC(2026, 9, 10));

describe('BackdatingPolicyService.validateSubmissionDates', () => {
  let service: BackdatingPolicyService;
  let prisma: {
    payrollRun: { findMany: jest.Mock<() => Promise<unknown>> };
    user: { findUnique: jest.Mock<() => Promise<unknown>> };
    employmentPeriod: { findMany: jest.Mock<() => Promise<unknown>> };
  };
  let hrChain: {
    isHrOrFullAccessActor: jest.Mock<() => Promise<boolean>>;
  };

  beforeEach(() => {
    prisma = {
      payrollRun: {
        findMany: jest.fn<() => Promise<unknown>>(async () => []),
      },
      user: {
        findUnique: jest.fn<() => Promise<unknown>>(async () => ({
          employmentDate: new Date(Date.UTC(2020, 0, 1)),
        })),
      },
      employmentPeriod: {
        findMany: jest.fn<() => Promise<unknown>>(async () => []),
      },
    };
    hrChain = {
      isHrOrFullAccessActor: jest.fn<() => Promise<boolean>>(
        async () => false,
      ),
    };
    service = new BackdatingPolicyService(
      prisma as unknown as PrismaService,
      {} as unknown as PermissionService,
      hrChain as unknown as HrApprovalChainService,
    );
  });

  it('employee Oct 10 → Sep 1 allowed, Aug blocked', async () => {
    await expect(
      service.validateSubmissionDates({
        companyId: COMPANY,
        actorUserId: EMPLOYEE,
        targetEmployeeId: EMPLOYEE,
        dates: [firstDayOfMonthUtc(9, 2026)],
        today: TODAY,
      }),
    ).resolves.toMatchObject({ isLateSubmission: true });

    await expect(
      service.validateSubmissionDates({
        companyId: COMPANY,
        actorUserId: EMPLOYEE,
        targetEmployeeId: EMPLOYEE,
        dates: [firstDayOfMonthUtc(8, 2026)],
        today: TODAY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('employee when Sep payroll is PAID → Oct 1 earliest', async () => {
    prisma.payrollRun.findMany.mockResolvedValue([
      { month: 9, year: 2026 },
    ]);

    await expect(
      service.validateSubmissionDates({
        companyId: COMPANY,
        actorUserId: EMPLOYEE,
        targetEmployeeId: EMPLOYEE,
        dates: [firstDayOfMonthUtc(9, 2026)],
        today: TODAY,
      }),
    ).rejects.toThrow(/finalised/);
  });

  it('HR on behalf August allowed with reason, rejected without', async () => {
    hrChain.isHrOrFullAccessActor.mockResolvedValue(true);

    await expect(
      service.validateSubmissionDates({
        companyId: COMPANY,
        actorUserId: HR_USER,
        targetEmployeeId: EMPLOYEE,
        dates: [firstDayOfMonthUtc(8, 2026)],
        lateReason: 'Missed while travelling',
        today: TODAY,
      }),
    ).resolves.toMatchObject({
      isLateSubmission: true,
      lateReason: 'Missed while travelling',
    });

    await expect(
      service.validateSubmissionDates({
        companyId: COMPANY,
        actorUserId: HR_USER,
        targetEmployeeId: EMPLOYEE,
        dates: [firstDayOfMonthUtc(8, 2026)],
        today: TODAY,
      }),
    ).rejects.toThrow(/Reason is required/);
  });

  it('any LOCKED month rejected for everyone', async () => {
    prisma.payrollRun.findMany.mockResolvedValue([
      { month: 8, year: 2026 },
    ]);
    hrChain.isHrOrFullAccessActor.mockResolvedValue(true);

    await expect(
      service.validateSubmissionDates({
        companyId: COMPANY,
        actorUserId: HR_USER,
        targetEmployeeId: EMPLOYEE,
        dates: [firstDayOfMonthUtc(8, 2026)],
        lateReason: 'Should not matter',
        today: TODAY,
      }),
    ).rejects.toThrow(/finalised/);
  });

  it('rejects dates after the last working day (field movement / WFH / site share this check)', async () => {
    prisma.employmentPeriod.findMany.mockResolvedValue([
      { startDate: new Date(Date.UTC(2020, 0, 1)), endDate: new Date(Date.UTC(2026, 9, 5)) },
    ]);
    hrChain.isHrOrFullAccessActor.mockResolvedValue(true);

    await expect(
      service.validateSubmissionDates({
        companyId: COMPANY,
        actorUserId: HR_USER,
        targetEmployeeId: EMPLOYEE,
        dates: [new Date(Date.UTC(2026, 9, 8))],
        today: TODAY,
      }),
    ).rejects.toThrow('Outside employment period (last working day 2026-10-05)');
  });
});
