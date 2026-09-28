import type {
  EvaluationCycleStatus,
  EvaluationStatus,
} from '@/lib/api/evaluation.types';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  PENDING: 'Pending',
  SELF_ASSESSED: 'Self-Assessed',
  TEAM_LEAD_ASSESSED: 'Team Lead Assessed',
  DISCIPLINE_ASSESSED: 'DL Assessed',
  RESULT_SHARED: 'Result Shared',
  ACCEPTED: 'Accepted',
  DISPUTED: 'Disputed',
  DL_UPHELD: 'DL Upheld',
  DL_ADJUSTED: 'DL Adjusted',
  ESCALATED: 'Escalated to HR',
  HR_DECIDED: 'HR Decided',
  LOCKED: 'Locked',
};

export const EVALUATION_STATUS_COLORS: Record<EvaluationStatus, string> = {
  PENDING: 'default',
  SELF_ASSESSED: 'blue',
  TEAM_LEAD_ASSESSED: 'cyan',
  DISCIPLINE_ASSESSED: 'purple',
  RESULT_SHARED: 'gold',
  ACCEPTED: 'success',
  DISPUTED: 'warning',
  DL_UPHELD: 'orange',
  DL_ADJUSTED: 'orange',
  ESCALATED: 'error',
  HR_DECIDED: 'success',
  LOCKED: 'default',
};

export const EVALUATION_STATUS_BADGE: Record<
  EvaluationStatus,
  StatusBadgeVariant
> = {
  PENDING: 'default',
  SELF_ASSESSED: 'info',
  TEAM_LEAD_ASSESSED: 'cyan',
  DISCIPLINE_ASSESSED: 'info',
  RESULT_SHARED: 'warning',
  ACCEPTED: 'success',
  DISPUTED: 'warning',
  DL_UPHELD: 'orange',
  DL_ADJUSTED: 'orange',
  ESCALATED: 'error',
  HR_DECIDED: 'success',
  LOCKED: 'default',
};

export const CYCLE_STATUS_LABELS: Record<EvaluationCycleStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
};

export const CYCLE_STATUS_COLORS: Record<EvaluationCycleStatus, string> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  CLOSED: 'default',
};

export const CYCLE_STATUS_BADGE: Record<
  EvaluationCycleStatus,
  StatusBadgeVariant
> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  CLOSED: 'default',
};

export function getQuarterLabel(quarter: number, year: number): string {
  return `Q${quarter} ${year}`;
}

export function getQuarterPeriodLabel(quarter: number, year: number): string {
  const periods = ['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec'];
  return `${periods[quarter - 1] ?? ''} ${year}`;
}

export function getScoreLabel(score: number | null): string {
  if (score === null) return 'N/A';
  if (score >= 4.5) return 'Outstanding';
  if (score >= 3.5) return 'Exceeds Expectations';
  if (score >= 2.5) return 'Meets Expectations';
  if (score >= 1.5) return 'Needs Improvement';
  return 'Unsatisfactory';
}

export function getScoreColor(score: number | null): string {
  if (score === null) return 'default';
  if (score >= 4.5) return '#52c41a';
  if (score >= 3.5) return '#1677ff';
  if (score >= 2.5) return '#faad14';
  if (score >= 1.5) return '#fa8c16';
  return '#f5222d';
}
