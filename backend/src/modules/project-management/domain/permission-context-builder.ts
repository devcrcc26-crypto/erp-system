import { EpcWorkflowAction } from './contracts/enums/epc-workflow-action.enum';
import { ProjectDesignPhase } from './contracts/enums/project-design-phase.enum';
import { ProjectTeamRole } from './contracts/enums/project-team-role.enum';
import { EdvStatus } from './contracts/enums/edv-status.enum';
import {
  PermissionContext,
  PermissionLayerId,
  PermissionLayerResult,
  PermissionLayerVerdict,
  WORKFLOW_STATE_ACTION_GATES,
} from './contracts/permission.model';
import {
  evaluateAssigneeOverride,
  evaluatePermissionLayers,
} from './contracts/permission-evaluator';
import { edvStatusAllowsComments } from './edv-state-machine';

export type PermissionContextInput = PermissionContext;

const DISCIPLINE_SCOPED_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
  EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
  EpcWorkflowAction.REVIEW_COMMENT_VERIFY,
  EpcWorkflowAction.REVIEW_SESSION_APPROVE,
  EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
  EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN,
  EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
  EpcWorkflowAction.REVISION_TRIGGER,
]);

const PROJECT_TEAM_REQUIRED_ACTIONS: ReadonlySet<EpcWorkflowAction> =
  new Set([
    EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
    EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
    EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
    EpcWorkflowAction.REVIEW_COMMENT_VERIFY,
    EpcWorkflowAction.REVIEW_SESSION_APPROVE,
    EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
    EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
    EpcWorkflowAction.SUBMITTAL_CREATE,
    EpcWorkflowAction.SUBMITTAL_ISSUE,
    EpcWorkflowAction.REVISION_TRIGGER,
  ]);

/** Phase gates — action denied when project is in a locked phase. */
const PHASE_LOCKED_ACTIONS: Readonly<
  Partial<Record<EpcWorkflowAction, readonly ProjectDesignPhase[]>>
> = {
  [EpcWorkflowAction.SUBMITTAL_ISSUE]: [
    ProjectDesignPhase.INITIATION,
    ProjectDesignPhase.PLANNING,
    ProjectDesignPhase.CONCEPT_DESIGN,
    ProjectDesignPhase.SCHEMATIC,
    ProjectDesignPhase.DETAILED_DESIGN,
  ],
  [EpcWorkflowAction.SUBMITTAL_CREATE]: [
    ProjectDesignPhase.INITIATION,
    ProjectDesignPhase.PLANNING,
    ProjectDesignPhase.CONCEPT_DESIGN,
    ProjectDesignPhase.SCHEMATIC,
    ProjectDesignPhase.DETAILED_DESIGN,
  ],
  [EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD]: [
    ProjectDesignPhase.CLOSEOUT,
  ],
};

const DESIGNER_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
  EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
  EpcWorkflowAction.REVISION_TRIGGER,
]);

const REVIEW_TIER_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
  EpcWorkflowAction.REVIEW_COMMENT_VERIFY,
  EpcWorkflowAction.REVIEW_SESSION_APPROVE,
  EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
  EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN,
]);

const CHIEF_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
]);

/**
 * Layer 1 — system role action flags.
 */
export function evaluateSystemRoleLayer(
  input: PermissionContextInput,
): PermissionLayerResult {
  const granted = input.grantedActions?.has(input.action) ?? false;
  return {
    layer: PermissionLayerId.SYSTEM_ROLE,
    verdict: granted ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
    reason: granted ? undefined : 'Action not granted by system role',
  };
}

/**
 * Layer 2 — project team membership.
 */
export function evaluateProjectTeamLayer(
  input: PermissionContextInput,
): PermissionLayerResult {
  if (!PROJECT_TEAM_REQUIRED_ACTIONS.has(input.action)) {
    return {
      layer: PermissionLayerId.PROJECT_TEAM_ROLE,
      verdict: PermissionLayerVerdict.ALLOW,
    };
  }

  // Review governance is authorized via discipline reviewer/lead/chief FKs.
  if (REVIEW_TIER_ACTIONS.has(input.action)) {
    return {
      layer: PermissionLayerId.PROJECT_TEAM_ROLE,
      verdict: PermissionLayerVerdict.ALLOW,
    };
  }

  if (input.projectTeamRole === undefined) {
    return {
      layer: PermissionLayerId.PROJECT_TEAM_ROLE,
      verdict: PermissionLayerVerdict.DENY,
      reason: 'User is not on project team',
    };
  }

  if (
    input.action === EpcWorkflowAction.SUBMITTAL_CREATE ||
    input.action === EpcWorkflowAction.SUBMITTAL_ISSUE
  ) {
    return {
      layer: PermissionLayerId.PROJECT_TEAM_ROLE,
      verdict: PermissionLayerVerdict.ALLOW,
    };
  }

  return {
    layer: PermissionLayerId.PROJECT_TEAM_ROLE,
    verdict: PermissionLayerVerdict.ALLOW,
  };
}

