import type {
  IssueSeverity,
  IssueStatus,
  MeetingStatus,
  CorrespondenceStatus,
  PunchItemSeverity,
  PunchItemStatus,
  RiskCategory,
  RiskStatus,
  CloseoutStatus,
  RfiPriority,
  RfiStatus,
  SubmittalStatus,
  TaskStatus,
  MilestoneStatus,
} from '@/lib/api/project-management.types';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import {
  CORRESPONDENCE_WORKFLOW,
  ISSUE_WORKFLOW,
  MEETING_WORKFLOW,
  PUNCH_ITEM_WORKFLOW,
  RFI_WORKFLOW,
  RISK_WORKFLOW,
  CLOSEOUT_WORKFLOW,
  SUBMITTAL_WORKFLOW,
  DAILY_LOG_WORKFLOW,
} from '@/lib/api/workflow';

export function formatRfiStatus(status: RfiStatus): string {
  return RFI_WORKFLOW.find((step) => step.key === status)?.label ?? status;
}

export function formatIssueStatus(status: IssueStatus): string {
  return ISSUE_WORKFLOW.find((step) => step.key === status)?.label ?? status;
}

export function formatSubmittalStatus(status: SubmittalStatus): string {
  return (
    SUBMITTAL_WORKFLOW.find((step) => step.key === status)?.label ?? status
  );
}

export function submittalStatusVariant(
  status: SubmittalStatus,
): StatusBadgeVariant {
  const variants: Record<SubmittalStatus, StatusBadgeVariant> = {
    DRAFT: 'default',
    UNDER_SITE_REVIEW: 'warning',
    SITE_APPROVED: 'success',
    SUBMITTED: 'info',
    UNDER_REVIEW: 'warning',
    APPROVED: 'success',
    APPROVED_WITH_COMMENTS: 'success',
    REVISE_AND_RESUBMIT: 'orange',
    REJECTED: 'error',
  };
  return variants[status];
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DELAYED: 'Delayed',
  COMPLETED: 'Completed',
};

export function formatTaskStatus(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

export function taskStatusVariant(status: TaskStatus): StatusBadgeVariant {
  const variants: Record<TaskStatus, StatusBadgeVariant> = {
    NOT_STARTED: 'default',
    IN_PROGRESS: 'info',
    DELAYED: 'error',
    COMPLETED: 'success',
  };
  return variants[status];
}

export function milestoneStatusVariant(
  status: MilestoneStatus | string,
): StatusBadgeVariant {
  const variants: Record<string, StatusBadgeVariant> = {
    PLANNED: 'default',
    IN_PROGRESS: 'info',
    AT_RISK: 'warning',
    DELAYED: 'error',
    COMPLETED: 'success',
  };
  return variants[status] ?? 'default';
}

export function rfiStatusVariant(status: RfiStatus): StatusBadgeVariant {
  const variants: Record<RfiStatus, StatusBadgeVariant> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    UNDER_REVIEW: 'warning',
    ANSWERED: 'success',
    CLOSED: 'default',
  };
  return variants[status];
}

export function rfiPriorityVariant(priority: RfiPriority): StatusBadgeVariant {
  const variants: Record<RfiPriority, StatusBadgeVariant> = {
    LOW: 'default',
    MEDIUM: 'info',
    HIGH: 'warning',
    URGENT: 'error',
  };
  return variants[priority];
}

export function issueStatusVariant(status: IssueStatus): StatusBadgeVariant {
  const variants: Record<IssueStatus, StatusBadgeVariant> = {
    OPEN: 'error',
    IN_PROGRESS: 'orange',
    CLOSED: 'default',
  };
  return variants[status];
}

export function issueSeverityVariant(
  severity: IssueSeverity,
): StatusBadgeVariant {
  const variants: Record<IssueSeverity, StatusBadgeVariant> = {
    LOW: 'default',
    MEDIUM: 'info',
    HIGH: 'warning',
    CRITICAL: 'error',
  };
  return variants[severity];
}

export function formatDailyLogStatus(status: string): string {
  return DAILY_LOG_WORKFLOW.find((step) => step.key === status)?.label ?? status;
}

export function dailyLogStatusVariant(status: string): StatusBadgeVariant {
  const variants: Record<string, StatusBadgeVariant> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    APPROVED: 'success',
  };
  return variants[status] ?? 'default';
}

export function formatMeetingStatus(status: MeetingStatus): string {
  return MEETING_WORKFLOW.find((step) => step.key === status)?.label ?? status;
}

