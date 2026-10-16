/**
 * EPC design workflow types - aligned with backend DTOs and mappers.
 */

import type {
  ApprovalLevel,
  UrgencyLevel,
} from '@/lib/api/project-management.types';

export type { ApprovalLevel, UrgencyLevel };

export type EdvStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'LOCKED'
  | 'SUPERSEDED';

export type EngineeringDocumentType =
  | 'DRAWING'
  | 'REPORT'
  | 'CALCULATION'
  | 'SPECIFICATION'
  | 'PROGRAMME_SCHEDULE'
  | 'OTHER';

export type DesignPackageProjectedStatus =
  | 'IN_PROGRESS'
  | 'PENDING_LEAD'
  | 'APPROVED'
  | 'REWORK_REQUIRED'
  | 'LOCKED';

export type DesignPackageStatus = 'OPEN' | 'SUBMITTED' | 'CLOSED';

export type SiteRepType = 'INTERNAL' | 'EXTERNAL';

export type TaskDisciplineProjectedStatus =
  | 'IN_PROGRESS'
  | 'PENDING_LEAD'
  | 'APPROVED'
  | 'REWORK_REQUIRED';

export type DesignPackageDependencyType =
  | 'FINISH_TO_START'
  | 'COORDINATION_ONLY';

export type CommentSeverity = 'MINOR' | 'MODERATE' | 'MAJOR';

export type CommentStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'VERIFIED'
  | 'CLOSED';

export type ReviewTier =
  | 'DISCIPLINE_OWNER'
  | 'REVIEWER'
  | 'DISCIPLINE_LEAD'
  | 'DEPT_CHIEF'
  | 'INSTITUTE_CHIEF';

export type ReviewSessionStatus =
  | 'ACTIVE'
  | 'APPROVED'
  | 'RETURNED_FOR_REWORK'
  | 'CLOSED'
  | 'SUPERSEDED';

export type WorkflowEntityType =
  | 'EngineeringDocumentVersion'
  | 'DesignPackage'
  | 'TaskDiscipline'
  | 'ReviewSession'
  | 'ReviewComment'
  | 'Submittal';

export type WorkflowEventPhase = 'INTENT' | 'COMMITTED' | 'CORRECTION';

export type WorkflowLoop = 'INTERNAL' | 'EXTERNAL';

