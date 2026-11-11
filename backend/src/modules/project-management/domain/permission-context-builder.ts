import { EpcWorkflowAction } from './contracts/enums/epc-workflow-action.enum';
import { ProjectDesignStage } from './contracts/enums/project-design-stage.enum';
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

export type PermissionContextInput = PermissionContext;

function resolveEffectiveChain(input: PermissionContextInput) {
  return getEffectiveApprovalChain(
    {
      designerUserId: input.subtaskDesignerUserId ?? null,
      supportingDesignerUserId: input.subtaskSupportingDesignerUserId ?? null,
      disciplineOwnerUserId: input.subtaskDisciplineOwnerUserId ?? null,
      reviewerUserId: input.subtaskReviewerUserId ?? null,
      disciplinaryLeaderUserId: input.subtaskDisciplinaryLeaderUserId ?? null,
      deptDeputyChiefUserId: input.subtaskDeptDeputyChiefUserId ?? null,
      instituteChiefUserId: input.subtaskInstituteChiefUserId ?? null,
      instituteChiefName: input.subtaskInstituteChiefName ?? null,
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

/** Task-discipline assignees retain access even when subtask roles are reassigned. */
function userMatchesDesigner(
  userId: string,
  chain: ReturnType<typeof resolveEffectiveChain>,
  input: PermissionContextInput,
): boolean {
  return (
    userId === chain.designerUserId || userId === input.disciplineDesignerUserId
  );
}

function userMatchesSupportingDesigner(
  userId: string,
  chain: ReturnType<typeof resolveEffectiveChain>,
  input: PermissionContextInput,
): boolean {
  return (
    userId === chain.supportingDesignerUserId ||
    userId === input.disciplineSupportingDesignerUserId
  );
}

function userMatchesReviewer(
  userId: string,
  chain: ReturnType<typeof resolveEffectiveChain>,
  input: PermissionContextInput,
): boolean {
  return (
    userId === chain.reviewerUserId || userId === input.disciplineReviewerUserId
  );
}

function userMatchesDisciplineLead(
  userId: string,
  chain: ReturnType<typeof resolveEffectiveChain>,
  input: PermissionContextInput,
): boolean {
  return (
    userId === chain.disciplineLeadUserId || userId === input.disciplineLeadUserId
  );
}

function userMatchesChief(
  userId: string,
  chain: ReturnType<typeof resolveEffectiveChain>,
  input: PermissionContextInput,
): boolean {
  return userId === chain.chiefUserId || userId === input.disciplineChiefUserId;
}

function userMatchesOwner(
  userId: string,
  chain: ReturnType<typeof resolveEffectiveChain>,
  input: PermissionContextInput,
): boolean {
  return (
    userId === chain.ownerUserId || userId === input.disciplineOwnerUserId
  );
}

function userMatchesInstituteChief(
  userId: string,
  chain: ReturnType<typeof resolveEffectiveChain>,
  input: PermissionContextInput,
): boolean {
  return (
    userId === chain.instituteChiefUserId ||
    userId === input.disciplineInstituteChiefUserId
  );
}

function userMatchesSiteRepresentative(
  userId: string,
  input: PermissionContextInput,
): boolean {
  return userId === input.subtaskSiteRepresentativeUserId;
}

const DISCIPLINE_SCOPED_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UNLOCK,
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
  EpcWorkflowAction.SUBMITTAL_CREATE,
  EpcWorkflowAction.SUBMITTAL_ISSUE,
]);

/** Any FK role on the subtask/discipline may create or issue a submittal for it. */
const SUBMITTAL_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.SUBMITTAL_CREATE,
  EpcWorkflowAction.SUBMITTAL_ISSUE,
]);

/** Stage gates - action denied when project is in a locked design stage. */
const STAGE_LOCKED_ACTIONS: Readonly<
  Partial<Record<EpcWorkflowAction, readonly ProjectDesignStage[]>>
> = {
  // External releases / submittals: blocked in TENDER only.
  [EpcWorkflowAction.SUBMITTAL_ISSUE]: [ProjectDesignStage.TENDER],
  [EpcWorkflowAction.SUBMITTAL_CREATE]: [ProjectDesignStage.TENDER],
  [EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD]: [
    ProjectDesignStage.AS_BUILT_DRAWINGS,
  ],
  [EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER]: [
    ProjectDesignStage.AS_BUILT_DRAWINGS,
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

/** Primary designer only - supporting designer cannot submit or progress comments. */
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

/** Discipline leader locks/unlocks EDVs after the approval chain completes. */
const DISCIPLINE_LEAD_LOCK_ACTIONS: ReadonlySet<EpcWorkflowAction> = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UNLOCK,
]);

