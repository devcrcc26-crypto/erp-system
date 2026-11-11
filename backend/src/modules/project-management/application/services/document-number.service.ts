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
  'SUBTASK',
] as const;

export type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];

const CHANGE_REQUEST_NUMBER_SEQUENCE = 'change_request_number_seq';
const RISK_NUMBER_SEQUENCE = 'risk_number_seq';
const DELIVERABLE_NUMBER_SEQUENCE = 'deliverable_number_seq';

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the next formatted change request number from the PostgreSQL sequence.
   */
  async nextChangeRequestNumber(companyId: string): Promise<string> {
    return this.formatSequenceNumber(
      CHANGE_REQUEST_NUMBER_SEQUENCE,
      'CR',
      companyId,
    );
  }

  /**
   * Returns the next formatted risk id code from the PostgreSQL sequence.
   */
  async nextRiskNumber(companyId: string): Promise<string> {
    return this.formatSequenceNumber(RISK_NUMBER_SEQUENCE, 'RISK', companyId);
  }

  /**
   * Returns the next formatted deliverable number from the PostgreSQL sequence.
   */
  async nextDeliverableNumber(companyId: string): Promise<string> {
    return this.formatSequenceNumber(
      DELIVERABLE_NUMBER_SEQUENCE,
      'DLV',
      companyId,
    );
  }

  /**
   * Returns the next formatted document number from the PostgreSQL sequence.
   * @param documentType - one of {@link SUPPORTED_DOCUMENT_TYPES} (must exist in `number_series` for the company)
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

  private async formatSequenceNumber(
    sequenceName: string,
    prefix: string,
    _companyId: string,
  ): Promise<string> {
    const next = await this.nextSequenceValue(sequenceName);
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  private async nextSequenceValue(sequenceName: string): Promise<number> {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{ nextval: bigint | number }>
    >(`SELECT nextval('${sequenceName}') as nextval`);
    return Number(result[0]?.nextval ?? 1);
  }
}
