import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { PaginationMeta } from '@/lib/api/types';

export type SiteAssignmentStatus =
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface SiteAssignmentProject {
  id: string;
  projectCode: string;
  name: string;
}

export interface SiteAssignmentEmployee {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  employeeId: string | null;
  chineseName?: string | null;
}

export interface SiteAssignmentListItem {
  id: string;
  requestNumber: string;
  employeeId: string;
  siteName: string;
  projectName: string | null;
  projectId: string | null;
  startDate: string;
  endDate: string;
  status: SiteAssignmentStatus;
  reason: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  calendarDays: number;
  employee: SiteAssignmentEmployee;
  project: SiteAssignmentProject | null;
}

export interface SiteAssignmentLinkedPerDiem {
  id: string;
  requestNumber: string;
  destination: string;
  status: string;
  startDate: string;
  endDate: string;
  totalAmountEtb: number | string;
  _count?: { disbursements: number };
}

export interface SiteAssignmentDetail extends SiteAssignmentListItem {
  approvalRequestId: string | null;
  createdAt: string;
  employee: SiteAssignmentEmployee;
  creator: SiteAssignmentEmployee;
  perDiemRequests?: SiteAssignmentLinkedPerDiem[];
  approvalRequest?: {
    id: string;
    status: string;
    currentTier?: number;
    /** Full tier rows (backend includes every scalar plus approver). */
    tiers: ApprovalTier[];
    category?: { code: string; name: string; icon: string | null };
  } | null;
}

export interface SiteAssignmentPickerEmployee {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  employeeId: string | null;
  department?: { name: string } | null;
}

export interface CreateSiteAssignmentPayload {
  employeeId: string;
  onBehalfOfSupervisorId?: string;
  siteName: string;
  projectName?: string;
  startDate: string;
  endDate: string;
  reason?: string;
  lateReason?: string;
  createdFromAttendanceImport?: boolean;
}

/** @deprecated Use CreateSiteAssignmentPayload */
export type SubmitSiteAssignmentPayload = CreateSiteAssignmentPayload;

export interface ListSiteAssignmentsParams {
  page?: number;
  limit?: number;
  status?: SiteAssignmentStatus;
  siteName?: string;
  month?: number;
  year?: number;
  employeeId?: string;
}

export type SiteDaysSummary = Array<{ siteName: string; days: number }>;

export interface PaginatedSiteAssignments {
  data: SiteAssignmentListItem[];
  meta: PaginationMeta;
}
