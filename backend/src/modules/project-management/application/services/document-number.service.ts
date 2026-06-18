import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../types/pm-context.type';

/** Document types with a seeded {@link NumberSeries} row and PostgreSQL sequence per company. */
export const SUPPORTED_DOCUMENT_TYPES = [
  'PURCHASE_ORDER',
  'INVOICE',
  'RFI',
  'SUBMITTAL',
  'ISSUE',
  'PUNCH_ITEM',
  'MEETING',
  'CORRESPONDENCE',
  'TASK',
] as const;

export type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the next formatted document number from the PostgreSQL sequence.
   * @param documentType — one of {@link SUPPORTED_DOCUMENT_TYPES} (must exist in `number_series` for the company)
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
