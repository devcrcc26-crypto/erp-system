import { Injectable } from '@nestjs/common';
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
  MUTED,
  drawDirectionBox,
  drawItemsTable,
  isoDate,
  stampPageFooters,
} from './exit-permit-pdf-parts';

/** "SUBMITTED" -> "Submitted", "IN_PROGRESS" -> "In progress". */
function humanize(value: string | null | undefined): string {
  if (!value) return '-';
  const text = value.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawApprovalChain(p: PayslipPdfPainter, permit: ExitPermitPdfRecord): void {
  p.section('Approval chain / 审批流程');
  const tiers = [...(permit.approvalRequest?.tiers ?? [])].sort(
    (a, b) => a.tierOrder - b.tierOrder,
  );
  if (tiers.length === 0) {
    p.line(
      permit.status === 'APPROVED'
        ? 'Approved directly, no approval chain / 直接批准'
        : 'Not submitted for approval yet / 尚未提交审批',
      { indent: 1, color: MUTED },
    );
    return;
  }
  for (const tier of tiers) {
    const decided = tier.decidedAt ? `  ·  ${isoDate(tier.decidedAt)}` : '';
    p.field(
      `${tier.tierOrder}. ${tier.label} — ${fullName(tier.approver)}`,
      `${humanize(tier.decision)}${decided}`,
      1,
    );
    if (tier.comment?.trim()) {
      p.wrapped(`“${tier.comment.trim()}”`, { indent: 24, size: 8 });
    }
  }
}

function drawPermitRecord(p: PayslipPdfPainter, permit: ExitPermitPdfRecord): void {
  const isApproved = permit.status === 'APPROVED';

  p.brand(bilingualTitle('Equipment & Materials Exit Permit', '设备物资出入许可单'));
  p.subtitleRight(
    `No. ${permit.requestNumber}  ·  ${humanize(permit.status)}  ·  Printed ${fmtGeneratedDate(new Date())}`,
  );
  p.rule();

  drawDirectionBox(p, permit, 'Permit date / 许可日期');

  p.section('Permit / 许可信息');
  p.field('Employee / 员工', fullName(permit.employee), 1);
  p.field('Email / 邮箱', dash(permit.employee?.email), 1);
  p.field('Department / 部门', dash(permit.department?.name), 1);
  p.field('Status / 状态', humanize(permit.status), 1);
  if (permit.currentTierLabel) {
    p.field('Waiting on / 当前审批', permit.currentTierLabel, 1);
  }
  p.field('Filed on behalf / 代为提交', permit.isOnBehalf ? 'Yes / 是' : 'No / 否', 1);

  drawItemsTable(p, permit.items ?? [], { checkColumn: false });

  drawApprovalChain(p, permit);

  p.section('Record / 记录');
  p.field('Created by / 创建人', `${fullName(permit.creator)}  ·  ${isoDate(permit.createdAt)}`, 1);
  p.field(
    'Submitted by / 提交人',
    permit.submittedAt
      ? `${fullName(permit.submitter ?? permit.creator)}  ·  ${isoDate(permit.submittedAt)}`
      : '-',
    1,
  );
  p.field('Completed / 完成', isoDate(permit.completedAt), 1);

  p.footerNotes(
    isApproved
      ? [
          'Approved. Print the A5 gate pass from the permit page and present it at the gate.',
          '已批准。请在许可页面打印A5出入门证，并在门岗出示。',
        ]
      : [
          'Not valid at the gate until approved.',
          '批准前不得作为出入门凭证。',
        ],
  );

  stampPageFooters(p, permit.requestNumber);
}

/** Full A4 record of one exit permit, in the same layout as the gate pass. */
@Injectable()
export class ExitPermitPdfService {
  constructor(private readonly exitPermitService: ExitPermitService) {}

  async getPdf(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    // getRequest applies the same visibility rule as GET :id.
    const permit = await this.exitPermitService.getRequest(id, companyId, userId);

    const buffer = await renderPayslipPdf(
      { title: `Exit Permit ${permit.requestNumber}` },
      (painter) => drawPermitRecord(painter, permit),
    );
    const safe = permit.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `exit-permit_${safe}_${dateStamp}.pdf`,
    };
  }
}