function isDisciplineAssignee(input: PermissionContextInput): boolean {
  const { userId } = input;
  const chain = resolveEffectiveChain(input);
  return (
    userMatchesDesigner(userId, chain, input) ||
    userMatchesSupportingDesigner(userId, chain, input) ||
    userMatchesOwner(userId, chain, input) ||
    userMatchesReviewer(userId, chain, input) ||
    userMatchesDisciplineLead(userId, chain, input) ||
    userMatchesChief(userId, chain, input) ||
    userMatchesInstituteChief(userId, chain, input)
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
 * Layer 2 - legacy project-team slot.
 * Access is authorized by discipline/subtask assignee FKs (and system role),
 * never by ProjectTeam membership.
 */
export function evaluateProjectTeamLayer(
  _input: PermissionContextInput,
): PermissionLayerResult {
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
  if (!DISCIPLINE_SCOPED_ACTIONS.has(input.action)) {
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: PermissionLayerVerdict.ALLOW,
    };
  }

  // Full-access company roles may act without discipline/subtask FK assignment.
  // Stage and workflow-state layers still apply.
  if (input.hasFullProjectAccess) {
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
    const chain = resolveEffectiveChain(input);
    const isPrimary = userMatchesDesigner(userId, chain, input);
    const isSupporting = userMatchesSupportingDesigner(userId, chain, input);
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
    const chain = resolveEffectiveChain(input);
    const isPrimary = userMatchesDesigner(userId, chain, input);
    const isSupporting = userMatchesSupportingDesigner(userId, chain, input);
    const match = isPrimary || isSupporting;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not a discipline designer',
    };
  }

  if (DESIGNER_SUBMIT_ACTIONS.has(action)) {
    const chain = resolveEffectiveChain(input);
    const match = userMatchesDesigner(userId, chain, input);
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not the primary discipline designer',
    };
  }

  if (SUBMITTAL_ACTIONS.has(action)) {
    const chain = resolveEffectiveChain(input);
    const match =
      userMatchesDesigner(userId, chain, input) ||
      userMatchesSupportingDesigner(userId, chain, input) ||
      userMatchesReviewer(userId, chain, input) ||
      userMatchesDisciplineLead(userId, chain, input) ||
      userMatchesChief(userId, chain, input) ||
      userMatchesInstituteChief(userId, chain, input) ||
      userMatchesSiteRepresentative(userId, input);
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not assigned to this discipline or subtask',
    };
  }

  if (DISCIPLINE_LEAD_LOCK_ACTIONS.has(action)) {
    const chain = resolveEffectiveChain(input);
    const match = userMatchesDisciplineLead(userId, chain, input);
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not the discipline leader',
    };
  }

  if (REVIEW_TIER_ACTIONS.has(action)) {
    const chain = resolveEffectiveChain(input);
    const isOwner = userMatchesOwner(userId, chain, input);
    const isReviewer = userMatchesReviewer(userId, chain, input);
    const isLead = userMatchesDisciplineLead(userId, chain, input);
    const isChief = userMatchesChief(userId, chain, input);
    const isInstituteChief = userMatchesInstituteChief(userId, chain, input);
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
 * Layer 4 - project design stage gates.
 */
export function evaluateProjectDesignStageLayer(
  input: PermissionContextInput,
): PermissionLayerResult {
  const stage = input.projectDesignStage;
  if (stage === undefined) {
    return {
      layer: PermissionLayerId.PROJECT_DESIGN_STAGE,
      verdict: PermissionLayerVerdict.DENY,
      reason: 'Project design stage unknown',
    };
  }

  const lockedStages = STAGE_LOCKED_ACTIONS[input.action];
  if (lockedStages !== undefined && lockedStages.includes(stage)) {
    return {
      layer: PermissionLayerId.PROJECT_DESIGN_STAGE,
      verdict: PermissionLayerVerdict.DENY,
      reason: `Action blocked in stage ${stage}`,
    };
  }

  return {
    layer: PermissionLayerId.PROJECT_DESIGN_STAGE,
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
    evaluateProjectDesignStageLayer(input),
    evaluateWorkflowStateLayer(input),
  ];
}

/**
 * Full deterministic permission check - layers + assignee override.
 */
export function canPerformFromContext(input: PermissionContextInput): boolean {
  const results = buildPermissionLayerResults(input);
  const layerAllowed = evaluatePermissionLayers(results);
  if (!layerAllowed) {
    return false;
  }
  return evaluateAssigneeOverride(
    input.action,
    input.userId,
    input.currentAssigneeUserId,
  );
}
