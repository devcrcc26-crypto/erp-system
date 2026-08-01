import type {
  ProjectTeamRole,
  ProjectType,
} from '@/lib/api/project-management.types';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { ProjectStatus } from '@/lib/constants/project-status';
import {
  formatProjectStatusLabel,
  projectStatusBadgeVariant,
} from '@/lib/constants/project-status';
import type { ProjectResponsibleDepartment } from '@/lib/constants/project-responsible-department';
import {
  formatProjectResponsibleDepartmentLabel,
  projectResponsibleDepartmentBadgeVariant,
} from '@/lib/constants/project-responsible-department';
import type { ProjectDesignProperties } from '@/lib/constants/project-design-properties';
import {
  formatProjectDesignPropertiesLabel,
  projectDesignPropertiesBadgeVariant,
} from '@/lib/constants/project-design-properties';
import type { ProjectDesignStage } from '@/lib/constants/project-design-stage';
import {
  formatProjectDesignStageLabel,
  projectDesignStageBadgeVariant,
} from '@/lib/constants/project-design-stage';

export type { ProjectStatus } from '@/lib/constants/project-status';

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  INFRASTRUCTURE: 'Infrastructure',
  INDUSTRIAL: 'Industrial',
  ROAD: 'Road',
  RAILWAY: 'Railway',
  URBAN_RAIL_TRANSIT: 'Urban Rail Transit',
  BUILDING: 'Building',
  BRIDGE: 'Bridge',
  TUNNEL: 'Tunnel',
  WATER_SUPPLY_DRAINAGE: 'Water Supply & Drainage',
  PORT_HARBOR: 'Port & Harbor',
  AIRPORT: 'Airport',
  POWER_ENERGY: 'Power & Energy',
  MIXED_USE: 'Mixed Use',
  OTHER: 'Other',
};

export const PROJECT_TYPE_OPTIONS = (
  Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]
).map(([value, label]) => ({ value, label }));

const PROJECT_TEAM_ROLE_LABELS: Record<ProjectTeamRole, string> = {
  PROJECT_MANAGER: 'Project manager',
  DISPATCHER: 'Dispatcher',
  SITE_COORDINATOR: 'Site coordinator',
  DEPARTMENT_CHIEF: 'Department chief',
  INSTITUTE_CHIEF: 'Institute chief',
  DEPUTY_CHIEF: 'Deputy chief',
  DOCUMENT_CONTROLLER: 'Document controller',
  OTHER: 'Other',
};

export const PROJECT_TEAM_ROLE_OPTIONS = (
  Object.entries(PROJECT_TEAM_ROLE_LABELS) as [ProjectTeamRole, string][]
).map(([value, label]) => ({ value, label }));

export function formatProjectTeamRole(role: ProjectTeamRole): string {
  return PROJECT_TEAM_ROLE_LABELS[role] ?? role;
}

export function formatProjectResponsibleDepartment(
  value: ProjectResponsibleDepartment,
): string {
  return formatProjectResponsibleDepartmentLabel(value);
}

export function projectResponsibleDepartmentVariant(
  value: ProjectResponsibleDepartment,
): StatusBadgeVariant {
  return projectResponsibleDepartmentBadgeVariant(value);
}

export function formatProjectDesignProperties(
  value: ProjectDesignProperties,
): string {
  return formatProjectDesignPropertiesLabel(value);
}

export function projectDesignPropertiesVariant(
  value: ProjectDesignProperties,
): StatusBadgeVariant {
  return projectDesignPropertiesBadgeVariant(value);
}

export function formatProjectDesignStage(value: ProjectDesignStage): string {
  return formatProjectDesignStageLabel(value);
}

export function projectDesignStageVariant(
  value: ProjectDesignStage,
): StatusBadgeVariant {
  return projectDesignStageBadgeVariant(value);
}

export function formatProjectType(type: ProjectType | null): string {
  if (!type) {
    return '-';
  }
  return PROJECT_TYPE_LABELS[type];
}

export function formatProjectStatus(status: ProjectStatus): string {
  return formatProjectStatusLabel(status);
}

export function projectStatusVariant(status: ProjectStatus): StatusBadgeVariant {
  return projectStatusBadgeVariant(status);
}

import { formatDisplayDate } from '@/lib/utils/date-format';

export function formatProjectDate(value: string | null): string {
  return formatDisplayDate(value);
}

export function formatProjectBudget(
  budget: string | null,
  currency: string | null,
): string {
  if (!budget) {
    return '-';
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
