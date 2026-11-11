import { EpcWorkflowAction } from './enums/epc-workflow-action.enum';
import { ProjectDesignStage } from './enums/project-design-stage.enum';
import { ProjectTeamRole } from './enums/project-team-role.enum';
import { EdvStatus } from './enums/edv-status.enum';

export enum PermissionLayerVerdict {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  ABSTAIN = 'ABSTAIN',
}

export enum PermissionLayerId {
  SYSTEM_ROLE = 'SYSTEM_ROLE',
  PROJECT_TEAM_ROLE = 'PROJECT_TEAM_ROLE',
  DISCIPLINE_ASSIGNMENT = 'DISCIPLINE_ASSIGNMENT',
  PROJECT_DESIGN_STAGE = 'PROJECT_DESIGN_STAGE',
  WORKFLOW_STATE = 'WORKFLOW_STATE',
}

/** Per-layer evaluation result - evaluated in PermissionLayerId order. */
export interface PermissionLayerResult {
  readonly layer: PermissionLayerId;
  readonly verdict: PermissionLayerVerdict;
  readonly reason?: string;
}

export interface PermissionContext {
  readonly companyId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly action: EpcWorkflowAction;
  readonly taskDisciplineId?: string;
  readonly designPackageId?: string;
  readonly engineeringDocumentVersionId?: string;
  readonly reviewSessionId?: string;
  readonly currentAssigneeUserId?: string;
  readonly projectTeamRole?: ProjectTeamRole;
  readonly projectDesignStage?: ProjectDesignStage;
  readonly edvStatus?: EdvStatus;
  readonly grantedActions?: ReadonlySet<EpcWorkflowAction>;
  readonly disciplineDesignerUserId?: string;
  readonly disciplineSupportingDesignerUserId?: string;
  readonly disciplineOwnerUserId?: string;
  readonly disciplineReviewerUserId?: string;
  readonly disciplineLeadUserId?: string;
  readonly disciplineChiefUserId?: string;
  readonly disciplineInstituteChiefUserId?: string;
  readonly subtaskDesignerUserId?: string;
  readonly subtaskSupportingDesignerUserId?: string;
  readonly subtaskDisciplineOwnerUserId?: string;
  readonly subtaskReviewerUserId?: string;
  readonly subtaskDisciplinaryLeaderUserId?: string;
  readonly subtaskDeptDeputyChiefUserId?: string;
  readonly subtaskInstituteChiefUserId?: string;
  /** External Institute Chief name on the subtask - blocks discipline IC fallback. */
  readonly subtaskInstituteChiefName?: string;
  /** Site representative FK on the subtask - communication modules only (not engineering docs). */
  readonly subtaskSiteRepresentativeUserId?: string;
  /** System role Document Controller - logistics upload on assigned disciplines. */
  readonly isDocumentController?: boolean;
  /**
   * SysAdmin / Managing Director / Project Manager / Project Administrator -
   * bypasses discipline/subtask FK matching on Layer 3.
   */
  readonly hasFullProjectAccess?: boolean;
}

/**
 * Tier actions (approve, verify) require ctx.userId === currentAssigneeUserId
 * in addition to permission allow.
 */
export const TIER_ACTIONS_REQUIRING_ASSIGNEE: readonly EpcWorkflowAction[] = [
  EpcWorkflowAction.REVIEW_SESSION_APPROVE,
  EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
  EpcWorkflowAction.REVIEW_COMMENT_VERIFY,
];

/** Workflow-state gates - layer 5 examples (extended in Wave 0.5). */
export const WORKFLOW_STATE_ACTION_GATES: Readonly<
  Partial<Record<EpcWorkflowAction, readonly EdvStatus[]>>
> = {
  [EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK]: [
    EdvStatus.APPROVED,
  ],
  [EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UNLOCK]: [
    EdvStatus.LOCKED,
  ],
};

export interface PermissionResolverContract {
  canPerform(context: PermissionContext): Promise<boolean>;
}

export interface PermissionEvaluatorContract {
  evaluateLayerResults(layerResults: readonly PermissionLayerResult[]): boolean;
  requiresAssigneeMatch(action: EpcWorkflowAction): boolean;
}
