/** Tab ids for HR Reports (`?tab=`). */
export const HR_REPORT_TABS = [
  'overview',
  'leave-ot',
  'payroll-spend',
  'contracts-attendance',
] as const;

export type HrReportTabId = (typeof HR_REPORT_TABS)[number];

export function isHrReportTab(value: string | null): value is HrReportTabId {
  return (
    value != null &&
    (HR_REPORT_TABS as readonly string[]).includes(value)
  );
}

export const HR_REPORT_TAB_PARAM = 'tab';

export const PAGE = 'pages.hr.reports';

export const NOT_SPECIFIED = 'NOT_SPECIFIED';

export function humanizeStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatEtbCompact(value: number): string {
  return `${compactNumber.format(value)} ETB`;
}

export function formatPercent(value: number): string {
  return `${value}%`;
}
