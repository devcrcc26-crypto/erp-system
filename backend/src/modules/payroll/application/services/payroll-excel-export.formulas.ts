/**
 * Excel formula builders for the HR payroll export (Data sheet columns J–AB).
 * Cached results must equal the payroll engine's stored amounts to the cent.
 */

const TAX_IF =
  'IF({y}<=2000,0,IF({y}<=4000,{y}*0.15-300,IF({y}<=7000,{y}*0.2-500,' +
  'IF({y}<=10000,{y}*0.25-850,IF({y}<=14000,{y}*0.3-1350,{y}*0.35-2050)))))';

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function colLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** J = ROUND(H/30*I,2) */
export function earnedFormula(row: number): string {
  return `ROUND(H${row}/30*I${row},2)`;
}

/**
 * Transport / bonus for a contract slice.
 * Full month (days === 30): plain monthly value (no formula).
 * Otherwise: =ROUND(monthly*days/30,2) with constants in the formula.
 */
export function allowanceFormulaOrValue(
  monthly: number,
  contractDays: number,
): { formula?: string; value: number } {
  const value = round2((monthly * contractDays) / 30);
  if (contractDays === 30 && monthly === value) {
    return { value: round2(monthly) };
  }
  return {
    formula: `ROUND(${formatConst(monthly)}*${formatConst(contractDays)}/30,2)`,
    value,
  };
}

/** N = ROUND(H/192*M*1.5,2) */
export function normalOtPayFormula(row: number): string {
  return `ROUND(H${row}/192*M${row}*1.5,2)`;
}

/** P = ROUND(H/192*O*1.75,2) */
export function eveningOtPayFormula(row: number): string {
  return `ROUND(H${row}/192*O${row}*1.75,2)`;
}

/** R = ROUND(H/192*Q*2,2) */
export function sundayOtPayFormula(row: number): string {
  return `ROUND(H${row}/192*Q${row}*2,2)`;
}

/** T = ROUND(H/196*S*2.5,2) */
export function holidayOtPayFormula(row: number): string {
  return `ROUND(H${row}/196*S${row}*2.5,2)`;
}

/** U = N+P+R+T */
export function totalOtFormula(row: number): string {
  return `N${row}+P${row}+R${row}+T${row}`;
}

/** W employer pension on first row spanning J_first:J_last (0 when exempt). */
export function pensionEmployerFormula(
  firstRow: number,
  lastRow: number,
  exempt: boolean,
): string {
  if (exempt) {
    return '0';
  }
  return `ROUND(SUM(J${firstRow}:J${lastRow})*11%,2)`;
}

/** X employee pension on first row spanning J_first:J_last (0 when exempt). */
export function pensionEmployeeFormula(
  firstRow: number,
  lastRow: number,
  exempt: boolean,
): string {
  if (exempt) {
    return '0';
  }
  return `ROUND(SUM(J${firstRow}:J${lastRow})*7%,2)`;
}

/** Y taxable income on first row. */
export function taxableIncomeFormula(firstRow: number, lastRow: number): string {
  return (
    `SUM(J${firstRow}:J${lastRow})+SUM(U${firstRow}:U${lastRow})` +
    `+SUM(V${firstRow}:V${lastRow})+SUM(L${firstRow}:L${lastRow})`
  );
}

/** Z income tax brackets on Y (rounded to cents like the payroll engine). */
export function incomeTaxFormula(firstRow: number): string {
  return `ROUND(${TAX_IF.replace(/\{y\}/g, `Y${firstRow}`)},2)`;
}

/** AA = X+Z */
export function totalDeductionFormula(firstRow: number): string {
  return `X${firstRow}+Z${firstRow}`;
}

/**
 * AB net = SUM(J)+SUM(K)+SUM(U)+SUM(V)-AA [+ postTax when non-zero].
 */
export function netPayFormula(
  firstRow: number,
  lastRow: number,
  postTaxNetBonus: number,
): string {
  const base =
    `SUM(J${firstRow}:J${lastRow})+SUM(K${firstRow}:K${lastRow})` +
    `+SUM(U${firstRow}:U${lastRow})+SUM(V${firstRow}:V${lastRow})-AA${firstRow}`;
  if (postTaxNetBonus === 0) {
    return base;
  }
  return `${base}+${formatConst(postTaxNetBonus)}`;
}

export function sumFormula(
  letter: string,
  firstRow: number,
  lastRow: number,
): string {
  return `SUM(${letter}${firstRow}:${letter}${lastRow})`;
}

/** Payroll sheet cross-sheet SUM of Data column over an employee row span. */
export function dataSumFormula(
  dataColLetter: string,
  firstDataRow: number,
  lastDataRow: number,
): string {
  return `SUM(Data!${dataColLetter}${firstDataRow}:${dataColLetter}${lastDataRow})`;
}

/** Payroll sheet single-cell Data reference (first-row W/X/Z/AB). */
export function dataCellFormula(dataColLetter: string, dataRow: number): string {
  return `Data!${dataColLetter}${dataRow}`;
}

function formatConst(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(round2(value));
}
