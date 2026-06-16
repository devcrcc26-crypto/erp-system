export interface WorkflowStep {
  key: string;
  label: string;
}

export const PROJECT_STATUS_WORKFLOW: WorkflowStep[] = [
  { key: 'PLANNING', label: 'Planning' },
  { key: 'TENDER', label: 'Tender' },
  { key: 'MOBILIZATION', label: 'Mobilization' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'ON_HOLD', label: 'On Hold' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CLOSED', label: 'Closed' },
];

export const RFI_WORKFLOW: WorkflowStep[] = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'ANSWERED', label: 'Answered' },
  { key: 'CLOSED', label: 'Closed' },
];

export const SUBMITTAL_WORKFLOW: WorkflowStep[] = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'APPROVED_WITH_COMMENTS', label: 'Approved with Comments' },
  { key: 'REVISE_AND_RESUBMIT', label: 'Revise and Resubmit' },
  { key: 'REJECTED', label: 'Rejected' },
];

export const MEETING_WORKFLOW: WorkflowStep[] = [
  { key: 'SCHEDULED', label: 'Scheduled' },
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
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'CLOSED', label: 'Closed' },
];

export const PUNCH_ITEM_WORKFLOW: WorkflowStep[] = [
  { key: 'RAISED', label: 'Raised' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'CORRECTED', label: 'Corrected' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'CLOSED', label: 'Closed' },
];

export const CLOSEOUT_WORKFLOW: WorkflowStep[] = [
  { key: 'PRACTICAL_COMPLETION', label: 'Practical Completion' },
  { key: 'DEFECTS_LIABILITY_PERIOD', label: 'Defects Liability Period' },
  { key: 'FINAL_COMPLETION', label: 'Final Completion' },
  { key: 'FINANCIAL_CLOSEOUT', label: 'Financial Closeout' },
  { key: 'ARCHIVE', label: 'Archive' },
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
