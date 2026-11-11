// Gap completion - new

import type {
  IssueStatus,
  RfiStatus,
  SubmittalStatus,
  TaskStatus,
} from '@/lib/api/project-management.types';

/** Valid task status transitions aligned with backend schedule.service.ts */
export const TASK_VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS', 'DELAYED'],
  IN_PROGRESS: ['COMPLETED', 'DELAYED', 'NOT_STARTED'],
  DELAYED: ['IN_PROGRESS', 'COMPLETED'],
  COMPLETED: ['IN_PROGRESS'],
};

/** Valid RFI status transitions aligned with backend rfis.service.ts */
export const RFI_VALID_TRANSITIONS: Record<RfiStatus, RfiStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
  UNDER_REVIEW: ['ANSWERED', 'SUBMITTED'],
  ANSWERED: ['CLOSED', 'UNDER_REVIEW'],
  CLOSED: [],
};

/** Valid issue status transitions aligned with backend issues.service.ts */
export const ISSUE_VALID_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['CLOSED'],
  CLOSED: ['IN_PROGRESS'],
};

export const SUBMITTAL_VERDICT_STATUSES: SubmittalStatus[] = [
  'APPROVED',
  'APPROVED_WITH_COMMENTS',
  'REVISE_AND_RESUBMIT',
  'REJECTED',
];

/** Direct PATCH transitions aligned with backend submittals.service.ts */
export const SUBMITTAL_DIRECT_TRANSITIONS: Record<
  SubmittalStatus,
  SubmittalStatus[]
> = {
  DRAFT: ['SUBMITTED'],
  UNDER_SITE_REVIEW: [],
  SITE_APPROVED: [],
  PENDING_CONSULTANT_REVIEW: [],
  CONSULTANT_REVIEWED: [],
  SUBMITTED: ['DRAFT'],
  UNDER_REVIEW: [],
  APPROVED: [],
  APPROVED_WITH_COMMENTS: [],
  REVISE_AND_RESUBMIT: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function nextStatusOptions<T extends string>(
  current: T,
  transitions: Record<string, T[]>,
): T[] {
  return transitions[current] ?? [];
}
