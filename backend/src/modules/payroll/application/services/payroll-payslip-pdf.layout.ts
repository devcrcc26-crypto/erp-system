/**
 * Pure payslip layout model. The PDF renderer and tests share this so
 * bilingual lines, omitted zeros, and money formatting stay in one place.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface PayslipPdfModel {
  month: number;
  year: number;
  runNumber: string;
  generatedAt: Date;
  employeeName: string;
  employeeCode: string;
  department: string;
  discipline: string;
  bankName: string;
  bankAccountMasked: string;
  paidDays: number;
  basicSalary: number;
  earnedSalary: number;
  normalOtHours: number;
  eveningOtHours: number;
  sundayOtHours: number;
  holidayOtHours: number;
  normalOtPay: number;
  eveningOtPay: number;
  sundayOtPay: number;
  holidayOtPay: number;
  transportAllowance: number;
  monthlyBonus: number;
  bonusTopUp: number;
  bonusTopUpReason: string | null;
  grossIncome: number;
  pensionApplicable: boolean;
  pensionEmployee: number;
  pensionEmployer: number;
  incomeTax: number;
  totalDeductions: number;
  netPay: number;
}

export type PayslipLine =
  | { kind: 'brand'; left: string; right: string }
  | { kind: 'right'; text: string }
  | { kind: 'rule' }
  | { kind: 'pair'; left: string; right: string }
  | { kind: 'section'; label: string; trailing?: string }
  | { kind: 'amount'; label: string; amount: string; indent: number }
  | { kind: 'total'; label: string; amount: string }
  | { kind: 'net'; label: string; amount: string }
  | { kind: 'note'; text: string };

/**
 * Formats an ETB amount with thousand separators and two decimals.
 */
export function formatEtb(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Formats hours or days, dropping trailing zeros.
 */
export function formatQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Shows only the last four characters of a bank account.
 */
export function maskAccountLast4(account: string | null | undefined): string | null {
  if (!account) {
    return null;
  }
  const compact = account.replace(/\s+/g, '');
  if (compact.length === 0) {
    return null;
  }
  const last4 = compact.length <= 4 ? compact : compact.slice(-4);
  return `••••${last4}`;
}

/**
 * English month and year, e.g. "October 2026".
 */
export function formatPayslipMonth(month: number, year: number): string {
  const label = MONTHS[month - 1] ?? String(month);
  return `${label} ${year}`;
}

/**
 * UTC calendar date used in the payslip footer.
 */
export function formatGeneratedDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = (MONTHS[date.getUTCMonth()] ?? '').slice(0, 3);
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

/**
 * Display name, including the Chinese name when the employee has one.
 */
export function formatEmployeeName(employee: {
  firstName: string;
  lastName: string;
  chineseName?: string | null;
}): string {
  const western = `${employee.firstName} ${employee.lastName}`.trim();
  const chinese = employee.chineseName?.trim();
  if (chinese) {
    return western.length > 0 ? `${western} (${chinese})` : chinese;
  }
  return western;
}

/**
 * ZIP entry name: Payslip_{YYYY}_{MM}_{employeeId}_{Name}.pdf
 */
export function payslipPdfFileName(input: {
  year: number;
  month: number;
  employeeCode: string | null;
  employeeName: string;
}): string {
  const mm = String(input.month).padStart(2, '0');
  const code = sanitizeFileToken(input.employeeCode ?? 'NOID');
  const name = sanitizeFileToken(input.employeeName);
  return `Payslip_${input.year}_${mm}_${code}_${name}.pdf`;
}

function sanitizeFileToken(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u3400-\u9fff.-]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  return cleaned.length > 0 ? cleaned : 'Employee';
}

/**
 * Builds the ordered lines of a one-page bilingual payslip.
 * Overtime rows with zero hours and a zero bonus top-up are omitted.
 */
