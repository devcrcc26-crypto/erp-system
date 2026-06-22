import type {
  IssueSeverity,
  IssueStatus,
  MeetingStatus,
  CorrespondenceStatus,
  RfiPriority,
  RfiStatus,
  SubmittalStatus,
  TaskStatus,
} from '@/lib/api/project-management.types';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import {
  CORRESPONDENCE_WORKFLOW,
  ISSUE_WORKFLOW,
  MEETING_WORKFLOW,
  RFI_WORKFLOW,
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
    ASSIGNED: 'warning',
    IN_PROGRESS: 'orange',
    RESOLVED: 'info',
    VERIFIED: 'success',
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

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) {
    return false;
  }
  return new Date(dueDate) < new Date();
}
