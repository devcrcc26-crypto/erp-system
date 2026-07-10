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

/** Stage gates — action denied when project is in a locked design stage. */
const STAGE_LOCKED_ACTIONS: Readonly<
  Partial<Record<EpcWorkflowAction, readonly ProjectDesignStage[]>>
> = {
  [EpcWorkflowAction.SUBMITTAL_ISSUE]: [
    ProjectDesignStage.TENDER,
    ProjectDesignStage.CONCEPT_DESIGN_CD,
    ProjectDesignStage.PRELIMINARY_DESIGN_PD,
    ProjectDesignStage.SCHEMATIC_DESIGN_SD,
    ProjectDesignStage.DETAILED_DESIGN_DD,
  ],
  [EpcWorkflowAction.SUBMITTAL_CREATE]: [
    ProjectDesignStage.TENDER,
    ProjectDesignStage.CONCEPT_DESIGN_CD,
    ProjectDesignStage.PRELIMINARY_DESIGN_PD,
    ProjectDesignStage.SCHEMATIC_DESIGN_SD,
    ProjectDesignStage.DETAILED_DESIGN_DD,
  ],
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
    const isPrimary = userId === chain.designerUserId;
    const isSupporting = userId === chain.supportingDesignerUserId;
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
    const isPrimary = userId === chain.designerUserId;
    const isSupporting = userId === chain.supportingDesignerUserId;
    const match = isPrimary || isSupporting;
    return {
      layer: PermissionLayerId.DISCIPLINE_ASSIGNMENT,
      verdict: match ? PermissionLayerVerdict.ALLOW : PermissionLayerVerdict.DENY,
      reason: match ? undefined : 'User is not a discipline designer',
    };
  }

  if (DESIGNER_SUBMIT_ACTIONS.has(action)) {
    const chain = resolveEffectiveChain(input);
    const match = userId === chain.designerUserId;
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
 * Layer 4 — project design stage gates.
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
