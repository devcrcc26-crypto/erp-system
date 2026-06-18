import { EpcWorkflowAction } from './contracts/enums/epc-workflow-action.enum';
import { ProjectDesignPhase } from './contracts/enums/project-design-phase.enum';
import { ProjectTeamRole } from './contracts/enums/project-team-role.enum';
import { EdvStatus } from './contracts/enums/edv-status.enum';
import { PermissionLayerVerdict } from './contracts/permission.model';
import {
  buildPermissionLayerResults,
  canPerformFromContext,
  evaluateDisciplineAssignmentLayer,
  evaluateProjectDesignPhaseLayer,
  evaluateSystemRoleLayer,
  evaluateWorkflowStateLayer,
} from './permission-context-builder';

const granted = new Set([EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT]);

function baseContext(
  overrides: Partial<Parameters<typeof canPerformFromContext>[0]> = {},
) {
  return {
    companyId: 'co-1',
    userId: 'designer-1',
    projectId: 'proj-1',
    action: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
    taskDisciplineId: 'td-1',
    projectTeamRole: ProjectTeamRole.OTHER,
    projectDesignPhase: ProjectDesignPhase.DETAILED_DESIGN,
    grantedActions: granted,
    disciplineDesignerUserId: 'designer-1',
    disciplineReviewerUserId: 'reviewer-1',
    disciplineLeadUserId: 'lead-1',
    disciplineChiefUserId: 'chief-1',
    ...overrides,
  };
}

describe('permission-context-builder', () => {
  describe('evaluateSystemRoleLayer', () => {
    it('DENY when action not in grantedActions', () => {
      const result = evaluateSystemRoleLayer(
        baseContext({ grantedActions: new Set() }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });

    it('ALLOW when action granted', () => {
      const result = evaluateSystemRoleLayer(baseContext());
      expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    });
  });

  describe('evaluateProjectDesignPhaseLayer', () => {
    it('DENY submittal issue in PLANNING', () => {
      const result = evaluateProjectDesignPhaseLayer(
        baseContext({
          action: EpcWorkflowAction.SUBMITTAL_ISSUE,
          projectDesignPhase: ProjectDesignPhase.PLANNING,
          projectTeamRole: ProjectTeamRole.DEPUTY_CHIEF,
          grantedActions: new Set([EpcWorkflowAction.SUBMITTAL_ISSUE]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });

    it('DENY upload in CLOSEOUT', () => {
      const result = evaluateProjectDesignPhaseLayer(
        baseContext({
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          projectDesignPhase: ProjectDesignPhase.CLOSEOUT,
          grantedActions: new Set([
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          ]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });
  });

  describe('evaluateDisciplineAssignmentLayer', () => {
    it('DENY submit when user is not designer', () => {
      const result = evaluateDisciplineAssignmentLayer(
        baseContext({ userId: 'other-user' }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });

    it('ALLOW lock for discipline chief', () => {
      const result = evaluateDisciplineAssignmentLayer(
        baseContext({
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
          userId: 'chief-1',
          grantedActions: new Set([
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
          ]),
          edvStatus: EdvStatus.APPROVED,
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    });
  });

  describe('evaluateWorkflowStateLayer', () => {
    it('DENY lock when EDV not APPROVED', () => {
      const result = evaluateWorkflowStateLayer(
        baseContext({
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
          userId: 'chief-1',
          edvStatus: EdvStatus.IN_REVIEW,
          grantedActions: new Set([
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
          ]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });

    it('DENY comment assign on LOCKED EDV', () => {
      const result = evaluateWorkflowStateLayer(
        baseContext({
          action: EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
          userId: 'reviewer-1',
          edvStatus: EdvStatus.LOCKED,
          grantedActions: new Set([EpcWorkflowAction.REVIEW_COMMENT_ASSIGN]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });
  });

  describe('buildPermissionLayerResults', () => {
    it('returns five layers', () => {
      expect(buildPermissionLayerResults(baseContext())).toHaveLength(5);
    });
  });

  describe('canPerformFromContext', () => {
    it('returns true for fully allowed designer submit', () => {
      expect(canPerformFromContext(baseContext())).toBe(true);
    });

    it('returns false when any layer DENY (deny-wins)', () => {
      expect(
        canPerformFromContext(
          baseContext({ disciplineDesignerUserId: 'other-user' }),
        ),
      ).toBe(false);
    });

    it('returns false for tier action without assignee match', () => {
      expect(
        canPerformFromContext(
          baseContext({
            action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
            userId: 'reviewer-1',
            grantedActions: new Set([EpcWorkflowAction.REVIEW_SESSION_APPROVE]),
            currentAssigneeUserId: 'lead-1',
          }),
        ),
      ).toBe(false);
    });

    it('returns true for tier action with assignee match', () => {
      expect(
        canPerformFromContext(
          baseContext({
            action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
            userId: 'reviewer-1',
            grantedActions: new Set([EpcWorkflowAction.REVIEW_SESSION_APPROVE]),
            currentAssigneeUserId: 'reviewer-1',
          }),
        ),
      ).toBe(true);
    });
  });
});
