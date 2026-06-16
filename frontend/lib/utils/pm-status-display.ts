import type {
  IssueSeverity,
  IssueStatus,
  RfiPriority,
  RfiStatus,
} from '@/lib/api/project-management.types';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import {
  ISSUE_WORKFLOW,
  RFI_WORKFLOW,
} from '@/lib/api/workflow';

export function formatRfiStatus(status: RfiStatus): string {
  return RFI_WORKFLOW.find((step) => step.key === status)?.label ?? status;
}

export function formatIssueStatus(status: IssueStatus): string {
  return ISSUE_WORKFLOW.find((step) => step.key === status)?.label ?? status;
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

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) {
    return false;
  }
  return new Date(dueDate) < new Date();
}
