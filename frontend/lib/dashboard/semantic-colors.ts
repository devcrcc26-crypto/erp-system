/**
 * Dashboard semantic colors - one mapping used by KPI cards, charts, and alerts.
 * Do not introduce ad-hoc hex values for status elsewhere on the dashboard.
 */
import { tokens } from '@/lib/theme/tokens';

export const dashboardSemantic = {
  danger: tokens.colorRed400,
  dangerStrong: tokens.colorRed600,
  dangerBg: tokens.colorRed50,
  warning: tokens.colorAmber400,
  warningBg: tokens.colorAmber50,
  accent: tokens.colorBlue400,
  accentBg: tokens.colorBlue50,
  success: tokens.colorGreen400,
  successStrong: tokens.colorGreen600,
  successBg: tokens.colorGreen50,
  neutral: tokens.colorGray200,
  neutralText: tokens.colorGray600,
  quietBorder: tokens.colorBorder,
} as const;

/** Status → semantic fill for categorical charts (issues, risks, projects). */
export const STATUS_SEMANTIC_COLOR: Record<string, string> = {
  OPEN: dashboardSemantic.warning,
  IN_PROGRESS: dashboardSemantic.accent,
  MITIGATED: dashboardSemantic.accent,
  ACCEPTED: dashboardSemantic.neutralText,
  CLOSED: dashboardSemantic.success,
  NOT_STARTED: dashboardSemantic.neutral,
  ON_HOLD: dashboardSemantic.warning,
  COMPLETED: dashboardSemantic.success,
  CANCELLED: dashboardSemantic.danger,
  RAISED: dashboardSemantic.neutral,
  ASSIGNED: dashboardSemantic.accent,
  CORRECTED: dashboardSemantic.warning,
  VERIFIED: dashboardSemantic.success,
  DRAFT: dashboardSemantic.neutral,
  PENDING: dashboardSemantic.warning,
};

/**
 * Punch funnel sequential ramp (light → dark) toward completion.
 * Encodes progression, not categorical status meaning.
 */
export const PUNCH_FUNNEL_RAMP = [
  '#D3D1C7',
  '#A8C4A0',
  '#7BA86A',
  '#639922',
  '#4A7319',
] as const;

export type StatusSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export function colorForStatus(statusKey: string): string {
  return STATUS_SEMANTIC_COLOR[statusKey] ?? dashboardSemantic.neutral;
}
