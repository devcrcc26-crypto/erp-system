import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  SiteAssignmentListItem,
  SiteAssignmentStatus,
} from '@/lib/api/site-assignment.types';

/** StatusBadge colour for a site assignment status (list, detail and profile). */
export function siteAssignmentStatusVariant(
  status: SiteAssignmentStatus,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
    case 'CANCELLED':
      return 'error';
    case 'SUBMITTED':
    case 'IN_REVIEW':
    case 'RETURNED':
      return 'warning';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Free-text project name, or legacy linked project row. */
export function formatSiteAssignmentProject(
  row: Pick<SiteAssignmentListItem, 'projectName' | 'project'>,
): string | null {
  const name = row.projectName?.trim();
  if (name) {
    return name;
  }
  if (row.project) {
    return `${row.project.projectCode} - ${row.project.name}`;
  }
  return null;
}
