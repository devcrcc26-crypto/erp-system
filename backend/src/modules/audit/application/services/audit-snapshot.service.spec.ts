import { AuditSnapshotService } from './audit-snapshot.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

describe('AuditSnapshotService', () => {
  let prisma: jest.Mocked<Pick<PrismaService, 'branch'>>;
  let service: AuditSnapshotService;

  beforeEach(() => {
    prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          companyId: 'company-1',
          name: 'HQ',
        }),
      },
    } as unknown as jest.Mocked<Pick<PrismaService, 'branch'>>;

    service = new AuditSnapshotService(prisma as unknown as PrismaService);
  });

  it('returns undefined for unknown record types', async () => {
    await expect(
      service.capture('company-1', 'unknown_entity', 'entity-1'),
    ).resolves.toBeUndefined();
  });

  it('returns sanitized JSON snapshot for supported record types', async () => {
    const snapshot = await service.capture('company-1', 'branches', 'branch-1');

    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'branch-1',
        companyId: 'company-1',
        deletedAt: null,
      },
    });
    expect(snapshot).toEqual({
      id: 'branch-1',
      companyId: 'company-1',
      name: 'HQ',
    });
  });
});
