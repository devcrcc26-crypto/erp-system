/// <reference types="jest" />

import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { CompanySetupService } from '../company-setup.service';

describe('CompanySetupService - department codes', () => {
  const ctx = { companyId: 'company-1', userId: 'user-1' };

  let prisma: {
    department: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    division: { findFirst: jest.Mock };
    branch: { findFirst: jest.Mock };
    $queryRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let service: CompanySetupService;

  beforeEach(() => {
    prisma = {
      department: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'dept-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      division: {
        findFirst: jest.fn().mockResolvedValue({ id: 'div-1' }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ nextval: 7n }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $transaction: jest.fn(),
    };
    service = new CompanySetupService(prisma as unknown as PrismaService);
  });

  it('assigns the next DEPT sequence code and ignores a client-supplied code', async () => {
    prisma.department.create.mockResolvedValue({
      id: 'dept-new',
      code: 'DEPT-0007',
    });

    const result = await service.createDepartment(ctx, {
      name: 'Planning',
      code: 'PLAN',
    });

    expect(result).toEqual({ id: 'dept-new', code: 'DEPT-0007' });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.department.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: ctx.companyId,
        name: 'Planning',
        code: 'DEPT-0007',
      }),
    });
  });
});
