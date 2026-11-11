import {
  evaluateAssigneeOverride,
  evaluatePermissionLayers,
  requiresAssigneeMatch,
} from './permission-evaluator';
import {
  PermissionLayerId,
  PermissionLayerResult,
  PermissionLayerVerdict,
} from './permission.model';
import { EpcWorkflowAction } from './enums/epc-workflow-action.enum';

function layerResult(
  layer: PermissionLayerId,
  verdict: PermissionLayerVerdict,
): PermissionLayerResult {
  return { layer, verdict };
}

const allAllow: PermissionLayerResult[] = [
  layerResult(PermissionLayerId.SYSTEM_ROLE, PermissionLayerVerdict.ALLOW),
  layerResult(
    PermissionLayerId.PROJECT_TEAM_ROLE,
    PermissionLayerVerdict.ALLOW,
  ),
  layerResult(
    PermissionLayerId.DISCIPLINE_ASSIGNMENT,
    PermissionLayerVerdict.ALLOW,
  ),
  layerResult(
    PermissionLayerId.PROJECT_DESIGN_STAGE,
    PermissionLayerVerdict.ALLOW,
  ),
  layerResult(PermissionLayerId.WORKFLOW_STATE, PermissionLayerVerdict.ALLOW),
];

describe('permission-evaluator (deny-wins contract)', () => {
  describe('evaluatePermissionLayers', () => {
    it('returns false when any layer returns DENY', () => {
      const withDeny = allAllow.map((r) =>
        r.layer === PermissionLayerId.WORKFLOW_STATE
          ? layerResult(r.layer, PermissionLayerVerdict.DENY)
          : r,
      );

      expect(evaluatePermissionLayers(withDeny)).toBe(false);
    });

    it('returns false when first layer returns DENY (short-circuit)', () => {
      const denyAtSystem = [
        layerResult(PermissionLayerId.SYSTEM_ROLE, PermissionLayerVerdict.DENY),
        layerResult(
          PermissionLayerId.PROJECT_TEAM_ROLE,
          PermissionLayerVerdict.ALLOW,
        ),
      ];

      expect(evaluatePermissionLayers(denyAtSystem)).toBe(false);
    });

    it('returns true only when all five layers return ALLOW', () => {
      expect(evaluatePermissionLayers(allAllow)).toBe(true);
    });

    it('returns false on default-deny when any layer is missing', () => {
      const missingWorkflowState = allAllow.filter(
        (r) => r.layer !== PermissionLayerId.WORKFLOW_STATE,
      );

      expect(evaluatePermissionLayers(missingWorkflowState)).toBe(false);
    });

    it('returns false when any layer ABSTAINs (not explicit ALLOW)', () => {
      const withAbstain = allAllow.map((r) =>
        r.layer === PermissionLayerId.DISCIPLINE_ASSIGNMENT
          ? layerResult(r.layer, PermissionLayerVerdict.ABSTAIN)
          : r,
      );

      expect(evaluatePermissionLayers(withAbstain)).toBe(false);
    });

    it('DENY wins over ALLOW on another layer', () => {
      const mixed = [
        layerResult(PermissionLayerId.SYSTEM_ROLE, PermissionLayerVerdict.ALLOW),
        layerResult(
          PermissionLayerId.PROJECT_TEAM_ROLE,
          PermissionLayerVerdict.DENY,
        ),
        layerResult(
          PermissionLayerId.DISCIPLINE_ASSIGNMENT,
          PermissionLayerVerdict.ALLOW,
        ),
        layerResult(
          PermissionLayerId.PROJECT_DESIGN_STAGE,
          PermissionLayerVerdict.ALLOW,
        ),
        layerResult(PermissionLayerId.WORKFLOW_STATE, PermissionLayerVerdict.ALLOW),
      ];

      expect(evaluatePermissionLayers(mixed)).toBe(false);
    });
  });

  describe('requiresAssigneeMatch', () => {
    it('requires assignee for tier approve actions', () => {
      expect(
        requiresAssigneeMatch(EpcWorkflowAction.REVIEW_SESSION_APPROVE),
      ).toBe(true);
      expect(requiresAssigneeMatch(EpcWorkflowAction.REVIEW_COMMENT_VERIFY)).toBe(
        true,
      );
    });

    it('does not require assignee for non-tier actions', () => {
      expect(
        requiresAssigneeMatch(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT),
      ).toBe(false);
    });
  });

  describe('evaluateAssigneeOverride', () => {
    it('blocks tier action when user is not current assignee', () => {
      expect(
        evaluateAssigneeOverride(
          EpcWorkflowAction.REVIEW_SESSION_APPROVE,
          'user-a',
          'user-b',
        ),
      ).toBe(false);
    });

    it('allows tier action when user matches assignee', () => {
      expect(
        evaluateAssigneeOverride(
          EpcWorkflowAction.REVIEW_SESSION_APPROVE,
          'user-a',
          'user-a',
        ),
      ).toBe(true);
    });

    it('denies tier action when session assignee is not set', () => {
      expect(
        evaluateAssigneeOverride(
          EpcWorkflowAction.REVIEW_SESSION_APPROVE,
          'user-a',
          undefined,
        ),
      ).toBe(false);
    });

    it('denies tier action when session has no assignee', () => {
      const tierActions = [
        EpcWorkflowAction.REVIEW_SESSION_APPROVE,
        EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
      ] as const;

      for (const action of tierActions) {
        expect(
          evaluateAssigneeOverride(action, 'user-a', undefined),
        ).toBe(false);
        expect(
          evaluateAssigneeOverride(
            action,
            'user-a',
            null as unknown as string | undefined,
          ),
        ).toBe(false);
      }
    });

    it('allows non-tier action regardless of assignee', () => {
      expect(
        evaluateAssigneeOverride(
          EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          'user-a',
          undefined,
        ),
      ).toBe(true);
    });
  });
});
