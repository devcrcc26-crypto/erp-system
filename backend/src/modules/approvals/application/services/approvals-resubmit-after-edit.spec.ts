import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApprovalRequestStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ApprovalsService } from './approvals.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000201';
const HR_ID = '00000000-0000-4000-8000-000000000202';
const REQUEST_ID = '00000000-0000-4000-8000-000000000401';

describe('ApprovalsService.resubmitAfterOwnerEdit', () => {
  let service: ApprovalsService;
  let findFirst: jest.Mock<() => Promise<unknown>>;
  let resubmitRequest: jest.SpiedFunction<ApprovalsService['resubmitRequest']>;

  beforeEach(() => {
    findFirst = jest.fn<() => Promise<unknown>>();
    service = new ApprovalsService(
      { approvalRequest: { findFirst } } as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    resubmitRequest = jest
      .spyOn(service, 'resubmitRequest')
      .mockResolvedValue({ id: REQUEST_ID });
  });

  it('resubmits a RETURNED request when the editor is the requester', async () => {
    findFirst.mockResolvedValue({
      requestedBy: REQUESTER_ID,
      status: ApprovalRequestStatus.RETURNED,
    });

    await expect(
      service.resubmitAfterOwnerEdit(REQUEST_ID, COMPANY_ID, REQUESTER_ID),
    ).resolves.toBe(true);
    expect(resubmitRequest).toHaveBeenCalledWith(
      REQUEST_ID,
      COMPANY_ID,
      REQUESTER_ID,
      expect.any(String),
      [],
    );
  });

  it('does nothing when someone other than the requester edited (e.g. HR)', async () => {
    findFirst.mockResolvedValue({
      requestedBy: REQUESTER_ID,
      status: ApprovalRequestStatus.RETURNED,
    });

    await expect(
      service.resubmitAfterOwnerEdit(REQUEST_ID, COMPANY_ID, HR_ID),
    ).resolves.toBe(false);
    expect(resubmitRequest).not.toHaveBeenCalled();
  });

  it('does nothing when the request is no longer RETURNED', async () => {
    findFirst.mockResolvedValue({
      requestedBy: REQUESTER_ID,
      status: ApprovalRequestStatus.SUBMITTED,
    });

    await expect(
      service.resubmitAfterOwnerEdit(REQUEST_ID, COMPANY_ID, REQUESTER_ID),
    ).resolves.toBe(false);
    expect(resubmitRequest).not.toHaveBeenCalled();
  });
});
