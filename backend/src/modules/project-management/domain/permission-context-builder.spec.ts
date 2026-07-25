import { EpcWorkflowAction } from './contracts/enums/epc-workflow-action.enum';
import { ProjectDesignStage } from './contracts/enums/project-design-stage.enum';
import { ProjectTeamRole } from './contracts/enums/project-team-role.enum';
import { EdvStatus } from './contracts/enums/edv-status.enum';
import { PermissionLayerVerdict } from './contracts/permission.model';
import {
  buildPermissionLayerResults,
  canPerformFromContext,
  evaluateDisciplineAssignmentLayer,
  evaluateProjectDesignStageLayer,
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
    projectDesignStage: ProjectDesignStage.DETAILED_DESIGN_DD,
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

  describe('evaluateProjectDesignStageLayer', () => {
    it('DENY submittal issue in TENDER', () => {
      const result = evaluateProjectDesignStageLayer(
        baseContext({
          action: EpcWorkflowAction.SUBMITTAL_ISSUE,
          projectDesignStage: ProjectDesignStage.TENDER,
          projectTeamRole: ProjectTeamRole.DEPUTY_CHIEF,
          grantedActions: new Set([EpcWorkflowAction.SUBMITTAL_ISSUE]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });

    it('ALLOW submittal create in DETAILED_DESIGN_DD', () => {
      const result = evaluateProjectDesignStageLayer(
        baseContext({
          action: EpcWorkflowAction.SUBMITTAL_CREATE,
          projectDesignStage: ProjectDesignStage.DETAILED_DESIGN_DD,
          grantedActions: new Set([EpcWorkflowAction.SUBMITTAL_CREATE]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    });

    it('DENY upload in AS_BUILT_DRAWINGS', () => {
      const result = evaluateProjectDesignStageLayer(
        baseContext({
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          projectDesignStage: ProjectDesignStage.AS_BUILT_DRAWINGS,
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

    it('ALLOW lock for discipline leader', () => {
      const result = evaluateDisciplineAssignmentLayer(
        baseContext({
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
          userId: 'lead-1',
          grantedActions: new Set([
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
          ]),
          edvStatus: EdvStatus.APPROVED,
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    });

    it('DENY lock for discipline chief', () => {
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
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });

    it('ALLOW review tier for task discipline lead when subtask lead reassigned', () => {
      const result = evaluateDisciplineAssignmentLayer(
        baseContext({
          action: EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
          userId: 'lead-1',
          disciplineLeadUserId: 'lead-1',
          subtaskDisciplinaryLeaderUserId: 'other-lead',
          grantedActions: new Set([EpcWorkflowAction.REVIEW_COMMENT_ASSIGN]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    });

    it('ALLOW designer actions for task discipline designer when subtask designer reassigned', () => {
      const result = evaluateDisciplineAssignmentLayer(
        baseContext({
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          userId: 'designer-1',
          disciplineDesignerUserId: 'designer-1',
          subtaskDesignerUserId: 'other-designer',
          grantedActions: new Set([
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          ]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    });

    it('ALLOW submittal.create for full-access role without discipline FK', () => {
      const result = evaluateDisciplineAssignmentLayer(
        baseContext({
          action: EpcWorkflowAction.SUBMITTAL_CREATE,
          userId: 'sys-admin-1',
          disciplineDesignerUserId: 'designer-1',
          disciplineLeadUserId: 'lead-1',
          hasFullProjectAccess: true,
          grantedActions: new Set([EpcWorkflowAction.SUBMITTAL_CREATE]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.ALLOW);
    });

    it('DENY submittal.create without FK when not full-access', () => {
      const result = evaluateDisciplineAssignmentLayer(
        baseContext({
          action: EpcWorkflowAction.SUBMITTAL_CREATE,
          userId: 'sys-admin-1',
          disciplineDesignerUserId: 'designer-1',
          disciplineLeadUserId: 'lead-1',
          hasFullProjectAccess: false,
          grantedActions: new Set([EpcWorkflowAction.SUBMITTAL_CREATE]),
        }),
      );
      expect(result.verdict).toBe(PermissionLayerVerdict.DENY);
    });
  });

  describe('evaluateWorkflowStateLayer', () => {
    it('DENY lock when EDV not APPROVED', () => {
      const result = evaluateWorkflowStateLayer(
        baseContext({
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK,
          userId: 'lead-1',
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

    it('returns false for tier action when assignee is set but does not match', () => {
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

    it('allows review approve when user is discipline reviewer but not on project team', () => {
      expect(
        canPerformFromContext(
          baseContext({
            action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
            userId: 'reviewer-1',
            grantedActions: new Set([EpcWorkflowAction.REVIEW_SESSION_APPROVE]),
            projectTeamRole: undefined,
            currentAssigneeUserId: 'reviewer-1',
          }),
        ),
      ).toBe(true);
    });

    it('allows designer upload when assigned on subtask but not on project team', () => {
      expect(
        canPerformFromContext(
          baseContext({
            action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
            userId: 'designer-1',
            grantedActions: new Set([
              EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
            ]),
            projectTeamRole: undefined,
            subtaskDesignerUserId: 'designer-1',
          }),
        ),
      ).toBe(true);
    });

    it('allows batch approve when user is active session assignee', () => {
      expect(
        canPerformFromContext(
          baseContext({
            action: EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
            userId: 'reviewer-1',
            grantedActions: new Set([
              EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
            ]),
            disciplineReviewerUserId: undefined,
            currentAssigneeUserId: 'reviewer-1',
          }),
        ),
      ).toBe(true);
    });
  });
});
