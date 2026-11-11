/**
 * Standalone August payroll Excel export verification (does not touch Nest).
 */
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PayrollCompanySettingsService } from '../src/modules/payroll/application/services/payroll-company-settings.service';
import { PayrollExcelExportService } from '../src/modules/payroll/application/services/payroll-excel-export.service';

const TARGET = ['EM-010', 'EM-021', 'EM-038', 'EM-043', 'EM-080'] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const service = new PayrollExcelExportService(
    prisma as never,
    new PayrollCompanySettingsService(prisma as never),
    // Standalone run: export audit entries are not needed.
    { create: async () => undefined, buildFromRequestContext: (x: unknown) => x } as never,
  );

  const run = await prisma.payrollRun.findFirst({
    where: { month: 8, year: 2026, deletedAt: null },
  });
  if (!run) {
    throw new Error('August 2026 payroll run not found');
  }

  const file = await service.exportRun(run.id, run.companyId, run.createdBy);
  console.log('FILENAME', file.filename);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer as never);
  const sheet = workbook.getWorksheet('Data');
  if (!sheet) {
    throw new Error('Data sheet missing');
  }

  console.log('TITLE', sheet.getCell('D1').value);
  console.log('SUBTITLE', sheet.getCell('D2').value);
  console.log('HDR_E', sheet.getCell('E3').value);
  console.log('HDR_F', sheet.getCell('F3').value);
  console.log('HDR_G', sheet.getCell('G3').value);
  console.log('HDR_V', sheet.getCell('V3').value);
  console.log('HDR_M', sheet.getCell('M3').value);
  console.log('SUB_N', sheet.getCell('N4').value);

  const entries = await prisma.payrollEntry.findMany({
    where: {
      runId: run.id,
      employee: { employeeId: { in: [...TARGET] } },
    },
    select: {
      netPay: true,
      normalOtHours: true,
      normalOtPay: true,
      flag: true,
      employee: { select: { employeeId: true, firstName: true, lastName: true } },
    },
  });

  const byId = new Map(
    entries.map((e) => [
      `${e.employee.firstName} ${e.employee.lastName}`.trim(),
      e,
    ]),
  );

  const found: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return;
    const name = String(row.getCell(5).value ?? '');
    if (name === 'TOTAL') {
      console.log(
        'TOTAL_NET_FORMULA',
        (row.getCell(28).value as { formula?: string } | null)?.formula ??
          row.getCell(28).value,
      );
      return;
    }
    const entry = byId.get(name);
    if (!entry) return;
    found.push(entry.employee.employeeId ?? name);
    console.log(
      JSON.stringify({
        id: entry.employee.employeeId,
        name,
        excelNet: row.getCell(28).value,
        dbNet: String(entry.netPay),
        excelNormalHr: row.getCell(13).value,
        dbNormalHr: String(entry.normalOtHours),
        excelNormalPay: row.getCell(14).value,
        flaggedFill:
          (row.getCell(5).fill as { fgColor?: { argb?: string } } | undefined)
            ?.fgColor?.argb ?? null,
        notes: row.getCell(30).value,
      }),
    );
  });

  console.log('FOUND', found.sort().join(','));
  console.log('STATUS', run.status);
  console.log('HAS_DRAFT_BANNER', String(sheet.getCell('AC2').value).includes('NOT APPROVED'));

  // Totals vs run summary
  const sumNet = entries.reduce((s, e) => s + Number(e.netPay), 0);
  console.log('FIVE_NET_SUM', sumNet.toFixed(2));
  console.log('RUN_TOTAL_NET', String(run.totalNetPay));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
