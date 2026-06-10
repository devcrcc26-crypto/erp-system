import { AuditLogSource } from '@prisma/client';
import { AuditService } from './audit.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

describe('AuditService', () => {
  let prisma: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let service: AuditService;

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new AuditService(prisma as unknown as PrismaService);
  });

  it('creates an immutable audit log entry', async () => {
    await service.create({
      companyId: 'company-1',
      userId: 'user-1',
      module: 'branches',
      action: 'create',
      recordType: 'branches',
      recordId: 'branch-1',
      afterValue: { name: 'HQ' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        userId: 'user-1',
        module: 'branches',
        action: 'create',
        recordType: 'branches',
        recordId: 'branch-1',
        source: AuditLogSource.USER_ACTION,
      }),
    });
  });

  it('does not throw when persistence fails', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.create({
        companyId: 'company-1',
        module: 'users',
        action: 'create',
        recordType: 'users',
        recordId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('lists audit logs with company filter and pagination', async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await service.list('company-1', {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      module: 'branches',
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          module: 'branches',
        }),
      }),
    );
  });
});
