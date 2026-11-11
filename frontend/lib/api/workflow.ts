import type { ProjectStatus } from '@/lib/constants/project-status';
import {
  PROJECT_STATUS_DEFINITIONS,
  PROJECT_STATUS_DEFAULT,
  PROJECT_STATUS_VALUES,
  formatProjectStatusLabel,
  projectStatusBadgeVariant,
} from '@/lib/constants/project-status';

export type { ProjectStatus };
export { PROJECT_STATUS_DEFAULT, PROJECT_STATUS_VALUES };

export interface WorkflowStep {
  key: string;
  label: string;
}

export const PROJECT_STATUS_WORKFLOW: WorkflowStep[] =
  PROJECT_STATUS_DEFINITIONS.map((definition) => ({
    key: definition.value,
    label: definition.label,
  }));

export const RFI_WORKFLOW: WorkflowStep[] = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'ANSWERED', label: 'Answered' },
  { key: 'CLOSED', label: 'Closed' },
];

export const SUBMITTAL_WORKFLOW: WorkflowStep[] = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'UNDER_SITE_REVIEW', label: 'Under Site Review' },
  { key: 'SITE_APPROVED', label: 'Site Approved' },
  { key: 'PENDING_CONSULTANT_REVIEW', label: 'Pending Consultant Review' },
  { key: 'CONSULTANT_REVIEWED', label: 'Consultant Reviewed' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'APPROVED_WITH_COMMENTS', label: 'Approved with Comments' },
  { key: 'REVISE_AND_RESUBMIT', label: 'Revise and Resubmit' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
];

export const MEETING_WORKFLOW: WorkflowStep[] = [
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'CONDUCTED', label: 'Conducted' },
  { key: 'MINUTES_ISSUED', label: 'Minutes Issued' },
  { key: 'CLOSED', label: 'Closed' },
];

export const CORRESPONDENCE_WORKFLOW: WorkflowStep[] = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SENT', label: 'Sent' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'CLOSED', label: 'Closed' },
];

export const ISSUE_WORKFLOW: WorkflowStep[] = [
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'CLOSED', label: 'Closed' },
];

export const PUNCH_ITEM_WORKFLOW: WorkflowStep[] = [
  { key: 'RAISED', label: 'Raised' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'CORRECTED', label: 'Corrected' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'CLOSED', label: 'Closed' },
];

export const RISK_WORKFLOW: WorkflowStep[] = [
  { key: 'OPEN', label: 'Open' },
  { key: 'MITIGATED', label: 'Mitigated' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'MONITORING', label: 'Monitoring (legacy)' },
];

export const CLOSEOUT_WORKFLOW: WorkflowStep[] = [
  { key: 'PRACTICAL_COMPLETION', label: 'Practical Completion' },
  { key: 'DEFECTS_LIABILITY_PERIOD', label: 'Defects Liability Period' },
  { key: 'FINAL_COMPLETION', label: 'Final Completion' },
  { key: 'FINANCIAL_CLOSEOUT', label: 'Financial Closeout' },
  { key: 'ARCHIVE', label: 'Archive' },
];

export const DAILY_LOG_WORKFLOW: WorkflowStep[] = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'APPROVED', label: 'Approved' },
];

/**
 * Resolves the active step index for a workflow, matching by key (case-insensitive).
 */
export function getWorkflowStepIndex(
  steps: WorkflowStep[],
  currentStatus: string,
): number {
  const normalized = currentStatus.trim().toUpperCase();
  const index = steps.findIndex((step) => step.key === normalized);
  return index >= 0 ? index : 0;
}

/**
 * Human-readable label for a workflow status key.
 */
export function getWorkflowStepLabel(
  steps: WorkflowStep[],
  currentStatus: string,
): string {
  const normalized = currentStatus.trim().toUpperCase();
  return steps.find((step) => step.key === normalized)?.label ?? currentStatus;
}

export { formatProjectStatusLabel, projectStatusBadgeVariant };
