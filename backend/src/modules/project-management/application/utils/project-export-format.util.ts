import {
  ApprovalLevel,
  CompletionStatus,
  ProjectContractType,
  ProjectStatus,
  ProjectType,
  TaskLanguage,
  UrgencyLevel,
} from '@prisma/client';
import { formatProjectContractTypeLabel } from '@/shared/project-contract-type';
import { formatProjectStatusLabel } from '@/shared/project-status';

/**
 * Formats project/task name for export: "English (Chinese)" when Chinese is set.
 */
export function formatExportLocalizedName(
  name: string,
  nameZh: string | null | undefined,
): string {
  const trimmedZh = nameZh?.trim();
  if (trimmedZh) {
    return `${name} (${trimmedZh})`;
  }
  return name;
}

/**
 * Formats a date-only value as YYYY-MM-DD.
 */
export function formatExportDate(value: Date | null | undefined): string {
  if (value == null) {
    return '';
  }
  return value.toISOString().slice(0, 10);
}

/**
 * Formats a datetime value as ISO string without milliseconds.
 */
export function formatExportDateTime(value: Date | null | undefined): string {
  if (value == null) {
    return '';
  }
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Formats optional boolean as Yes/No for export columns.
 */
export function formatExportYesNo(value: boolean | null | undefined): string {
  if (value == null) {
    return '';
  }
  return value ? 'Yes' : 'No';
}

/**
 * Formats Prisma Decimal-like values for spreadsheet cells.
 */
export function formatExportNumber(
  value: { toString(): string } | number | null | undefined,
): number | string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Number(value.toString());
  return Number.isNaN(parsed) ? value.toString() : parsed;
}

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

export function formatExportProjectType(
  value: ProjectType | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return PROJECT_TYPE_LABELS[value] ?? value;
}

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  NORMAL: 'Normal',
  URGENT: 'Urgent',
  CRITICAL: 'Critical',
};

export function formatExportUrgency(
  value: UrgencyLevel | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return URGENCY_LABELS[value] ?? value;
}

const LANGUAGE_LABELS: Record<TaskLanguage, string> = {
  CHINESE: 'Chinese',
  ENGLISH: 'English',
};

export function formatExportLanguage(
  value: TaskLanguage | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return LANGUAGE_LABELS[value] ?? value;
}

const APPROVAL_LEVEL_LABELS: Record<ApprovalLevel, string> = {
  DEPARTMENT: 'Department',
  INSTITUTE: 'Institute',
};

export function formatExportApprovalLevel(
  value: ApprovalLevel | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return APPROVAL_LEVEL_LABELS[value] ?? value;
}

const COMPLETION_STATUS_LABELS: Record<CompletionStatus, string> = {
  NORMAL: 'Normal',
  AHEAD: 'Ahead',
  BEHIND: 'Behind',
};

export function formatExportCompletionStatus(
  value: CompletionStatus | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return COMPLETION_STATUS_LABELS[value] ?? value;
}

/** Human-readable project status label for Excel export. */
export function formatExportProjectStatus(
  value: ProjectStatus | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return formatProjectStatusLabel(value);
}

/** Human-readable project contract type label for Excel export. */
export function formatExportContractType(
  value: ProjectContractType | null | undefined,
): string {
  if (value == null) {
    return formatProjectContractTypeLabel('NO_ASSIGNMENT');
  }
  return formatProjectContractTypeLabel(value);
}

/**
 * Normalizes discipline names for template matching.
 */
export function normalizeDisciplineName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s/_&()-]+/g, '');
}
