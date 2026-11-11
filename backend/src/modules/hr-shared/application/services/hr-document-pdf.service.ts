import { Injectable } from '@nestjs/common';
import {
  renderDocumentPdf,
  type DocumentPdfSpec,
} from '../../../../shared/pdf/document-pdf';

export type HrDocumentPdfInput = DocumentPdfSpec;

/** Injectable entry point to the shared document layout (`shared/pdf/document-pdf`). */
@Injectable()
export class HrDocumentPdfService {
  render(input: HrDocumentPdfInput): Promise<Buffer> {
    return renderDocumentPdf(input);
  }
}
