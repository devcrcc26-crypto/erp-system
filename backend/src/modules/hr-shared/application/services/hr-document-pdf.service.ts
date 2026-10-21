import { Injectable } from '@nestjs/common';
import {
  createDoc,
  docToBuffer,
  drawItemsTable,
  drawKvTable,
  drawMeta,
  drawPageHeader,
  drawSectionTitle,
  ensureSpace,
  fmtTs,
  resolveFontPath,
} from '../../../../shared/pdf/hr-pdf-renderer';

export interface HrDocSection {
  title: string;
  rows: [string, string][];
}

export interface HrDocItemsTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  colWidths: number[];
}

export interface HrDocumentPdfInput {
  companyName?: string;
  documentTitle: string;
  subtitle?: string | null;
  requestNumber: string;
  preparedBy: string;
  sections: HrDocSection[];
  itemsTable?: HrDocItemsTable;
}

const DEFAULT_COMPANY = 'CRCC International Consulting';

@Injectable()
export class HrDocumentPdfService {
  async render(input: HrDocumentPdfInput): Promise<Buffer> {
    const fontPath = resolveFontPath();
    const companyName = input.companyName?.trim() || DEFAULT_COMPANY;
    const generatedAt = new Date();
    const doc = createDoc(input.documentTitle);
    const footerLeft = `${DEFAULT_COMPANY} — ${input.documentTitle} ${input.requestNumber}`;

    return docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, companyName, input.documentTitle, input.subtitle);
      y = drawMeta(d, y, fmtTs(generatedAt), input.preparedBy);
      y += 6;

      for (const section of input.sections) {
        if (section.rows.length === 0) continue;
        y = ensureSpace(d, y, 32);
        y = drawSectionTitle(d, section.title, y);
        y = drawKvTable(d, section.rows, y);
        y += 8;
      }

      if (input.itemsTable) {
        const t = input.itemsTable;
        y = ensureSpace(d, y, 40);
        y = drawSectionTitle(d, t.title, y);
        y = drawItemsTable(d, t.headers, t.rows, t.colWidths, y);
      }
    }, footerLeft);
  }
}