export function buildPayslipLines(model: PayslipPdfModel): PayslipLine[] {
  const lines: PayslipLine[] = [
    { kind: 'brand', left: 'CCECC Ethiopia Branch', right: 'PAYSLIP / 工资单' },
    { kind: 'right', text: formatPayslipMonth(model.month, model.year) },
    { kind: 'rule' },
    {
      kind: 'pair',
      left: `Employee / 员工:  ${model.employeeName}`,
      right: `ID / 工号: ${model.employeeCode || '—'}`,
    },
    {
      kind: 'pair',
      left: `Department / 部门: ${model.department || '—'}`,
      right: `Discipline / 专业: ${model.discipline || '—'}`,
    },
    {
      kind: 'pair',
      left: `Bank / 银行: ${model.bankName || '—'}`,
      right: `Account / 账号: ${model.bankAccountMasked || '—'}`,
    },
    {
      kind: 'pair',
      left: `Paid days / 计薪天数: ${formatQuantity(model.paidDays)} of 30`,
      right: '',
    },
    { kind: 'rule' },
    { kind: 'section', label: 'EARNINGS / 收入', trailing: 'Amount (ETB)' },
    {
      kind: 'amount',
      indent: 1,
      label: `Basic salary / 基本工资 (${formatEtb(model.basicSalary)} ÷ 30 × ${formatQuantity(model.paidDays)})`,
      amount: formatEtb(model.earnedSalary),
    },
  ];

  const overtime: Array<{ label: string; hours: number; rate: string; amount: number }> = [
    { label: 'Normal', hours: model.normalOtHours, rate: '1.5', amount: model.normalOtPay },
    { label: 'Evening', hours: model.eveningOtHours, rate: '1.75', amount: model.eveningOtPay },
    { label: 'Sunday', hours: model.sundayOtHours, rate: '2.0', amount: model.sundayOtPay },
    { label: 'Holiday', hours: model.holidayOtHours, rate: '2.5', amount: model.holidayOtPay },
  ];
  const overtimeRows = overtime.filter((row) => row.hours > 0);
  if (overtimeRows.length > 0) {
    lines.push({ kind: 'amount', indent: 1, label: 'Overtime / 加班', amount: '' });
    for (const row of overtimeRows) {
      lines.push({
        kind: 'amount',
        indent: 2,
        label: `${row.label}   ${formatQuantity(row.hours)} h × ${row.rate}`,
        amount: formatEtb(row.amount),
      });
    }
  }

  lines.push({
    kind: 'amount',
    indent: 1,
    label: 'Transport allowance / 交通补贴',
    amount: formatEtb(model.transportAllowance),
  });
  lines.push({
    kind: 'amount',
    indent: 1,
    label: 'Bonus / 奖金',
    amount: formatEtb(model.monthlyBonus),
  });

  if (model.bonusTopUp > 0) {
    const reason = model.bonusTopUpReason?.trim();
    lines.push({
      kind: 'amount',
      indent: 1,
      label: reason
        ? `Bonus top-up / 额外奖金  (${reason})`
        : 'Bonus top-up / 额外奖金',
      amount: formatEtb(model.bonusTopUp),
    });
  }

  lines.push({
    kind: 'total',
    label: 'GROSS / 应发合计',
    amount: formatEtb(model.grossIncome),
  });
  lines.push({ kind: 'section', label: 'DEDUCTIONS / 扣除' });
  lines.push({
    kind: 'amount',
    indent: 1,
    label: 'Pension (employee 7%) / 养老金',
    amount: model.pensionApplicable
      ? formatEtb(model.pensionEmployee)
      : 'Not applicable / 不适用',
  });
  lines.push({
    kind: 'amount',
    indent: 1,
    label: 'Income tax / 个人所得税',
    amount: formatEtb(model.incomeTax),
  });
  lines.push({
    kind: 'total',
    label: 'TOTAL / 扣除合计',
    amount: formatEtb(model.totalDeductions),
  });
  lines.push({ kind: 'rule' });
  lines.push({
    kind: 'net',
    label: 'NET PAY / 实发工资',
    amount: `ETB ${formatEtb(model.netPay)}`,
  });
  lines.push({ kind: 'rule' });
  lines.push({
    kind: 'note',
    text: `Employer pension (11%, not deducted) / 公司养老金: ${
      model.pensionApplicable
        ? formatEtb(model.pensionEmployer)
        : 'Not applicable / 不适用'
    }`,
  });
  lines.push({
    kind: 'note',
    text: `Run ${model.runNumber} · Generated ${formatGeneratedDate(model.generatedAt)}`,
  });
  lines.push({ kind: 'note', text: 'This payslip is system-generated.' });
  return lines;
}

/**
 * Every character that must exist in the embedded font for a given payslip.
 */
export function collectPayslipText(model: PayslipPdfModel): string {
  const parts: string[] = [];
  for (const line of buildPayslipLines(model)) {
    switch (line.kind) {
      case 'brand':
        parts.push(line.left, line.right);
        break;
      case 'right':
      case 'note':
        parts.push(line.text);
        break;
      case 'pair':
        parts.push(line.left, line.right);
        break;
      case 'section':
        parts.push(line.label, line.trailing ?? '');
        break;
      case 'amount':
      case 'total':
      case 'net':
        parts.push(line.label, line.amount);
        break;
      case 'rule':
        break;
      default:
        break;
    }
  }
  return parts.join('');
}
