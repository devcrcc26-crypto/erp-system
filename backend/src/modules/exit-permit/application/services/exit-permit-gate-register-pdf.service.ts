import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  DOC_PERSON_SELECT,
  type DocTable,
  type DocTableRow,
  personEmployeeId,
  personName,
  renderDocumentPdf,
} from '../../../../shared/pdf/document-pdf';

@Injectable()
export class ExitPermitGateRegisterPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    permitDate: string,
    direction: 'ENTRANCE' | 'EXIT' | 'ALL',
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const dateKey = permitDate.slice(0, 10);
    const dirFilter =
      direction === 'ALL'
        ? undefined
        : ({ direction } as { direction: 'ENTRANCE' | 'EXIT' });

    const permits = await this.prisma.exitPermit.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        date: {
          gte: new Date(`${dateKey}T00:00:00.000Z`),
          lte: new Date(`${dateKey}T23:59:59.999Z`),
        },
        ...dirFilter,
        deletedAt: null,
      },
      include: {
        employee: { select: DOC_PERSON_SELECT },
        department: { select: { name: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: { itemName: true, issue: true, quantity: true, unit: true },
        },
      },
      orderBy: { requestNumber: 'asc' },
    });

    const groups =
      direction === 'ALL'
        ? [
            { title: 'Entrance / 进门', data: permits.filter((row) => row.direction === 'ENTRANCE') },
            { title: 'Exit / 出门', data: permits.filter((row) => row.direction === 'EXIT') },
          ]
        : [{ title: direction === 'ENTRANCE' ? 'Entrance / 进门' : 'Exit / 出门', data: permits }];

    // One row per item; permit columns are printed on the permit's first row only.
    const tables: DocTable[] = groups.map((group) => ({
      title: `${group.title} (${group.data.length} permit(s))`,
      numbered: false,
      checkColumn: true,
      subColumn: 4,
      columns: [
        { header: 'Permit / 编号', weight: 1.6 },
        { header: 'Employee / 员工', weight: 2.4 },
        { header: 'Employee ID / 工号', weight: 1.4 },
        { header: 'Department / 部门', weight: 1.8 },
        { header: 'Item / 物品', weight: 3.4 },
        { header: 'Qty / 数量', weight: 0.9, align: 'right' },
        { header: 'Unit / 单位', weight: 0.9 },
      ],
      rows: group.data.flatMap((permit): DocTableRow[] => {
        const first = [
          permit.requestNumber,
          personName(permit.employee),
          personEmployeeId(permit.employee),
          permit.department?.name ?? '-',
        ];
        const blank = ['', '', '', ''];
        if (permit.items.length === 0) {
          return [{ cells: [...first, 'No items / 无物品', '', ''] }];
        }
        return permit.items.map((item, index) => ({
          cells: [...(index === 0 ? first : blank), item.itemName, Number(item.quantity), item.unit],
          sub: item.issue,
        }));
      }),
      emptyText: 'No approved permits for this date / 当日无已批准许可',
    }));

    const dirLabel =
      direction === 'ALL' ? 'ENTRANCE & EXIT  /  进出门' : direction === 'ENTRANCE' ? 'ENTRANCE  /  进门' : 'EXIT  /  出门';
    const itemCount = permits.reduce((sum, permit) => sum + permit.items.length, 0);

    const buffer = await renderDocumentPdf({
      title: 'Gate Pass Register',
      titleZh: '门岗登记',
      numberPrefix: '',
      number: `Gate register ${dateKey}`,
      layout: 'landscape',
      hero: {
        headline: dirLabel,
        caption: `${permits.length} approved permit(s)  ·  ${itemCount} item(s)`,
        dateLabel: 'Date / 日期',
        date: dateKey,
      },
      tables,
      notes: [
        'Approved permits only. Security ticks each item as it passes the gate.',
        '仅列出已批准的许可。保安在物品通过门岗时逐项勾选。',
      ],
    });

    const dirSlug = direction === 'ALL' ? 'all' : direction.toLowerCase();
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `exit-permit-gate-register_${dirSlug}_${dateKey}.pdf`,
    };
  }
}
