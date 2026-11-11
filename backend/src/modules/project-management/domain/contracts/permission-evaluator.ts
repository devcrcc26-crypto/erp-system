import { EpcWorkflowAction } from './enums/epc-workflow-action.enum';
import {
  PermissionLayerId,
  PermissionLayerResult,
  PermissionLayerVerdict,
  TIER_ACTIONS_REQUIRING_ASSIGNEE,
} from './permission.model';

/** Layer evaluation order - short-circuit on first DENY. */
export const PERMISSION_LAYER_ORDER: readonly PermissionLayerId[] = [
  PermissionLayerId.SYSTEM_ROLE,
  PermissionLayerId.PROJECT_TEAM_ROLE,
  PermissionLayerId.DISCIPLINE_ASSIGNMENT,
  PermissionLayerId.PROJECT_DESIGN_STAGE,
  PermissionLayerId.WORKFLOW_STATE,
];

/**
 * Pure deny-wins evaluator - contract algorithm for permission-resolver (Wave 0).
 * DENY on any layer → false.
 * All required layers ALLOW → true.
 * Otherwise → false (default-deny).
 */
export function evaluatePermissionLayers(
  layerResults: readonly PermissionLayerResult[],
): boolean {
  const resultByLayer = new Map(
    layerResults.map((r) => [r.layer, r.verdict] as const),
  );

  for (const layer of PERMISSION_LAYER_ORDER) {
    const verdict = resultByLayer.get(layer);
    if (verdict === PermissionLayerVerdict.DENY) {
      return false;
    }
  }

  const allAllow = PERMISSION_LAYER_ORDER.every(
    (layer) => resultByLayer.get(layer) === PermissionLayerVerdict.ALLOW,
  );

  return allAllow;
}

export function requiresAssigneeMatch(action: EpcWorkflowAction): boolean {
  return (TIER_ACTIONS_REQUIRING_ASSIGNEE as readonly EpcWorkflowAction[]).includes(
    action,
  );
}

export function evaluateAssigneeOverride(
  action: EpcWorkflowAction,
  userId: string,
  currentAssigneeUserId: string | undefined,
): boolean {
  if (!requiresAssigneeMatch(action)) {
    return true;
  }
  if (currentAssigneeUserId === undefined || currentAssigneeUserId === null) {
    return false;
  }
  return userId === currentAssigneeUserId;
}
