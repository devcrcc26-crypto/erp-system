import {
  DesignPackage,
  DesignPackageDependency,
  DesignPackageItem,
  EngineeringDocument,
  EngineeringDocumentVersion,
  Prisma,
  WorkflowEventLog,
} from '@prisma/client';

export interface MappedEngineeringDocumentVersion {
  id: string;
  companyId: string;
  engineeringDocumentId: string;
  documentVersionId: string;
  revisionLabel: string;
  status: EngineeringDocumentVersion['status'];
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
}

export interface MappedDesignPackage {
  id: string;
  companyId: string;
  taskDisciplineId: string;
  name: string;
  projectedStatus: DesignPackage['projectedStatus'];
  projectionPending: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  requiredTiers: DesignPackage['requiredTiers'];
  packageOwnerUserId: string | null;
  packageReviewerUserId: string | null;
  packageDisciplineLeadUserId: string | null;
  packageChiefUserId: string | null;
  packageInstituteChiefUserId: string | null;
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

export function mapEngineeringDocumentVersion(
  row: EngineeringDocumentVersion,
): MappedEngineeringDocumentVersion {
  return {
    id: row.id,
    companyId: row.companyId,
    engineeringDocumentId: row.engineeringDocumentId,
    documentVersionId: row.documentVersionId,
    revisionLabel: row.revisionLabel,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export function mapEngineeringDocument(
  row: EngineeringDocument & { versions?: EngineeringDocumentVersion[] },
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

export function mapDesignPackageItem(row: DesignPackageItem): MappedDesignPackageItem {
  return {
    id: row.id,
    companyId: row.companyId,
    designPackageId: row.designPackageId,
    engineeringDocumentVersionId: row.engineeringDocumentVersionId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

export function mapDesignPackage(
  row: DesignPackage & { items?: DesignPackageItem[] },
): MappedDesignPackage {
  return {
    id: row.id,
    companyId: row.companyId,
    taskDisciplineId: row.taskDisciplineId,
    name: row.name,
    projectedStatus: row.projectedStatus,
    projectionPending: row.projectionPending,
    submittedAt: toIsoString(row.submittedAt),
    approvedAt: toIsoString(row.approvedAt),
    requiredTiers: row.requiredTiers,
    packageOwnerUserId: row.packageOwnerUserId,
    packageReviewerUserId: row.packageReviewerUserId,
    packageDisciplineLeadUserId: row.packageDisciplineLeadUserId,
    packageChiefUserId: row.packageChiefUserId,
    packageInstituteChiefUserId: row.packageInstituteChiefUserId,
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
