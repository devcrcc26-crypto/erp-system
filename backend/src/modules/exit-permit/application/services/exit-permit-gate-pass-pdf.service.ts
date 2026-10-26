import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PayslipPdfPainter,
  bilingualTitle,
  dash,
  fmtGeneratedDate,
  fullName,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';
import { ExitPermitService } from './exit-permit.service';
import {
  ExitPermitPdfRecord,
  INK,
  MUTED,
  approvalInfo,
  drawDirectionBox,
  drawItemsTable,
  hline,
  stampPageFooters,
} from './exit-permit-pdf-parts';

/** Label, then a signature line and a date/time line with captions under them. */
function signatureBlock(p: PayslipPdfPainter, label: string, x: number, y: number, width: number): void {
  p.text(label, x, y, width, { size: 8, color: MUTED });
  const lineY = y + 30;
  const signW = width * 0.6;
  hline(p, x, x + signW, lineY);
  hline(p, x + signW + 10, x + width, lineY);
  p.text('Signature / 签名', x, lineY + 2, signW, { size: 7, color: MUTED });
  p.text('Date & time / 日期时间', x + signW + 10, lineY + 2, width - signW - 10, {
    size: 7,
    color: MUTED,
  });
}

function drawGatePass(p: PayslipPdfPainter, permit: ExitPermitPdfRecord): void {
  p.brand(bilingualTitle('Gate Pass', '出入门证'));
  p.subtitleRight(`No. ${permit.requestNumber}  ·  Printed ${fmtGeneratedDate(new Date())}`);
  p.rule();

  drawDirectionBox(p, permit, 'Valid on / 有效日期');

  const approval = approvalInfo(permit);
  p.field('Employee / 员工', fullName(permit.employee));
  p.field('Department / 部门', dash(permit.department?.name));
  p.field('Approved by / 批准人', approval.by);
  p.field('Approved on / 批准日期', approval.on);

  drawItemsTable(p, permit.items ?? [], { checkColumn: true });

  // Signatures on the left, stamp box on the right. Reserve the block plus the
  // two footer notes so the whole sign-off stays together on one page.
  const stamp = 86;
  const sigGap = 46;
  const blockH = Math.max(stamp, sigGap + 40);
  p.ensure(8 + blockH + 6 + 50);
  p.y += 8;
  const blockTop = p.y;
  const sigW = p.width - stamp - 16;
  signatureBlock(p, 'Issued by (HR) / 签发人', p.left, blockTop, sigW);
  signatureBlock(p, 'Security officer / 保安', p.left, blockTop + sigGap, sigW);
  p.doc
    .save()
    .lineWidth(0.8)
    .dash(3, { space: 3 })
    .strokeColor(INK)
    .rect(p.right - stamp, blockTop, stamp, stamp)
    .stroke()
    .undash()
    .restore();
  p.text('STAMP / 盖章', p.right - stamp, blockTop + stamp / 2 - 5, stamp, {
    size: 8,
    align: 'center',
    color: MUTED,
  });
  p.y = blockTop + blockH + 6;

  p.footerNotes([
    'Valid only on the date shown. Security must check every item against this list before passage.',
    '仅限上述日期有效。放行前，保安须按清单逐项核对物品。',
  ]);

  stampPageFooters(p, permit.requestNumber);
}

/** Small A5 gate pass for an approved exit permit, printed and stamped at the gate. */
@Injectable()
export class ExitPermitGatePassPdfService {
  constructor(private readonly exitPermitService: ExitPermitService) {}

  async getPdf(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const permit = await this.exitPermitService.getRequest(id, companyId, userId);
    if (permit.status !== 'APPROVED') {
      throw new BadRequestException(
        'A gate pass is only available once the exit permit is approved',
      );
    }

    const buffer = await renderPayslipPdf(
      { title: `Gate Pass ${permit.requestNumber}`, size: 'A5', margin: 28 },
      (painter) => drawGatePass(painter, permit),
    );
    const safe = permit.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `gate-pass_${safe}.pdf`,
    };
  }
}
