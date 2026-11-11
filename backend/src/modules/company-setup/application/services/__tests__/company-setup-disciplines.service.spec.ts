import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { CompanySetupService } from '../company-setup.service';

describe('CompanySetupService - engineering disciplines', () => {
  const ctx = { companyId: 'company-1', userId: 'user-1' };

  let prisma: {
    discipline: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: CompanySetupService;

  beforeEach(() => {
    prisma = {
      discipline: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CompanySetupService(prisma as unknown as PrismaService);
  });

  it('createDiscipline rejects duplicate names with 409', async () => {
    prisma.discipline.findFirst.mockResolvedValue({
      id: 'disc-1',
      deletedAt: null,
      isActive: true,
    });

    await expect(
      service.createDiscipline(ctx, { name: 'Civil' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.discipline.create).not.toHaveBeenCalled();
  });

  it('createDiscipline maps Prisma P2002 to 409', async () => {
    prisma.discipline.findFirst.mockResolvedValue(null);
    prisma.discipline.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(
      service.createDiscipline(ctx, { name: 'Civil' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createDiscipline creates when name is available', async () => {
    prisma.discipline.findFirst.mockResolvedValue(null);
    prisma.discipline.create.mockResolvedValue({
      id: 'disc-new',
      name: 'Acoustics',
    });

    const result = await service.createDiscipline(ctx, {
      name: ' Acoustics ',
      nameZh: '声学',
    });

    expect(result).toEqual({ id: 'disc-new', name: 'Acoustics' });
    expect(prisma.discipline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: ctx.companyId,
        name: 'Acoustics',
        nameZh: '声学',
      }),
    });
  });

  it('listDisciplines passes numeric take when query limit is a string', async () => {
    prisma.discipline.findMany.mockResolvedValue([]);
    prisma.discipline.count.mockResolvedValue(0);

    await service.listDisciplines(ctx, {
      page: '1' as unknown as number,
      limit: '200' as unknown as number,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(prisma.discipline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 200,
      }),
    );
  });
});