/**
 * Layer 3 — TaskDiscipline assignee FK match.
 */
export function evaluateDisciplineAssignmentLayer(
  input: PermissionContextInput,
): PermissionLayerResult {
  if (!DISCIPLINE_SCOPED_ACTIONS.has(input.action)) {
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: PermissionLayerVerdict.ALLOW,
    };
  }

  if (input.taskDisciplineId === undefined) {
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: PermissionLayerVerdict.DENY,
      reason: 'Discipline context required',
    };
  }

  const { userId, action } = input;

  if (DESIGNER_ACTIONS.has(action)) {
    const match = userId === input.disciplineDesignerUserId;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not discipline designer',
    };
  }

  if (CHIEF_ACTIONS.has(action)) {
    const match = userId === input.disciplineChiefUserId;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not discipline chief',
    };
  }

  if (REVIEW_TIER_ACTIONS.has(action)) {
    const isOwner = userId === input.disciplineOwnerUserId;
    const isReviewer = userId === input.disciplineReviewerUserId;
    const isLead = userId === input.disciplineLeadUserId;
    const isChief = userId === input.disciplineChiefUserId;
    const isSessionAssignee =
      input.currentAssigneeUserId !== undefined &&
      userId === input.currentAssigneeUserId;
    const match =
      isOwner || isReviewer || isLead || isChief || isSessionAssignee;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not assigned review tier',
    };
  }

  return {
    layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
    verdict: PermissionLayerVerdict.ALLOW,
  };
}

/**
 * Layer 4 — project design phase gates.
 */
export function evaluateProjectDesignPhaseLayer(
  input: PermissionContextInput,
): PermissionLayerResult {
  const phase = input.projectDesignPhase;
  if (phase === undefined) {
    return {
      layer: PermissionLayerId.PROJECT_DESIGN_PHASE,
      verdict: PermissionLayerVerdict.DENY,
      reason: 'Project design phase unknown',
    };
  }

  const lockedPhases = PHASE_LOCKED_ACTIONS[input.action];
  if (lockedPhases !== undefined && lockedPhases.includes(phase)) {
    return {
      layer: PermissionLayerId.PROJECT_DESIGN_PHASE,
      verdict: PermissionLayerVerdict.DENY,
      reason: `Action blocked in phase ${phase}`,
    };
  }

  return {
    layer: PermissionLayerId.PROJECT_DESIGN_PHASE,
    verdict: PermissionLayerVerdict.ALLOW,
  };
}

/**
 * Layer 5 — workflow state gates (EDV status).
 */
export function evaluateWorkflowStateLayer(
  input: PermissionContextInput,
): PermissionLayerResult {
  const { action, edvStatus } = input;

  const requiredStatuses = WORKFLOW_STATE_ACTION_GATES[action];
  if (requiredStatuses !== undefined) {
    if (edvStatus === undefined) {
      return {
        layer: PermissionLayerId.WORKFLOW_STATE,
        verdict: PermissionLayerVerdict.DENY,
        reason: 'EDV status required for workflow gate',
      };
    }
    const allowed = requiredStatuses.includes(edvStatus);
    return {
      layer: PermissionLayerId.WORKFLOW_STATE,
      verdict: allowed ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: allowed
        ? undefined
        : `EDV status ${edvStatus} does not permit ${action}`,
    };
  }

  if (
    action === EpcWorkflowAction.REVIEW_COMMENT_ASSIGN &&
    edvStatus !== undefined &&
    !edvStatusAllowsComments(edvStatus)
  ) {
    return {
      layer: PermissionLayerId.WORKFLOW_STATE,
      verdict: PermissionLayerVerdict.DENY,
      reason: 'Comments forbidden on LOCKED or SUPERSEDED EDV',
    };
  }

  return {
    layer: PermissionLayerId.WORKFLOW_STATE,
    verdict: PermissionLayerVerdict.ALLOW,
  };
}

/**
 * Builds all five permission layer results from context input.
 */
export function buildPermissionLayerResults(
  input: PermissionContextInput,
): PermissionLayerResult[] {
  return [
    evaluateSystemRoleLayer(input),
    evaluateProjectTeamLayer(input),
    evaluateDisciplineAssignmentLayer(input),
    evaluateProjectDesignPhaseLayer(input),
    evaluateWorkflowStateLayer(input),
  ];
}

/**
 * Full deterministic permission check — layers + assignee override.
 */
export function canPerformFromContext(input: PermissionContextInput): boolean {
  const layerAllowed = evaluatePermissionLayers(
    buildPermissionLayerResults(input),
  );
  if (!layerAllowed) {
    return false;
  }
  return evaluateAssigneeOverride(
    input.action,
    input.userId,
    input.currentAssigneeUserId,
  );
}
