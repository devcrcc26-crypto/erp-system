import ExcelJS from 'exceljs';

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as { result: unknown }).result ?? '');
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('data/private/August_2026_Salary.xlsx');
  const sheet = wb.getWorksheet('Data')!;

  // Print rows around known dual candidates from prior seed (Abenezer, etc.)
  for (let r = 5; r <= 40; r += 1) {
    const row = sheet.getRow(r);
    const sn = row.getCell(4).value;
    const name = cellText(row.getCell(5).value);
    const days = cellText(row.getCell(9).value);
    const basic = cellText(row.getCell(8).value);
    const note = cellText(row.getCell(29).value);
    console.log(
      `${String(r).padStart(3)} | SN=${String(sn ?? '·').padStart(3)} | days=${days.padStart(4)} | basic=${basic.padStart(8)} | ${name} | note=${note}`,
    );
  }

  // Any row with empty SN but has name or basic?
  console.log('\nEmpty SN rows:');
  for (let r = 5; r <= 105; r += 1) {
    const row = sheet.getRow(r);
    const sn = row.getCell(4).value;
    if (sn != null && String(sn).trim() !== '') continue;
    const name = cellText(row.getCell(5).value);
    const basic = cellText(row.getCell(8).value);
    const days = cellText(row.getCell(9).value);
    if (!name && !basic && !days) continue;
    console.log(r, { name, basic, days, note: cellText(row.getCell(29).value) });
  }

  // Days != 30
  console.log('\nNon-30 worked days:');
  for (let r = 5; r <= 105; r += 1) {
    const row = sheet.getRow(r);
    const daysRaw = row.getCell(9).value;
    const days =
      typeof daysRaw === 'number'
        ? daysRaw
        : Number(cellText(daysRaw));
    if (!Number.isFinite(days) || days === 30) continue;
    console.log(
      r,
      cellText(row.getCell(5).value),
      'SN',
      row.getCell(4).value,
      'days',
      days,
      'basic',
      cellText(row.getCell(8).value),
      'prev SN',
      sheet.getRow(r - 1).getCell(4).value,
      'prev name',
      cellText(sheet.getRow(r - 1).getCell(5).value),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
