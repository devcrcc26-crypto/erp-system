import { describe, expect, it, jest } from '@jest/globals';
import { isOnBehalfAutoApproveAllowed, OnBehalfService } from './on-behalf.service';

function buildService() {
  const autoApproveOwnTier = jest
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValue({ tierId: 'tier-1' });
  const auditCreate = jest
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValue(undefined);
  const service = new OnBehalfService(
    { user: { findMany: async () => [] } } as never,
    {} as never,
    {} as never,
    { autoApproveOwnTier } as never,
    { create: auditCreate } as never,
  );
  return { service, autoApproveOwnTier, auditCreate };
}

const input = {
  companyId: 'company-1',
  actorUserId: 'delegate-1',
  employeeId: 'employee-1',
  approvalRequestId: 'approval-1',
  autoApproveTier: true,
};

describe('OnBehalfService auto-approve tier', () => {
  it('is blocked for site assignments only', () => {
    expect(isOnBehalfAutoApproveAllowed('SITE_ASSIGNMENT')).toBe(false);
    expect(isOnBehalfAutoApproveAllowed('WORK_FROM_HOME')).toBe(true);
    expect(isOnBehalfAutoApproveAllowed('FLIGHT_APPLICATION')).toBe(true);
    expect(isOnBehalfAutoApproveAllowed('BUSINESS_TRIP')).toBe(true);
    expect(isOnBehalfAutoApproveAllowed('LEAVE_REQUEST')).toBe(true);
  });

  it('never approves a site-assignment tier, even if asked', async () => {
    const { service, autoApproveOwnTier } = buildService();
    await service.applyAutoApprove({ ...input, moduleCode: 'SITE_ASSIGNMENT' });
    expect(autoApproveOwnTier).not.toHaveBeenCalled();
  });

  it('still approves the delegate tier for other request types', async () => {
    const { service, autoApproveOwnTier } = buildService();
    await service.applyAutoApprove({ ...input, moduleCode: 'WORK_FROM_HOME' });
    expect(autoApproveOwnTier).toHaveBeenCalledWith(
      'approval-1',
      'company-1',
      'delegate-1',
      expect.any(String),
    );
  });

  it('records autoApproveTier=false in the on-behalf audit for site assignments', async () => {
    const { service, auditCreate } = buildService();
    await service.recordOnBehalfCreate({
      moduleCode: 'SITE_ASSIGNMENT',
      companyId: 'company-1',
      actorUserId: 'delegate-1',
      employeeId: 'employee-1',
      recordId: 'sa-1',
      autoApproveTier: true,
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        afterValue: expect.objectContaining({ autoApproveTier: false }),
      }),
    );
  });
});
