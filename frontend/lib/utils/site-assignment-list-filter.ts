import type {
  SiteAssignmentListItem,
  SiteAssignmentStatus,
} from '@/lib/api/site-assignment.types';
import { formatSiteAssignmentProject } from '@/lib/utils/site-assignment-display';
import { formatUserName } from '@/lib/utils/user-display';

export type SiteAssignmentStatusMode = 'all' | 'pending' | 'approved' | 'rejected';

export const SITE_ASSIGNMENT_PENDING_STATUSES: SiteAssignmentStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
export const SITE_ASSIGNMENT_APPROVED_STATUSES: SiteAssignmentStatus[] = [
  'APPROVED',
];
export const SITE_ASSIGNMENT_REJECTED_STATUSES: SiteAssignmentStatus[] = [
  'REJECTED',
  'CANCELLED',
];

export function statusesForSiteAssignmentMode(
  mode: SiteAssignmentStatusMode,
): SiteAssignmentStatus[] {
  switch (mode) {
    case 'pending':
      return SITE_ASSIGNMENT_PENDING_STATUSES;
    case 'approved':
      return SITE_ASSIGNMENT_APPROVED_STATUSES;
    case 'rejected':
      return SITE_ASSIGNMENT_REJECTED_STATUSES;
    default:
      return [];
  }
}

/**
 * Client-side site assignment search by request #, employee, site, or project.
 */
export function matchesSiteAssignmentSearch(
  row: SiteAssignmentListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employee = formatUserName(row.employee).toLowerCase();
  const site = row.siteName.toLowerCase();
  const request = row.requestNumber.toLowerCase();
  const project = formatSiteAssignmentProject(row)?.toLowerCase() ?? '';
  return (
    employee.includes(needle) ||
    site.includes(needle) ||
    request.includes(needle) ||
    project.includes(needle)
  );
}

export interface SiteAssignmentListFilters {
  search: string;
  statusMode?: SiteAssignmentStatusMode;
  siteName?: string;
  month?: number;
  year?: number;
}

/**
 * Filters site assignments in memory (status mode, site, month, search).
 */
export function filterSiteAssignments(
  rows: SiteAssignmentListItem[],
  filters: SiteAssignmentListFilters,
): SiteAssignmentListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForSiteAssignmentMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    const siteNeedle = filters.siteName?.trim().toLowerCase();
    if (siteNeedle && !row.siteName.toLowerCase().includes(siteNeedle)) {
      return false;
    }

    if (filters.month != null && filters.year != null) {
      const monthStart = Date.UTC(filters.year, filters.month - 1, 1);
      const monthEnd = Date.UTC(filters.year, filters.month, 0);
      const start = new Date(row.startDate).getTime();
      const end = new Date(row.endDate).getTime();
      if (start > monthEnd || end < monthStart) {
        return false;
      }
    }

    return matchesSiteAssignmentSearch(row, filters.search);
  });
}
