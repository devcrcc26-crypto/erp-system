import { EdvStatus } from './enums/edv-status.enum';
import { CommentStatus } from './enums/comment-status.enum';
import { DesignPackageProjectedStatus } from './enums/design-package-projected-status.enum';
import { TaskDisciplineProjectedStatus } from './enums/task-discipline-projected-status.enum';

export interface WorkflowCommandBase {
  readonly companyId: string;
  readonly actorId: string;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
}

/** Phase A + B - EDV status transition via write gate. */
export interface TransitionEdvStatusCommand extends WorkflowCommandBase {
  readonly type: 'TransitionEdvStatus';
  readonly engineeringDocumentVersionId: string;
  readonly targetStatus: EdvStatus;
  readonly reason?: string;
}

/** Phase A + B - open ReviewSession + ReviewContextSnapshot. */
export interface SubmitPackageForReviewCommand extends WorkflowCommandBase {
  readonly type: 'SubmitPackageForReview';
  readonly designPackageId: string;
  readonly taskDisciplineId: string;
}

/** Comment state machine - session-scoped. */
export interface AddReviewCommentCommand extends WorkflowCommandBase {
  readonly type: 'AddReviewComment';
  readonly reviewSessionId: string;
  readonly engineeringDocumentVersionId: string;
  readonly body?: string;
  readonly commentDocumentVersionId?: string;
  readonly severity: 'MINOR' | 'MODERATE' | 'MAJOR';
  readonly assignedToUserId: string;
}

export interface TransitionCommentStatusCommand extends WorkflowCommandBase {
  readonly type: 'TransitionCommentStatus';
  readonly reviewCommentId: string;
  readonly targetStatus: CommentStatus;
  readonly resolutionNote?: string;
  readonly responseDocumentVersionId?: string;
  readonly additionalResponseDocumentVersionIds?: readonly string[];
}

export interface VerifyReviewCommentCommand extends WorkflowCommandBase {
  readonly type: 'VerifyReviewComment';
  readonly reviewCommentId: string;
}

export interface RemoveReviewCommentCommand extends WorkflowCommandBase {
  readonly type: 'RemoveReviewComment';
  readonly reviewCommentId: string;
}

export interface UpdateReviewCommentCommand extends WorkflowCommandBase {
  readonly type: 'UpdateReviewComment';
  readonly reviewCommentId: string;
  readonly engineeringDocumentVersionId: string;
  readonly body?: string;
  readonly commentDocumentVersionId?: string;
  readonly severity: 'MINOR' | 'MODERATE' | 'MAJOR';
  readonly assignedToUserId: string;
}

export interface ApproveReviewSessionCommand extends WorkflowCommandBase {
  readonly type: 'ApproveReviewSession';
  readonly reviewSessionId: string;
  /** Required when the actor is the DEPT_CHIEF approving the INSTITUTE_CHIEF tier on behalf of an external Institute Chief with no system account. */
  readonly approvedOnBehalfOfName?: string;
}

export interface ReturnPackageForReworkCommentInput {
  readonly engineeringDocumentVersionId: string;
  readonly body?: string;
  readonly severity: 'MINOR' | 'MODERATE' | 'MAJOR';
  readonly commentDocumentVersionId?: string;
  readonly commentFileIds?: readonly string[];
  readonly assignedToUserId: string;
}

export interface ReturnPackageForReworkCommand extends WorkflowCommandBase {
  readonly type: 'ReturnPackageForRework';
  readonly designPackageId: string;
  readonly reviewSessionId: string;
  readonly comments: readonly ReturnPackageForReworkCommentInput[];
}

/** v1: one tx per package unit - all-or-nothing. */
export interface BatchApproveEdvsCommand extends WorkflowCommandBase {
  readonly type: 'BatchApproveEdvs';
  readonly designPackageId: string;
  readonly engineeringDocumentVersionIds: readonly string[];
  readonly reviewSessionId: string;
}

