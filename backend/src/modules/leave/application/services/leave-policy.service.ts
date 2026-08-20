import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

@Injectable()
export class LeavePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists active leave policies for the company (HR employee profile picker). */
  async listActivePolicies(companyId: string): Promise<unknown[]> {
    return this.prisma.leavePolicy.findMany({
      where: activeOnly({ companyId, isActive: true }),
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
      },
    });
  }
}
