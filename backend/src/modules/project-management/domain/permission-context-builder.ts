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
import { getEffectiveApprovalChain } from './approval-chain.util';

export type PermissionContextInput = PermissionContext & {
  /** DEMO BYPASS — remove after demo */
  demoMemberBypass?: boolean;
};

// DEMO BYPASS — remove after demo
const DEMO_NON_REVIEW_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER,
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD,
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE,
  EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
  EpcWorkflowAction.REVISION_TRIGGER,
  EpcWorkflowAction.REVISION_TRIGGER_CREATE,
]);
// END DEMO BYPASS

function resolveEffectiveChain(input: PermissionContextInput) {
  return getEffectiveApprovalChain(
    {
      packageOwnerUserId: input.packageOwnerUserId ?? null,
      packageReviewerUserId: input.packageReviewerUserId ?? null,
      packageDisciplineLeadUserId: input.packageDisciplineLeadUserId ?? null,
      packageChiefUserId: input.packageChiefUserId ?? null,
      packageInstituteChiefUserId: input.packageInstituteChiefUserId ?? null,
    },
    {
      ownerUserId: input.disciplineOwnerUserId ?? null,
      reviewerUserId: input.disciplineReviewerUserId ?? null,
      disciplineLeadUserId: input.disciplineLeadUserId ?? null,
      chiefUserId: input.disciplineChiefUserId ?? null,
      instituteChiefUserId: input.disciplineInstituteChiefUserId ?? null,
      designerUserId: input.disciplineDesignerUserId ?? null,
      supportingDesignerUserId: input.disciplineSupportingDesignerUserId ?? null,
    },
  );
}

const DISCIPLINE_SCOPED_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
  EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
  EpcWorkflowAction.REVIEW_COMMENT_VERIFY,
  EpcWorkflowAction.REVIEW_COMMENT_ACKNOWLEDGE,
  EpcWorkflowAction.REVIEW_COMMENT_RESOLVE,
  EpcWorkflowAction.REVIEW_SESSION_APPROVE,
  EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
  EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN,
  EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD,
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE,
  EpcWorkflowAction.REVISION_TRIGGER,
  EpcWorkflowAction.REVISION_TRIGGER_CREATE,
]);

const PROJECT_TEAM_REQUIRED_ACTIONS: ReadonlySet<EpcWorkflowAction> =
  new Set([
    EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
    EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER,
    EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
    EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
    EpcWorkflowAction.REVIEW_COMMENT_VERIFY,
    EpcWorkflowAction.REVIEW_COMMENT_ACKNOWLEDGE,
    EpcWorkflowAction.REVIEW_COMMENT_RESOLVE,
    EpcWorkflowAction.REVIEW_SESSION_APPROVE,
    EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
    EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
    EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD,
    EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE,
    EpcWorkflowAction.SUBMITTAL_CREATE,
    EpcWorkflowAction.SUBMITTAL_ISSUE,
    EpcWorkflowAction.REVISION_TRIGGER,
    EpcWorkflowAction.REVISION_TRIGGER_CREATE,
  ]);

/** Phase gates - action denied when project is in a locked phase. */
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
  [EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER]: [
    ProjectDesignPhase.CLOSEOUT,
  ],
};

/** Primary or supporting designer may upload/register files and manage package items. */
const ENGINEERING_FILE_UPLOAD_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER,
]);

const DESIGN_PACKAGE_ITEM_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD,
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE,
]);

/** Primary designer only — supporting designer cannot submit or progress comments. */
const DESIGNER_SUBMIT_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
  EpcWorkflowAction.REVISION_TRIGGER,
  EpcWorkflowAction.REVISION_TRIGGER_CREATE,
  EpcWorkflowAction.REVIEW_COMMENT_ACKNOWLEDGE,
  EpcWorkflowAction.REVIEW_COMMENT_RESOLVE,
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

function isDisciplineAssignee(input: PermissionContextInput): boolean {
  const { userId } = input;
  const chain = resolveEffectiveChain(input);
  return (
    userId === chain.designerUserId ||
    userId === chain.supportingDesignerUserId ||
    userId === chain.ownerUserId ||
    userId === chain.reviewerUserId ||
    userId === chain.disciplineLeadUserId ||
    userId === chain.chiefUserId ||
    userId === chain.instituteChiefUserId
  );
}

/**
 * Layer 1 - system role action flags.
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
 * Layer 2 - project team membership.
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
 * Layer 3 - TaskDiscipline assignee FK match.
 */
export function evaluateDisciplineAssignmentLayer(
  input: PermissionContextInput,
): PermissionLayerResult {
  // DEMO BYPASS — remove after demo
  if (DEMO_NON_REVIEW_ACTIONS.has(input.action) && input.demoMemberBypass) {
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: PermissionLayerVerdict.ALLOW,
      reason: 'demo-member-bypass',
    };
  }
  // END DEMO BYPASS

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

  if (ENGINEERING_FILE_UPLOAD_ACTIONS.has(action)) {
    const isPrimary = userId === input.disciplineDesignerUserId;
    const isSupporting = userId === input.disciplineSupportingDesignerUserId;
    if (isPrimary || isSupporting) {
      return {
        layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
        verdict: PermissionLayerVerdict.ALLOW,
      };
    }

    if (input.isDocumentController && isDisciplineAssignee(input)) {
      return {
        layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
        verdict: PermissionLayerVerdict.ALLOW,
      };
    }

    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: PermissionLayerVerdict.DENY,
      reason: input.isDocumentController
        ? 'User is not assigned to this discipline'
        : 'User is not a discipline designer',
    };
  }

  if (DESIGN_PACKAGE_ITEM_ACTIONS.has(action)) {
    const isPrimary = userId === input.disciplineDesignerUserId;
    const isSupporting = userId === input.disciplineSupportingDesignerUserId;
    const match = isPrimary || isSupporting;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not a discipline designer',
    };
  }

  if (DESIGNER_SUBMIT_ACTIONS.has(action)) {
    const match = userId === input.disciplineDesignerUserId;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not the primary discipline designer',
    };
  }

  if (CHIEF_ACTIONS.has(action)) {
    const chain = resolveEffectiveChain(input);
    const match = userId === chain.chiefUserId;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not discipline chief',
    };
  }

  if (REVIEW_TIER_ACTIONS.has(action)) {
    const chain = resolveEffectiveChain(input);
    const isOwner = userId === chain.ownerUserId;
    const isReviewer = userId === chain.reviewerUserId;
    const isLead = userId === chain.disciplineLeadUserId;
    const isChief = userId === chain.chiefUserId;
    const isInstituteChief = userId === chain.instituteChiefUserId;
    const isSessionAssignee =
      input.currentAssigneeUserId !== undefined &&
      userId === input.currentAssigneeUserId;
    const match =
      isOwner || isReviewer || isLead || isChief || isInstituteChief || isSessionAssignee;
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
 * Layer 4 - project design phase gates.
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
 * Layer 5 - workflow state gates (EDV status).
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
 * Full deterministic permission check - layers + assignee override.
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
