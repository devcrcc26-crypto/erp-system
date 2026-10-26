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

const INK = '#1A1A1A';
const MUTED = '#555555';
const HAIRLINE = '#BBBBBB';

type GatePassPermit = Awaited<ReturnType<ExitPermitService['getRequest']>>;

function isoDate(value: Date | string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '-';
}

function approvalInfo(permit: GatePassPermit): { by: string; on: string } {
  const lastApproved = [...(permit.approvalRequest?.tiers ?? [])]
    .filter((tier) => tier.decision === 'APPROVED')
    .sort((a, b) => b.tierOrder - a.tierOrder)[0];
  if (lastApproved) {
    return {
      by: fullName(lastApproved.approver),
      on: isoDate(lastApproved.decidedAt ?? permit.completedAt),
    };
  }
  return { by: 'Direct approval / 直接批准', on: isoDate(permit.completedAt) };
}

function hline(p: PayslipPdfPainter, x1: number, x2: number, y: number, color = INK, width = 0.6): void {
  p.doc.save().strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

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

function drawGatePass(p: PayslipPdfPainter, permit: GatePassPermit): void {
  const { doc } = p;

  p.brand(bilingualTitle('Gate Pass', '出入门证'));
  p.subtitleRight(`No. ${permit.requestNumber}  ·  Printed ${fmtGeneratedDate(new Date())}`);
  p.rule();

  // Direction and valid date, boxed so security reads it at a glance.
  const boxH = 50;
  p.ensure(boxH + 12);
  const boxTop = p.y;
  doc.save().lineWidth(1.2).strokeColor(INK).rect(p.left, boxTop, p.width, boxH).stroke().restore();
  const dirW = p.width * 0.6;
  p.text(
    permit.direction === 'ENTRANCE' ? 'ENTRANCE  /  进门' : 'EXIT  /  出门',
    p.left + 12,
    boxTop + 13,
    dirW - 12,
    { size: 20 },
  );
  p.text('Valid on / 有效日期', p.left + dirW, boxTop + 9, p.width - dirW - 12, {
    size: 8,
    align: 'right',
    color: MUTED,
  });
  p.text(isoDate(permit.date), p.left + dirW, boxTop + 23, p.width - dirW - 12, {
    size: 14,
    align: 'right',
  });
  p.y = boxTop + boxH + 12;

  const approval = approvalInfo(permit);
  p.field('Employee / 员工', fullName(permit.employee));
  p.field('Department / 部门', dash(permit.department?.name));
  p.field('Approved by / 批准人', approval.by);
  p.field('Approved on / 批准日期', approval.on);

  // Items: No. | Item (issue underneath) | Qty | Unit | Checked box for security.
  const items = permit.items ?? [];
  p.section(`Items / 物品 (${items.length})`);
  const noW = 22;
  const qtyW = 42;
  const unitW = 46;
  const checkW = 40;
  const itemW = p.width - noW - qtyW - unitW - checkW;
  const xNo = p.left;
  const xItem = xNo + noW;
  const xQty = xItem + itemW;
  const xUnit = xQty + qtyW;
  const xCheck = xUnit + unitW;

  const drawItemsHeader = (): void => {
    const headY = p.y;
    p.text('No.', xNo, headY, noW, { size: 7.5, color: MUTED });
    p.text('Item / 物品', xItem, headY, itemW - 6, { size: 7.5, color: MUTED });
    p.text('Qty', xQty, headY, qtyW - 6, { size: 7.5, color: MUTED, align: 'right' });
    p.text('Unit', xUnit, headY, unitW, { size: 7.5, color: MUTED });
    p.text('Checked', xCheck, headY, checkW, { size: 7.5, color: MUTED, align: 'right' });
    p.y = headY + 13;
    hline(p, p.left, p.right, p.y, INK, 0.7);
  };
  const pageCount = (): number => doc.bufferedPageRange().count;

  p.ensure(50);
  drawItemsHeader();

  let totalQuantity = 0;
  items.forEach((item, index) => {
    const quantity = Number(String(item.quantity ?? 0));
    totalQuantity += Number.isFinite(quantity) ? quantity : 0;
    const pagesBefore = pageCount();
    p.ensure(30);
    if (pageCount() !== pagesBefore) {
      drawItemsHeader();
    }
    const top = p.y + 4;
    const noBottom = p.text(String(index + 1), xNo, top, noW, { size: 9 });
    let itemBottom = p.text(dash(item.itemName), xItem, top, itemW - 6, { size: 9 });
    if (item.issue?.trim()) {
      itemBottom = p.text(item.issue.trim(), xItem, itemBottom, itemW - 6, {
        size: 7.5,
        color: MUTED,
      });
    }
    const qtyBottom = p.text(String(quantity), xQty, top, qtyW - 6, { size: 9, align: 'right' });
    const unitBottom = p.text(dash(item.unit), xUnit, top, unitW, { size: 9 });
    doc.save().lineWidth(0.7).strokeColor(INK).rect(p.right - 11, top + 1, 9, 9).stroke().restore();
    p.y = Math.max(noBottom, itemBottom, qtyBottom, unitBottom, top + 12) + 4;
    hline(p, p.left, p.right, p.y, HAIRLINE, 0.4);
  });
  if (items.length === 0) {
    p.line('No items recorded', { color: MUTED });
  }
  p.y += 4;
  p.field('Total quantity / 总数量', String(totalQuantity));

  // Signatures on the left, stamp box on the right, kept together on one page.
  const stamp = 96;
  p.ensure(stamp + 70);
  p.y += 10;
  const blockTop = p.y;
  const sigW = p.width - stamp - 16;
  signatureBlock(p, 'Issued by (HR) / 签发人', p.left, blockTop, sigW);
  signatureBlock(p, 'Security officer / 保安', p.left, blockTop + 52, sigW);
  doc
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
  p.y = blockTop + Math.max(stamp, 52 + 44) + 6;

  p.footerNotes([
    'Valid only on the date shown. Security must check every item against this list before passage.',
    '仅限上述日期有效。放行前，保安须按清单逐项核对物品。',
  ]);

  stampPageFooters(p, permit.requestNumber);
}

/**
 * Pass number and page count on every page, so a loose continuation page can
 * be matched to its pass. Runs last; the bottom margin is lifted while
 * stamping because PDFKit opens a new page for text placed inside it.
 */
function stampPageFooters(p: PayslipPdfPainter, requestNumber: string): void {
  const { doc } = p;
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    p.text(
      `${requestNumber}  ·  Page ${i + 1} of ${count}`,
      p.left,
      doc.page.height - savedBottom + 10,
      p.width,
      { size: 7, align: 'right', color: MUTED },
    );
    doc.page.margins.bottom = savedBottom;
  }
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
      { title: `Gate Pass ${permit.requestNumber}`, size: 'A5', margin: 32 },
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
