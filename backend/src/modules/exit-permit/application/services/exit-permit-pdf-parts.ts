import {
  PayslipPdfPainter,
  dash,
  fullName,
} from '../../../../shared/pdf/payslip-style-pdf';
import type { ExitPermitService } from './exit-permit.service';

/** Drawing pieces shared by the exit permit record PDF and the gate pass. */

export const INK = '#1A1A1A';
export const MUTED = '#555555';
export const HAIRLINE = '#BBBBBB';

export type ExitPermitPdfRecord = Awaited<ReturnType<ExitPermitService['getRequest']>>;

export function isoDate(value: Date | string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '-';
}

export function directionLabel(direction: string | null | undefined): string {
  return direction === 'ENTRANCE' ? 'ENTRANCE  /  进门' : 'EXIT  /  出门';
}

export function approvalInfo(permit: ExitPermitPdfRecord): { by: string; on: string } {
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

export function hline(
  p: PayslipPdfPainter,
  x1: number,
  x2: number,
  y: number,
  color = INK,
  width = 0.6,
): void {
  p.doc.save().strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

/** Bordered box: direction on the left, a labelled date on the right. */
export function drawDirectionBox(
  p: PayslipPdfPainter,
  permit: ExitPermitPdfRecord,
  dateLabel: string,
): void {
  const boxH = 50;
  p.ensure(boxH + 12);
  const top = p.y;
  p.doc.save().lineWidth(1.2).strokeColor(INK).rect(p.left, top, p.width, boxH).stroke().restore();
  const dirW = p.width * 0.6;
  p.text(directionLabel(permit.direction), p.left + 12, top + 13, dirW - 12, { size: 20 });
  p.text(dateLabel, p.left + dirW, top + 9, p.width - dirW - 12, {
    size: 8,
    align: 'right',
    color: MUTED,
  });
  p.text(isoDate(permit.date), p.left + dirW, top + 23, p.width - dirW - 12, {
    size: 14,
    align: 'right',
  });
  p.y = top + boxH + 12;
}

/**
 * Items as columns (No. | Item with issue underneath | Qty | Unit), with an
 * optional empty "Checked" box per row for security. Headings repeat on each
 * new page. Returns the total quantity.
 */
export function drawItemsTable(
  p: PayslipPdfPainter,
  items: ExitPermitPdfRecord['items'],
  options: { checkColumn: boolean },
): number {
  const { doc } = p;
  p.section(`Items / 物品 (${items.length})`);

  const noW = 24;
  const qtyW = 46;
  const unitW = 52;
  const checkW = options.checkColumn ? 40 : 0;
  const itemW = p.width - noW - qtyW - unitW - checkW;
  const xNo = p.left;
  const xItem = xNo + noW;
  const xQty = xItem + itemW;
  const xUnit = xQty + qtyW;
  const xCheck = xUnit + unitW;

  const drawHeader = (): void => {
    const headY = p.y;
    p.text('No.', xNo, headY, noW, { size: 7.5, color: MUTED });
    p.text('Item / 物品', xItem, headY, itemW - 6, { size: 7.5, color: MUTED });
    p.text('Qty', xQty, headY, qtyW - 6, { size: 7.5, color: MUTED, align: 'right' });
    p.text('Unit', xUnit, headY, unitW, { size: 7.5, color: MUTED });
    if (options.checkColumn) {
      p.text('Checked', xCheck, headY, checkW, { size: 7.5, color: MUTED, align: 'right' });
    }
    p.y = headY + 13;
    hline(p, p.left, p.right, p.y, INK, 0.7);
  };
  const pageCount = (): number => doc.bufferedPageRange().count;

  p.ensure(50);
  drawHeader();

  let totalQuantity = 0;
  items.forEach((item, index) => {
    const quantity = Number(String(item.quantity ?? 0));
    totalQuantity += Number.isFinite(quantity) ? quantity : 0;
    const pagesBefore = pageCount();
    p.ensure(30);
    if (pageCount() !== pagesBefore) {
      drawHeader();
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
    if (options.checkColumn) {
      doc.save().lineWidth(0.7).strokeColor(INK).rect(p.right - 11, top + 1, 9, 9).stroke().restore();
    }
    p.y = Math.max(noBottom, itemBottom, qtyBottom, unitBottom, top + 12) + 4;
    hline(p, p.left, p.right, p.y, HAIRLINE, 0.4);
  });
  if (items.length === 0) {
    p.line('No items recorded', { color: MUTED });
  }
  p.y += 4;
  p.field('Total quantity / 总数量', String(totalQuantity));
  return totalQuantity;
}

/**
 * Request number and page count on every page. Runs last; the bottom margin
 * is lifted while stamping because PDFKit opens a new page for text inside it.
 */
export function stampPageFooters(p: PayslipPdfPainter, requestNumber: string): void {
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
