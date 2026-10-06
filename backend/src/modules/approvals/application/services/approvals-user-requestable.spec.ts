import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService — isUserRequestable', () => {
  it('lists only user-requestable categories', async () => {
    const findMany = jest.fn(async () => [{ code: 'LEAVE_REQUEST' }]);
    const service = new ApprovalsService(
      { approvalCategory: { findMany } } as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const rows = await service.getCategories('company-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          isActive: true,
          isUserRequestable: true,
        }),
      }),
    );
    expect(rows).toEqual([{ code: 'LEAVE_REQUEST' }]);
  });

  it('rejects submit for a non-requestable category with 400', async () => {
    const service = new ApprovalsService(
      {
        approvalCategory: {
          findFirst: async () => ({
            id: 'cat-1',
            code: 'PAYROLL_RUN',
            isActive: true,
            isUserRequestable: false,
            numberPrefix: 'PR',
            approvalRules: [],
          }),
        },
      } as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.submitRequest(
        {
          categoryCode: 'PAYROLL_RUN',
          title: 'September payroll',
          formData: { month: 9, year: 2026 },
        },
        'company-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when the category is missing', async () => {
    const service = new ApprovalsService(
      {
        approvalCategory: {
          findFirst: async () => null,
        },
      } as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.submitRequest(
        {
          categoryCode: 'MISSING',
          title: 'x',
          formData: {},
        },
        'company-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