export interface BatchReturnEdvsCommand extends WorkflowCommandBase {
  readonly type: 'BatchReturnEdvs';
  readonly designPackageId: string;
  readonly engineeringDocumentVersionIds: readonly string[];
  readonly reviewSessionId: string;
  readonly commentTemplate: string;
}

/** Lock all EDVs in package after governance - TransitionEdvStatus(LOCKED) per EDV. */
export interface LockPackageEdvsCommand extends WorkflowCommandBase {
  readonly type: 'LockPackageEdvs';
  readonly designPackageId: string;
}

export interface CreateDesignSubmittalCommand extends WorkflowCommandBase {
  readonly type: 'CreateDesignSubmittal';
  readonly projectId: string;
  readonly designPackageIds: readonly string[];
  readonly submittalNumber: string;
  readonly title: string;
  readonly category: string;
  readonly contractor?: string;
  readonly supplier?: string;
  readonly specReference?: string;
  readonly submittalPurpose?: string;
  readonly preparedByRole?: string;
  readonly taskDisciplineId?: string;
}

export interface IssueSubmittalCommand extends WorkflowCommandBase {
  readonly type: 'IssueSubmittal';
  readonly submittalId: string;
}

export interface AddSubmittalItemsCommand extends WorkflowCommandBase {
  readonly type: 'AddSubmittalItems';
  readonly projectId: string;
  readonly submittalId: string;
  readonly designPackageIds: readonly string[];
}

/** External boundary trigger - creates internal revision loop. */
export interface TriggerRevisionCommand extends WorkflowCommandBase {
  readonly type: 'TriggerRevision';
  readonly engineeringDocumentId: string;
  readonly triggerSource: 'RFI' | 'ISSUE' | 'CHANGE_REQUEST' | 'SUBMITTAL_REVIEW';
  readonly triggerEntityId: string;
}

export type WorkflowCommand =
  | TransitionEdvStatusCommand
  | SubmitPackageForReviewCommand
  | AddReviewCommentCommand
  | TransitionCommentStatusCommand
  | VerifyReviewCommentCommand
  | RemoveReviewCommentCommand
  | UpdateReviewCommentCommand
  | ApproveReviewSessionCommand
  | ReturnPackageForReworkCommand
  | BatchApproveEdvsCommand
  | BatchReturnEdvsCommand
  | LockPackageEdvsCommand
  | CreateDesignSubmittalCommand
  | IssueSubmittalCommand
  | AddSubmittalItemsCommand
  | TriggerRevisionCommand;

export type WorkflowCommandType = WorkflowCommand['type'];

/** Commands that execute Phase A + Phase B in single transaction. */
export const PHASE_AB_COMMANDS: readonly WorkflowCommandType[] = [
  'TransitionEdvStatus',
  'SubmitPackageForReview',
  'BatchApproveEdvs',
  'LockPackageEdvs',
  'CreateDesignSubmittal',
  'IssueSubmittal',
  'TriggerRevision',
];

export interface WorkflowResultSnapshot {
  readonly commandType: WorkflowCommandType;
  readonly correlationId: string;
  readonly affectedEdvIds: readonly string[];
  readonly edvStatuses: Readonly<Record<string, EdvStatus>>;
  readonly packageProjectedStatus?: DesignPackageProjectedStatus;
  readonly disciplineProjectedStatus?: TaskDisciplineProjectedStatus;
  readonly reviewSessionId?: string;
  readonly submittalId?: string;
  readonly newEdvId?: string;
  readonly intentEventIds: readonly string[];
  /** Set when DRAFT issue routes to site review instead of SUBMITTED. */
  readonly siteReviewStarted?: boolean;
  readonly siteRepUserIds?: readonly string[];
  readonly resultingStatus?: string;
}

export interface WorkflowKernel {
  execute(command: WorkflowCommand): Promise<WorkflowResultSnapshot>;
}

export interface WorkflowUnitOfWork {
  runPhaseAB<T>(work: () => Promise<T>): Promise<T>;
}
