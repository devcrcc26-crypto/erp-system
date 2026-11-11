import { Injectable } from '@nestjs/common';
import {
  type DocTable,
  humanize,
  isoDate,
  personName,
  renderDocumentPdf,
  safeFilePart,
  yesNo,
} from '../../../../shared/pdf/document-pdf';
import { ExitPermitService } from './exit-permit.service';

export type ExitPermitPdfRecord = Awaited<ReturnType<ExitPermitService['getRequest']>>;

export function exitPermitDirectionLabel(direction: string | null | undefined): string {
  return direction === 'ENTRANCE' ? 'ENTRANCE  /  进门' : 'EXIT  /  出门';
}

/** Items table shared by the record PDF and the gate pass. */
export function exitPermitItemsTable(
  permit: ExitPermitPdfRecord,
  options: { checkColumn: boolean },
): DocTable {
  const items = permit.items ?? [];
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  return {
    title: 'Items / 物品',
    checkColumn: options.checkColumn,
    columns: [
      { header: 'Item / 物品', weight: 4 },
      { header: 'Qty / 数量', weight: 1.1, align: 'right' },
      { header: 'Unit / 单位', weight: 1.2 },
    ],
    rows: items.map((item) => ({
      cells: [item.itemName, Number(item.quantity ?? 0), item.unit],
      sub: item.issue,
    })),
    totals: [['Total quantity / 总数量', String(totalQuantity)]],
    emptyText: 'No items recorded / 无物品',
  };
}

/** Full A4 record of one exit permit, in the shared document layout. */
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
    const isApproved = permit.status === 'APPROVED';

    const buffer = await renderDocumentPdf({
      title: 'Equipment & Materials Exit Permit',
      titleZh: '设备物资出入许可单',
      number: permit.requestNumber,
      status: permit.status,
      hero: {
        headline: exitPermitDirectionLabel(permit.direction),
        dateLabel: 'Permit date / 许可日期',
        date: isoDate(permit.date),
      },
      employee: { person: permit.employee, department: permit.department?.name },
      sections: [
        {
          title: 'Permit / 许可信息',
          rows: [
            ['Status / 状态', humanize(permit.status)],
            ...(permit.currentTierLabel
              ? ([['Waiting on / 当前审批', permit.currentTierLabel]] as const)
              : []),
            ['Filed on behalf / 代为提交', yesNo(permit.isOnBehalf)],
          ],
        },
      ],
      tables: [exitPermitItemsTable(permit, { checkColumn: false })],
      approvalTiers: permit.approvalRequest?.tiers ?? [],
      documents: (permit.documents ?? []).map((doc) => doc.name),
      notes: [
        `Created by ${personName(permit.creator)} ${isoDate(permit.createdAt)}  ·  Submitted ${isoDate(permit.submittedAt)}  ·  Completed ${isoDate(permit.completedAt)}`,
        ...(isApproved
          ? [
              'Approved. Print the A5 gate pass from the permit page and present it at the gate.',
              '已批准。请在许可页面打印A5出入门证，并在门岗出示。',
            ]
          : ['Not valid at the gate until approved.', '批准前不得作为出入门凭证。']),
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `exit-permit_${safeFilePart(permit.requestNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
