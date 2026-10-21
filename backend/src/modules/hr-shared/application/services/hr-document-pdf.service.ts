import { Injectable } from '@nestjs/common';
import {
  bilingualTitle,
  dash,
  fmtGeneratedDate,
  renderPayslipPdf,
  type PayslipPdfPainter,
} from '../../../../shared/pdf/payslip-style-pdf';

export interface HrDocSection {
  title: string;
  rows: [string, string][];
}

export interface HrDocItemsTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  /** Ignored — payslip layout does not use fixed column grids. */
  colWidths?: number[];
}

export interface HrDocumentPdfInput {
  companyName?: string;
  documentTitle: string;
  /** Optional Chinese title segment, e.g. 采购申请 */
  documentTitleZh?: string | null;
  subtitle?: string | null;
  requestNumber: string;
  preparedBy: string;
  sections: HrDocSection[];
  itemsTable?: HrDocItemsTable;
}

/**
 * Shared HR document PDF — payslip layout (Noto Sans SC, brand header, rules).
 */
@Injectable()
export class HrDocumentPdfService {
  async render(input: HrDocumentPdfInput): Promise<Buffer> {
    const generatedAt = new Date();
    const title = bilingualTitle(input.documentTitle, input.documentTitleZh);

    return renderPayslipPdf({ title: input.documentTitle }, (p) => {
      this.draw(p, input, title, generatedAt);
    });
  }

  private draw(
    p: PayslipPdfPainter,
    input: HrDocumentPdfInput,
    title: string,
    generatedAt: Date,
  ): void {
    p.brand(title);
    p.subtitleRight(input.requestNumber);
    if (input.subtitle?.trim()) {
      p.line(input.subtitle.trim(), { color: '#333333' });
    }
    p.rule();

    for (const section of input.sections) {
      if (section.rows.length === 0) continue;
      p.section(section.title.toUpperCase());
      p.fields(section.rows.map(([k, v]) => [k, dash(v)]));
    }

    if (input.itemsTable) {
      p.rule();
      p.itemsBlock(
        input.itemsTable.title.toUpperCase(),
        input.itemsTable.headers,
        input.itemsTable.rows,
      );
    }

    p.footerNotes([
      `Prepared by ${input.preparedBy || '-'} · Generated ${fmtGeneratedDate(generatedAt)}`,
      'This document is system-generated.',
    ]);
  }
}
