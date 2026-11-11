import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PayslipPdfPainter,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';
import {
  DOC_INK,
  DOC_MUTED,
  docHeader,
  docHero,
  docHline,
  docPageFooters,
  docTable,
  isoDate,
  personEmployeeId,
  personName,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';
import { ExitPermitService } from './exit-permit.service';
import {
  type ExitPermitPdfRecord,
  exitPermitDirectionLabel,
  exitPermitItemsTable,
} from './exit-permit-pdf.service';

function approvalInfo(permit: ExitPermitPdfRecord): { by: string; on: string } {
  const lastApproved = [...(permit.approvalRequest?.tiers ?? [])]
    .filter((tier) => tier.decision === 'APPROVED')
    .sort((a, b) => b.tierOrder - a.tierOrder)[0];
  if (lastApproved) {
    return {
      by: personName(lastApproved.approver),
      on: isoDate(lastApproved.decidedAt ?? permit.completedAt),
    };
  }
  return { by: 'Direct approval / 直接批准', on: isoDate(permit.completedAt) };
}

/** Label, then a signature line and a date/time line with captions under them. */
function signatureBlock(p: PayslipPdfPainter, label: string, x: number, y: number, width: number): void {
  p.text(label, x, y, width, { size: 8, color: DOC_MUTED });
  const lineY = y + 30;
  const signW = width * 0.6;
  docHline(p, x, x + signW, lineY);
  docHline(p, x + signW + 10, x + width, lineY);
  p.text('Signature / 签名', x, lineY + 2, signW, { size: 7, color: DOC_MUTED });
  p.text('Date & time / 日期时间', x + signW + 10, lineY + 2, width - signW - 10, {
    size: 7,
    color: DOC_MUTED,
  });
}

function drawGatePass(p: PayslipPdfPainter, permit: ExitPermitPdfRecord): void {
  docHeader(p, { title: 'Gate Pass', titleZh: '出入门证', number: permit.requestNumber });
  docHero(p, {
    headline: exitPermitDirectionLabel(permit.direction),
    dateLabel: 'Valid on / 有效日期',
    date: isoDate(permit.date),
  });

  // No section heading here: the A5 pass must keep the sign-off on page one.
  const approval = approvalInfo(permit);
  p.field('Employee / 员工', personName(permit.employee));
  p.field('Employee ID / 工号', personEmployeeId(permit.employee));
  p.field('Department / 部门', permit.department?.name?.trim() || '-');
  p.field('Approved / 批准', `${approval.by}  ·  ${approval.on}`);

  docTable(p, exitPermitItemsTable(permit, { checkColumn: true }));

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
    .strokeColor(DOC_INK)
    .rect(p.right - stamp, blockTop, stamp, stamp)
    .stroke()
    .undash()
    .restore();
  p.text('STAMP / 盖章', p.right - stamp, blockTop + stamp / 2 - 5, stamp, {
    size: 8,
    align: 'center',
    color: DOC_MUTED,
  });
  p.y = blockTop + blockH + 6;

  p.footerNotes([
    'Valid only on the date shown. Security must check every item against this list before passage.',
    '仅限上述日期有效。放行前，保安须按清单逐项核对物品。',
  ]);

  docPageFooters(p, permit.requestNumber);
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
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `gate-pass_${safeFilePart(permit.requestNumber)}.pdf`,
    };
  }
}
