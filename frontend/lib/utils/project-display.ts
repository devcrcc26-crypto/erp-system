import type { ProjectStatus, ProjectType } from '@/lib/api/project-management.types';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { PROJECT_STATUS_WORKFLOW } from '@/lib/api/workflow';

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  INFRASTRUCTURE: 'Infrastructure',
  INDUSTRIAL: 'Industrial',
};

const PROJECT_STATUS_VARIANTS: Record<ProjectStatus, StatusBadgeVariant> = {
  PLANNING: 'info',
  TENDER: 'warning',
  MOBILIZATION: 'orange',
  ACTIVE: 'success',
  ON_HOLD: 'default',
  COMPLETED: 'success',
  CLOSED: 'default',
};

export function formatProjectType(type: ProjectType | null): string {
  if (!type) {
    return '—';
  }
  return PROJECT_TYPE_LABELS[type];
}

export function formatProjectStatus(status: ProjectStatus): string {
  const step = PROJECT_STATUS_WORKFLOW.find((item) => item.key === status);
  return step?.label ?? status;
}

export function projectStatusVariant(status: ProjectStatus): StatusBadgeVariant {
  return PROJECT_STATUS_VARIANTS[status];
}

export function formatProjectDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString();
}

export function formatProjectBudget(
  budget: string | null,
  currency: string | null,
): string {
  if (!budget) {
    return '—';
  }
  const amount = Number(budget);
  if (Number.isNaN(amount)) {
    return budget;
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}
