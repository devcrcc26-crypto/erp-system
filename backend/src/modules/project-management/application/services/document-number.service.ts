import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../types/pm-context.type';

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the next formatted document number from the PostgreSQL sequence.
   */
  async getNextNumber(ctx: PmContext, documentType: string): Promise<string> {
    const series = await this.prisma.numberSeries.findFirst({
      where: activeOnly({ companyId: ctx.companyId, documentType }),
    });
    if (!series) {
      throw new NotFoundException('Number series not found');
    }
    const result = await this.prisma.$queryRawUnsafe<
      Array<{ nextval: bigint | number }>
    >(`SELECT nextval('${series.sequenceName}') as nextval`);
    const next = Number(result[0]?.nextval ?? 1);
    const padded = String(next).padStart(series.padding, '0');
    return `${series.prefix}${padded}${series.suffix}`;
  }
}