export interface EngineeringDocumentVersion {
  id: string;
  companyId: string;
  engineeringDocumentId: string;
  documentVersionId: string;
  revisionLabel: string;
  status: EdvStatus;
  isCurrent: boolean;
  fileVersionNumber?: number | null;
  fileName?: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface EngineeringDocument {
  id: string;
  companyId: string;
  taskDisciplineId: string;
  documentType: EngineeringDocumentType;
  documentNumber: string | null;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  versions?: EngineeringDocumentVersion[];
}

export interface DesignPackageItem {
  id: string;
  companyId: string;
  designPackageId: string;
  engineeringDocumentVersionId: string;
  sortOrder: number;
  createdAt: string;
  createdBy: string;
  engineeringDocumentId?: string | null;
  documentTitle?: string | null;
  revisionLabel?: string | null;
  status?: EdvStatus | string | null;
  documentVersionId?: string | null;
  fileVersionNumber?: number | null;
  fileName?: string | null;
}

export interface DesignPackage {
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
  projectedStatus: DesignPackageProjectedStatus;
  projectionPending: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  requiredTiers: ReviewTier[];
  designerUserId: string | null;
  reviewerUserId: string | null;
  disciplinaryLeaderUserId: string | null;
  deptDeputyChiefUserId: string | null;
  instituteChiefUserId: string | null;
  /** External Institute Chief name - set instead of instituteChiefUserId when they have no system account. Only one of the two is ever populated. */
  instituteChiefName: string | null;
  disciplineOwnerUserId: string | null;
  supportingDesignerUserId: string | null;
  siteRepresentativeUserId: string | null;
  siteRepresentativeName: string | null;
  siteRepType: SiteRepType | null;
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
  packageStatus: DesignPackageStatus;
  packageClosedAt: string | null;
  packageClosedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  items?: DesignPackageItem[];
}

export interface DesignPackageDependency {
  id: string;
  companyId: string;
  designPackageId: string;
  dependsOnPackageId: string;
  dependsOnPackageName?: string | null;
  dependencyType: DesignPackageDependencyType;
  createdAt: string;
  createdBy: string;
}

export interface ReviewSession {
  id: string;
  companyId: string;
  designPackageId: string;
  taskDisciplineId: string;
  status: ReviewSessionStatus;
  currentTier: ReviewTier;
  assignedToUserId: string | null;
  slaDeadlineAt: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface ReviewComment {
  id: string;
  companyId: string;
  reviewSessionId: string;
  engineeringDocumentVersionId: string;
  body: string;
  severity: CommentSeverity;
  status: CommentStatus;
  assignedToUserId: string;
  createdAt: string;
  createdBy: string;
}

export interface WorkflowEventLogEntry {
  id: string;
  companyId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  actorId: string;
  action: string;
  phase: WorkflowEventPhase;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  reason: string | null;
  correlationId: string | null;
  correctsEventId: string | null;
  createdAt: string;
}

export interface ReviewInboxItem {
  reviewSessionId: string;
  designPackageId: string;
  designPackageName: string;
  taskDisciplineId: string;
  disciplineName: string;
  disciplineIndex: number | null;
  overseasTaskNumber: string | null;
  taskIdCode: string | null;
  subtaskId: string | null;
  packageCode: string | null;
  projectId: string;
  projectName: string;
  currentTier: ReviewTier | string;
  slaDeadlineAt: string | null;
  slaOverdue: boolean;
  openedAt: string;
  inboxStatus: 'PENDING' | 'COMPLETED';
  sessionStatus: string;
  actionTakenAt: string | null;
  completedAction: 'APPROVED' | 'RETURNED' | null;
}

export type MyWorkItemKind =
  | 'DISCIPLINE_LEAD'
  | 'SUBTASK_ROLE'
  | 'RESPONSIBLE_PERSON';

export type SubtaskRole =
  | 'DESIGNER'
  | 'SUPPORTING_DESIGNER'
  | 'REVIEWER'
  | 'DISCIPLINE_LEAD'
  | 'DEPT_CHIEF'
  | 'INSTITUTE_CHIEF'
  | 'DISCIPLINE_OWNER';

export interface MyWorkItem {
  kind: MyWorkItemKind;
  projectId: string;
  projectName: string;
  projectNumber: string;
  taskId: string;
  taskName: string;
  taskIdCode: string;
  overseasTaskNumber: string | null;
  taskDisciplineId: string;
  disciplineName: string;
  disciplineIndex: number | null;
  designPackageId: string | null;
  subtaskName: string | null;
  subtaskId: string | null;
  /** Package subtask index (padded in full code as 3 digits). */
  subtaskIndex: number | null;
  packageCode: string | null;
  roleLabel: string | null;
  /** DESIGNER/SUPPORTING_DESIGNER take priority; otherwise highest reviewer-tier role, else DISCIPLINE_OWNER. Null for DISCIPLINE_LEAD-kind items. */
  primaryRole: SubtaskRole | null;
  /** Highest reviewer-tier role also held, only set when primaryRole is DESIGNER or SUPPORTING_DESIGNER. */
  secondaryReviewRole: ReviewTier | null;
  projectedStatus: string | null;
  packageStatus: string | null;
  subtaskCount?: number;
}

export interface MyCommentItem {
  commentId: string;
  body: string;
  status: CommentStatus;
  severity: CommentSeverity | string;
  engineeringDocumentVersionId: string;
  documentVersionId: string;
  engineeringDocumentId: string;
  documentTitle: string;
  revisionLabel: string;
  projectId: string;
  projectName: string;
  taskDisciplineId: string;
  disciplineName: string;
  disciplineIndex: number | null;
  overseasTaskNumber: string | null;
  taskIdCode: string | null;
  subtaskId: string | null;
  packageCode: string | null;
  designPackageId: string;
  designPackageName: string;
  reviewSessionId: string;
  authorName: string;
  assigneeId: string;
  assigneeFirstName: string;
  assigneeLastName: string;
  createdBy: string;
  createdAt: string;
  commentInboxStatus: 'PENDING' | 'COMPLETED';
  /** True when this row belongs in the designer "Directed to me" queue. */
  isDirectedToMe: boolean;
  resolutionNote: string | null;
  verifiedAt: string | null;
  responseDocumentVersionId: string | null;
  responseDocumentTitle: string | null;
}

export interface ProjectStatusBoard {
  projectId: string;
  packagesByStatus: Record<string, number>;
  disciplinesByStatus: Record<string, number>;
  activeReviewSessions: number;
  slaOverdueSessions: number;
  openComments: number;
  pendingSubmittals: number;
}

export interface DispatcherWorkloadItem {
  userId: string;
  displayName: string;
  assignedReviewSessions: number;
  openComments: number;
  slaOverdue: number;
}

export interface CommentEdvSnapshot {
  engineeringDocumentVersionId: string;
  engineeringDocumentId: string;
  documentVersionId: string;
  documentTitle: string;
  revisionLabel: string;
}

export interface ReviewModeComment {
  id: string;
  body: string;
  status: CommentStatus;
  severity: CommentSeverity | string;
  reviewTier: ReviewTier | null;
  engineeringDocumentVersionId: string;
  createdBy: string;
  createdAt: string;
  assignedToUserId: string;
  authorName: string;
  assigneeName: string;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  verifiedAt?: string | null;
  commentedOn?: CommentEdvSnapshot;
  responseRevision?: CommentEdvSnapshot | null;
  /** Primary markup file (commentDocumentVersion FK) - backward compat. */
  attachment?: ReviewCommentAttachment | null;
  /** Response file attached when the comment was resolved (responseDocumentVersion FK). */
  responseAttachment?: ReviewCommentAttachment | null;
  /** Additional documents beyond the primary EDV FK. */
  documents?: readonly {
    engineeringDocumentVersionId: string;
    revisionLabel: string;
    documentTitle: string;
    documentNumber: string;
  }[];
  /** Additional attachment files beyond the primary commentDocumentVersion FK. */
  files?: readonly {
    id: string;
    documentVersionId: string;
    fileName: string;
    isResponseFile: boolean;
  }[];
}

export interface ReviewCommentAttachment {
  documentVersionId: string;
  name: string;
}

export interface ReviewCommentDetail {
  id: string;
  reviewSessionId: string;
  designPackageId: string;
  engineeringDocumentVersionId: string;
  body: string;
  severity: CommentSeverity | string;
  status: CommentStatus;
  createdBy: string;
  authorName: string;
  assignedToUserId: string;
  assigneeName: string;
  createdAt: string;
  updatedAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  commentedOn: CommentEdvSnapshot;
  responseRevision: CommentEdvSnapshot | null;
  attachment: ReviewCommentAttachment | null;
  responseAttachment: ReviewCommentAttachment | null;
  files?: readonly {
    id: string;
    documentVersionId: string;
    fileName: string;
    isResponseFile: boolean;
  }[];
}

export interface ReviewModeView {
  designPackageId: string;
  reviewSessionId: string | null;
  sessionStatus: ReviewSessionStatus | string | null;
  currentTier: ReviewTier | string | null;
  /** EDVs in this package (documents under review). */
  packageEdvIds: readonly string[];
  /** Frozen locked EDVs from upstream dependency packages at session open. */
  snapshotEdvIds: readonly string[];
  contentHash: string | null;
  comments: readonly ReviewModeComment[];
  /** Status-only comments from the most recent RETURNED_FOR_REWORK session (when no ACTIVE session). */
  lastReturnedSessionComments: readonly { status: CommentStatus | string }[];
  /** Full read-only context of the most recent RETURNED_FOR_REWORK session (when no ACTIVE session). */
  lastReturnedSession: {
    closedReason: string | null;
    closedAt: string | null;
    returnedByTier: ReviewTier | string;
    comments: readonly {
      body: string | null;
      reviewTier: ReviewTier | null;
      authorName: string;
      createdAt: string;
      severity: CommentSeverity | string;
    }[];
  } | null;
}

export interface ReviewContextSnapshot {
  snapshotId: string;
  capturedAt: string;
  contentHash: string | null;
  edvs: readonly {
    id: string;
    revisionLabel: string;
    status: string;
    engineeringDocumentName: string;
  }[];
}

export interface VersionHistoryEvent {
  action: string;
  phase: WorkflowEventPhase;
  createdAt: string;
}

export interface VersionHistoryEntry {
  engineeringDocumentVersionId: string;
  revisionLabel: string;
  status: EdvStatus | string;
  createdAt: string;
  loop: WorkflowLoop;
  documentVersionId: string;
  fileVersionNumber: number | null;
  fileName: string | null;
  events: readonly VersionHistoryEvent[];
}

export interface DecisionTraceEntry {
  id: string;
  entityType: WorkflowEntityType;
  entityId: string;
  engineeringDocumentVersionId: string | null;
  revisionLabel: string | null;
  action: string;
  phase: WorkflowEventPhase;
  actorId: string;
  actorName?: string | null;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  reason: string | null;
  correlationId: string | null;
  correctsEventId: string | null;
  createdAt: string;
  loop: WorkflowLoop;
}

export interface DecisionTraceView {
  engineeringDocumentId: string;
  taskDisciplineId: string;
  documentNumber: string | null;
  title: string;
  entries: readonly DecisionTraceEntry[];
}

export type WorkflowCommandType =
  | 'TransitionEdvStatus'
  | 'SubmitPackageForReview'
  | 'AddReviewComment'
  | 'TransitionCommentStatus'
  | 'VerifyReviewComment'
  | 'ApproveReviewSession'
  | 'ReturnPackageForRework'
  | 'BatchApproveEdvs'
  | 'BatchReturnEdvs'
  | 'LockPackageEdvs'
  | 'TriggerRevision'
  | 'CreateDesignSubmittal'
  | 'IssueSubmittal'
  | 'AddSubmittalItems';

export interface WorkflowResultSnapshot {
  commandType: WorkflowCommandType | string;
  correlationId: string;
  affectedEdvIds: readonly string[];
  edvStatuses: Readonly<Record<string, EdvStatus | string>>;
  packageProjectedStatus?: DesignPackageProjectedStatus;
  disciplineProjectedStatus?: TaskDisciplineProjectedStatus;
  reviewSessionId?: string;
  submittalId?: string;
  newEdvId?: string;
  intentEventIds: readonly string[];
  siteReviewStarted?: boolean;
  siteRepUserIds?: readonly string[];
  resultingStatus?: string;
}

// --- Request payloads ---

export interface RegisterEngineeringDocumentRequest {
  documentVersionId: string;
  documentType: EngineeringDocumentType;
  title: string;
  documentNumber?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateEngineeringDocumentRequest {
  title?: string;
  documentNumber?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadEngineeringDocumentVersionRequest {
  documentVersionId: string;
  revisionLabel?: string;
}

export interface ReplaceDraftVersionFileRequest {
  documentVersionId: string;
}

export interface UpdateEngineeringDocumentVersionRequest {
  revisionLabel?: string;
}

export interface TransitionEdvStatusRequest {
  targetStatus: EdvStatus;
  reason?: string;
  idempotencyKey?: string;
}

export interface CreateDesignPackageRequest {
  name: string;
  nameZh?: string;
  mainWorkContent?: string;
  plannedStartDate?: string;
  plannedFinishDate?: string;
  actualWorkDays?: number;
  urgencyLevel?: UrgencyLevel;
  reviewLevel?: ApprovalLevel;
  projectedStatus?: DesignPackageProjectedStatus;
  designerUserId?: string;
  reviewerUserId?: string;
  disciplinaryLeaderUserId?: string;
  deptDeputyChiefUserId?: string;
  instituteChiefUserId?: string;
  /** Set instead of instituteChiefUserId for an external person with no system account. Only one of the two may be set. */
  instituteChiefName?: string;
  disciplineOwnerUserId?: string;
  supportingDesignerUserId?: string;
  siteRepresentativeUserId?: string | null;
  siteRepType?: SiteRepType;
  siteRepName?: string | null;
  siteRepEmail?: string | null;
  siteRepPhone?: string | null;
  siteRepCompany?: string | null;
  consultantName?: string | null;
  consultantTitle?: string | null;
  consultantEmail?: string | null;
  consultantPhone?: string | null;
  consultantCompany?: string | null;
}

export type UpdateDesignPackageRequest = Partial<CreateDesignPackageRequest>;

export interface AddDesignPackageItemRequest {
  engineeringDocumentVersionId: string;
  sortOrder?: number;
}

export interface CreateDesignPackageDependencyRequest {
  dependsOnPackageId: string;
  dependencyType: DesignPackageDependencyType;
}

export interface SubmitPackageForReviewRequest {
  idempotencyKey?: string;
}

export interface LockPackageEdvsRequest {
  idempotencyKey?: string;
}

export interface ApproveReviewSessionRequest {
  idempotencyKey?: string;
  /** Required when approving the INSTITUTE_CHIEF tier on behalf of an external Institute Chief with no system account. */
  approvedOnBehalfOfName?: string;
}

export interface ReturnPackageForReworkCommentInput {
  engineeringDocumentVersionId: string;
  body?: string;
  severity: CommentSeverity;
  commentDocumentVersionId?: string;
  commentFileIds?: string[];
  assignedToUserId: string;
}

export interface ReturnPackageForReworkRequest {
  reviewSessionId: string;
  comments: ReturnPackageForReworkCommentInput[];
  idempotencyKey?: string;
}

export interface BatchApproveEdvsRequest {
  engineeringDocumentVersionIds: string[];
  reviewSessionId: string;
  idempotencyKey?: string;
}

export interface BatchReviewApproveRequest extends BatchApproveEdvsRequest {
  designPackageId: string;
}

export interface BatchLockPackagesRequest {
  designPackageIds: string[];
  idempotencyKey?: string;
}

export interface AddReviewCommentRequest {
  reviewSessionId: string;
  engineeringDocumentVersionId: string;
  body?: string;
  commentDocumentVersionId?: string;
  severity: CommentSeverity;
  assignedToUserId: string;
  idempotencyKey?: string;
}

export interface TransitionReviewCommentRequest {
  targetStatus: CommentStatus;
  resolutionNote?: string;
  responseDocumentVersionId?: string;
  additionalResponseDocumentVersionIds?: string[];
  idempotencyKey?: string;
}

export interface VerifyReviewCommentRequest {
  idempotencyKey?: string;
}

export interface UpdateReviewCommentRequest {
  engineeringDocumentVersionId: string;
  body: string;
  severity: CommentSeverity;
  assignedToUserId: string;
  commentDocumentVersionId?: string;
  idempotencyKey?: string;
}

export interface TriggerRevisionRequest {
  triggerSource: 'RFI' | 'CHANGE_REQUEST' | 'SUBMITTAL_REVIEW';
  triggerEntityId: string;
  idempotencyKey?: string;
}

export interface CreateDesignSubmittalRequest {
  category?: string;
  title: string;
  designPackageIds: string[];
  recipientName?: string;
  description?: string;
  contractor?: string;
  supplier?: string;
  specReference?: string;
  submittalPurpose?: import('@/lib/api/project-management.types').SubmittalPurpose;
  preparedByRole?: import('@/lib/api/project-management.types').SubmittalPreparedByRole;
  taskDisciplineId?: string;
  idempotencyKey?: string;
}

export interface IssueSubmittalRequest {
  idempotencyKey?: string;
}

export interface AddSubmittalItemsRequest {
  designPackageIds: string[];
  idempotencyKey?: string;
}

export interface BatchIssueSubmittalsRequest {
  submittalIds: string[];
  idempotencyKey?: string;
}

export interface BatchAddSubmittalItemsRequest {
  submittalIds: string[];
  designPackageIds: string[];
  idempotencyKey?: string;
}
