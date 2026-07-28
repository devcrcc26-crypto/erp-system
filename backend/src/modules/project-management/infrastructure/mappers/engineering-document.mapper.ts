import {
  ApprovalLevel,
  DesignPackage,
  DesignPackageDependency,
  DesignPackageItem,
  EngineeringDocument,
  EngineeringDocumentVersion,
  Prisma,
  UrgencyLevel,
  WorkflowEventLog,
} from '@prisma/client';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';

export interface MappedEngineeringDocumentVersion {
  id: string;
  companyId: string;
  engineeringDocumentId: string;
  documentVersionId: string;
  revisionLabel: string;
  status: EngineeringDocumentVersion['status'];
  isCurrent: boolean;
  /** DocumentVersion.versionNumber when loaded. */
  fileVersionNumber: number | null;
  /** Uploaded file name when loaded. */
  fileName: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MappedEngineeringDocument {
  id: string;
  companyId: string;
  taskDisciplineId: string;
  documentType: EngineeringDocument['documentType'];
  documentNumber: string | null;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  versions?: MappedEngineeringDocumentVersion[];
}

export interface MappedDesignPackageItem {
  id: string;
  companyId: string;
  designPackageId: string;
  engineeringDocumentVersionId: string;
  sortOrder: number;
  createdAt: string;
  createdBy: string;
  engineeringDocumentId: string | null;
  documentTitle: string | null;
  revisionLabel: string | null;
  status: EngineeringDocumentVersion['status'] | null;
  documentVersionId: string | null;
  fileVersionNumber: number | null;
  fileName: string | null;
}

export interface MappedDesignPackage {
  id: string;
  companyId: string;
  taskDisciplineId: string;
  packageCode: string;
  subtaskId: string | null;
  subtaskIndex: number | null;
  name: string;
  nameZh: string | null;
  mainWorkContent: string | null;
  plannedStartDate: string | null;
  plannedFinishDate: string | null;
  actualWorkDays: number | null;
  urgencyLevel: UrgencyLevel | null;
  reviewLevel: ApprovalLevel | null;
  projectedStatus: DesignPackage['projectedStatus'];
  projectionPending: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  requiredTiers: DesignPackage['requiredTiers'];
  designerUserId: string | null;
  reviewerUserId: string | null;
  disciplinaryLeaderUserId: string | null;
  deptDeputyChiefUserId: string | null;
  instituteChiefUserId: string | null;
  instituteChiefName: string | null;
  disciplineOwnerUserId: string | null;
  supportingDesignerUserId: string | null;
  siteRepresentativeUserId: string | null;
  siteRepresentativeName: string | null;
  siteRepType: DesignPackage['siteRepType'];
  siteRepName: string | null;
  siteRepEmail: string | null;
  siteRepPhone: string | null;
  siteRepCompany: string | null;
  consultantName: string | null;
  consultantTitle: string | null;
  consultantEmail: string | null;
  consultantPhone: string | null;
  consultantCompany: string | null;
  briefText: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  packageStatus: DesignPackage['packageStatus'];
  packageClosedAt: string | null;
  packageClosedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  items?: MappedDesignPackageItem[];
}

export interface MappedDesignPackageDependency {
  id: string;
  companyId: string;
  designPackageId: string;
  dependsOnPackageId: string;
  dependsOnPackageName: string | null;
  dependencyType: DesignPackageDependency['dependencyType'];
  createdAt: string;
  createdBy: string;
}

export interface MappedWorkflowEventLog {
  id: string;
  companyId: string;
  entityType: WorkflowEventLog['entityType'];
  entityId: string;
  actorId: string;
  action: string;
  phase: WorkflowEventLog['phase'];
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  reason: string | null;
  correlationId: string | null;
  correctsEventId: string | null;
  createdAt: string;
}

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

type EngineeringDocumentVersionWithFile = EngineeringDocumentVersion & {
  documentVersion?: {
    versionNumber: number;
    document?: { name: string } | null;
  } | null;
};

export function mapEngineeringDocumentVersion(
  row: EngineeringDocumentVersionWithFile,
): MappedEngineeringDocumentVersion {
  return {
    id: row.id,
    companyId: row.companyId,
    engineeringDocumentId: row.engineeringDocumentId,
    documentVersionId: row.documentVersionId,
    revisionLabel: row.revisionLabel,
    status: row.status,
    isCurrent: row.isCurrent,
    fileVersionNumber: row.documentVersion?.versionNumber ?? null,
    fileName: row.documentVersion?.document?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export function mapEngineeringDocument(
  row: EngineeringDocument & {
    versions?: EngineeringDocumentVersionWithFile[];
  },
): MappedEngineeringDocument {
  return {
    id: row.id,
    companyId: row.companyId,
    taskDisciplineId: row.taskDisciplineId,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    title: row.title,
    metadata: jsonRecord(row.metadata),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    versions: row.versions?.map(mapEngineeringDocumentVersion),
  };
}

/** Partial EDV payload accepted by package item mapping (full include or close-path select). */
type DesignPackageItemEdvPayload = {
  id?: string;
  status?: EngineeringDocumentVersion['status'];
  revisionLabel?: string;
  documentVersionId?: string;
  engineeringDocumentId?: string;
  isCurrent?: boolean;
  engineeringDocument?: { id?: string; title: string } | null;
  documentVersion?: {
    versionNumber: number;
    document?: { name: string } | null;
  } | null;
};

type DesignPackageItemWithEdv = DesignPackageItem & {
  engineeringDocumentVersion?: DesignPackageItemEdvPayload | null;
};

export function mapDesignPackageItem(
  row: DesignPackageItemWithEdv,
): MappedDesignPackageItem {
  const edv = row.engineeringDocumentVersion;
  return {
    id: row.id,
    companyId: row.companyId,
    designPackageId: row.designPackageId,
    engineeringDocumentVersionId: row.engineeringDocumentVersionId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    engineeringDocumentId: edv?.engineeringDocument?.id ?? edv?.engineeringDocumentId ?? null,
    documentTitle: edv?.engineeringDocument?.title ?? null,
    revisionLabel: edv?.revisionLabel ?? null,
    status: edv?.status ?? null,
    documentVersionId: edv?.documentVersionId ?? null,
    fileVersionNumber: edv?.documentVersion?.versionNumber ?? null,
    fileName: edv?.documentVersion?.document?.name ?? null,
  };
}

export function mapDesignPackage(
  row: DesignPackage & {
    items?: DesignPackageItemWithEdv[];
    siteRepresentative?: {
      firstName: string;
      lastName: string;
      chineseName?: string | null;
      email?: string | null;
    } | null;
  },
): MappedDesignPackage {
  return {
    id: row.id,
    companyId: row.companyId,
    taskDisciplineId: row.taskDisciplineId,
    packageCode: row.packageCode,
    subtaskId: row.subtaskId ?? null,
    subtaskIndex: row.subtaskIndex ?? null,
    name: row.name,
    nameZh: row.nameZh ?? null,
    mainWorkContent: row.mainWorkContent ?? null,
    plannedStartDate: row.plannedStartDate
      ? row.plannedStartDate.toISOString().split('T')[0]
      : null,
    plannedFinishDate: row.plannedFinishDate
      ? row.plannedFinishDate.toISOString().split('T')[0]
      : null,
    actualWorkDays: row.actualWorkDays ?? null,
    urgencyLevel: row.urgencyLevel ?? null,
    reviewLevel: row.reviewLevel ?? null,
    projectedStatus: row.projectedStatus,
    projectionPending: row.projectionPending,
    submittedAt: toIsoString(row.submittedAt),
    approvedAt: toIsoString(row.approvedAt),
    requiredTiers: row.requiredTiers,
    designerUserId: row.designerUserId,
    reviewerUserId: row.reviewerUserId,
    disciplinaryLeaderUserId: row.disciplinaryLeaderUserId,
    deptDeputyChiefUserId: row.deptDeputyChiefUserId,
    instituteChiefUserId: row.instituteChiefUserId,
    instituteChiefName: row.instituteChiefName,
    disciplineOwnerUserId: row.disciplineOwnerUserId,
    supportingDesignerUserId: row.supportingDesignerUserId,
    siteRepresentativeUserId: row.siteRepresentativeUserId ?? null,
    siteRepresentativeName: row.siteRepresentative
      ? formatUserDisplayName(row.siteRepresentative)
      : null,
    siteRepType: row.siteRepType ?? null,
    siteRepName: row.siteRepName ?? null,
    siteRepEmail: row.siteRepEmail ?? null,
    siteRepPhone: row.siteRepPhone ?? null,
    siteRepCompany: row.siteRepCompany ?? null,
    consultantName: row.consultantName ?? null,
    consultantTitle: row.consultantTitle ?? null,
    consultantEmail: row.consultantEmail ?? null,
    consultantPhone: row.consultantPhone ?? null,
    consultantCompany: row.consultantCompany ?? null,
    briefText: row.briefText,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    packageStatus: row.packageStatus,
    packageClosedAt: toIsoString(row.packageClosedAt),
    packageClosedBy: row.packageClosedBy,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    items: row.items?.map(mapDesignPackageItem),
  };
}

export function mapDesignPackageDependency(
  row: DesignPackageDependency & {
    dependsOnPackage?: { name: string } | null;
  },
): MappedDesignPackageDependency {
  return {
    id: row.id,
    companyId: row.companyId,
    designPackageId: row.designPackageId,
    dependsOnPackageId: row.dependsOnPackageId,
    dependsOnPackageName: row.dependsOnPackage?.name ?? null,
    dependencyType: row.dependencyType,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

export function mapWorkflowEventLog(row: WorkflowEventLog): MappedWorkflowEventLog {
  return {
    id: row.id,
    companyId: row.companyId,
    entityType: row.entityType,
    entityId: row.entityId,
    actorId: row.actorId,
    action: row.action,
    phase: row.phase,
    beforeState: jsonRecord(row.beforeState),
    afterState: jsonRecord(row.afterState),
    reason: row.reason,
    correlationId: row.correlationId,
    correctsEventId: row.correctsEventId,
    createdAt: row.createdAt.toISOString(),
  };
}