export function meetingStatusVariant(status: MeetingStatus): StatusBadgeVariant {
  const variants: Record<MeetingStatus, StatusBadgeVariant> = {
    SCHEDULED: 'info',
    CONDUCTED: 'warning',
    MINUTES_ISSUED: 'success',
    CLOSED: 'default',
  };
  return variants[status];
}

export function formatCorrespondenceStatus(
  status: CorrespondenceStatus,
): string {
  return (
    CORRESPONDENCE_WORKFLOW.find((step) => step.key === status)?.label ?? status
  );
}

export function correspondenceStatusVariant(
  status: CorrespondenceStatus,
): StatusBadgeVariant {
  const variants: Record<CorrespondenceStatus, StatusBadgeVariant> = {
    DRAFT: 'default',
    SENT: 'info',
    ACKNOWLEDGED: 'success',
    CLOSED: 'default',
  };
  return variants[status];
}

export function formatRiskStatus(status: RiskStatus): string {
  return RISK_WORKFLOW.find((step) => step.key === status)?.label ?? status;
}

export function riskStatusVariant(status: RiskStatus): StatusBadgeVariant {
  const variants: Record<RiskStatus, StatusBadgeVariant> = {
    OPEN: 'error',
    MONITORING: 'warning',
    MITIGATED: 'success',
    CLOSED: 'default',
  };
  return variants[status];
}

export function formatRiskCategory(category: RiskCategory): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function riskScoreVariant(score: number): StatusBadgeVariant {
  if (score >= 15) return 'error';
  if (score >= 8) return 'warning';
  if (score >= 4) return 'orange';
  return 'default';
}

export function formatPunchItemStatus(status: PunchItemStatus): string {
  return (
    PUNCH_ITEM_WORKFLOW.find((step) => step.key === status)?.label ?? status
  );
}

export function punchItemStatusVariant(
  status: PunchItemStatus,
): StatusBadgeVariant {
  const variants: Record<PunchItemStatus, StatusBadgeVariant> = {
    RAISED: 'error',
    ASSIGNED: 'warning',
    CORRECTED: 'info',
    VERIFIED: 'success',
    CLOSED: 'default',
  };
  return variants[status];
}

export function punchItemSeverityVariant(
  severity: PunchItemSeverity,
): StatusBadgeVariant {
  const variants: Record<PunchItemSeverity, StatusBadgeVariant> = {
    MINOR: 'default',
    MAJOR: 'warning',
    CRITICAL: 'error',
  };
  return variants[severity];
}

export function formatCloseoutStatus(status: CloseoutStatus): string {
  return (
    CLOSEOUT_WORKFLOW.find((step) => step.key === status)?.label ?? status
  );
}

export function closeoutStatusVariant(
  status: CloseoutStatus,
): StatusBadgeVariant {
  const variants: Record<CloseoutStatus, StatusBadgeVariant> = {
    PRACTICAL_COMPLETION: 'info',
    DEFECTS_LIABILITY_PERIOD: 'warning',
    FINAL_COMPLETION: 'success',
    FINANCIAL_CLOSEOUT: 'orange',
    ARCHIVE: 'default',
  };
  return variants[status];
}

const CHANGE_REQUEST_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export function formatChangeRequestStatus(status: string): string {
  return CHANGE_REQUEST_STATUS_LABELS[status] ?? status;
}

export function changeRequestStatusVariant(status: string): StatusBadgeVariant {
  const variants: Record<string, StatusBadgeVariant> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    APPROVED: 'success',
    REJECTED: 'error',
    CLOSED: 'default',
  };
  return variants[status] ?? 'default';
}

const DELIVERABLE_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  WAIVED: 'Waived',
};

export function formatDeliverableStatus(status: string): string {
  return DELIVERABLE_STATUS_LABELS[status] ?? status;
}

export function deliverableStatusVariant(status: string): StatusBadgeVariant {
  const variants: Record<string, StatusBadgeVariant> = {
    PLANNED: 'default',
    IN_PROGRESS: 'warning',
    SUBMITTED: 'info',
    APPROVED: 'success',
    WAIVED: 'default',
  };
  return variants[status] ?? 'default';
}

export function revisionTriggerStatusVariant(
  status: string,
): StatusBadgeVariant {
  const variants: Record<string, StatusBadgeVariant> = {
    PENDING: 'warning',
    PROCESSED: 'success',
    CANCELLED: 'default',
  };
  return variants[status] ?? 'default';
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) {
    return false;
  }
  return new Date(dueDate) < new Date();
}
