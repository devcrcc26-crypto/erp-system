import { ForbiddenException, Injectable } from '@nestjs/common';
import { EdvStatus } from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';
import { ProjectDesignPhase } from '../../domain/contracts/enums/project-design-phase.enum';
import { canPerformFromContext } from '../../domain/permission-context-builder';
import {
  EdvWithDiscipline,
  EpcWorkflowRepository,
} from '../../infrastructure/repositories/epc-workflow.repository';

export interface EdvTransitionPermissionInput {
  readonly companyId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly edv: EdvWithDiscipline;
  readonly targetStatus: EdvStatus;
  readonly currentAssigneeUserId?: string;
}

export interface WorkflowActionPermissionInput {
  readonly companyId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly action: EpcWorkflowAction;
  readonly taskDisciplineId: string;
  readonly currentAssigneeUserId?: string;
}

/**
 * Resolves EPC action-level permissions for workflow mutations.
 */
@Injectable()
export class PermissionResolverService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
  ) {}

  /**
   * Asserts user may perform EDV status transition — deny wins.
   */
  async assertEdvTransitionAllowed(
    input: EdvTransitionPermissionInput & {
      actionOverride?: EpcWorkflowAction;
    },
  ): Promise<void> {
    const action =
      input.actionOverride ??
      this.mapTransitionToAction(input.edv.status, input.targetStatus);
    const grantedActions = await this.resolveGrantedActions(
      input.userId,
      input.companyId,
    );

    const discipline = input.edv.engineeringDocument.taskDiscipline;
    const projectTeamRole = await this.epcWorkflowRepository.findProjectTeamRole(
      input.companyId,
      input.projectId,
      input.userId,
    );

    const allowed = canPerformFromContext({
      companyId: input.companyId,
      userId: input.userId,
      projectId: input.projectId,
      action,
      taskDisciplineId: discipline.id,
      engineeringDocumentVersionId: input.edv.id,
      edvStatus: input.edv.status as never,
      grantedActions,
      projectTeamRole: projectTeamRole as never,
      projectDesignPhase: ProjectDesignPhase.DETAILED_DESIGN,
      disciplineDesignerUserId: discipline.designerUserId ?? undefined,
      disciplineReviewerUserId: discipline.reviewerUserId ?? undefined,
      disciplineLeadUserId: discipline.disciplineLeadUserId ?? undefined,
      disciplineChiefUserId: discipline.chiefUserId ?? undefined,
      disciplineOwnerUserId: discipline.ownerUserId ?? undefined,
      currentAssigneeUserId: input.currentAssigneeUserId,
    });

    if (!allowed) {
      throw new ForbiddenException(`Permission denied for action ${action}`);
    }
  }

  /**
   * Asserts user may perform a workflow action — deny wins.
   */
  async assertActionAllowed(input: WorkflowActionPermissionInput): Promise<void> {
    const grantedActions = await this.resolveGrantedActions(
      input.userId,
      input.companyId,
    );

    const discipline = await this.epcWorkflowRepository.findTaskDisciplineContext(
      input.companyId,
      input.taskDisciplineId,
    );
    if (!discipline) {
      throw new ForbiddenException('Task discipline not found');
    }

    const projectTeamRole = await this.epcWorkflowRepository.findProjectTeamRole(
      input.companyId,
      input.projectId,
      input.userId,
    );

    const allowed = canPerformFromContext({
      companyId: input.companyId,
      userId: input.userId,
      projectId: input.projectId,
      action: input.action,
      taskDisciplineId: input.taskDisciplineId,
      grantedActions,
      projectTeamRole: projectTeamRole as never,
      projectDesignPhase: ProjectDesignPhase.DETAILED_DESIGN,
      disciplineDesignerUserId: discipline.designerUserId ?? undefined,
      disciplineReviewerUserId: discipline.reviewerUserId ?? undefined,
      disciplineLeadUserId: discipline.disciplineLeadUserId ?? undefined,
      disciplineChiefUserId: discipline.chiefUserId ?? undefined,
      disciplineOwnerUserId: discipline.ownerUserId ?? undefined,
      currentAssigneeUserId: input.currentAssigneeUserId,
    });

    if (!allowed) {
      throw new ForbiddenException(`Permission denied for action ${input.action}`);
    }
  }

  /**
   * Maps schedule module RBAC to EPC workflow actions until dedicated seed exists.
   */
  async resolveGrantedActions(
    userId: string,
    companyId: string,
  ): Promise<ReadonlySet<EpcWorkflowAction>> {
    const schedule = await this.permissionService.getUserModulePermissions(
      userId,
      companyId,
      'schedule',
    );

    const granted = new Set<EpcWorkflowAction>();

    if (schedule.canCreate) {
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER);
    }
    if (schedule.canEdit) {
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT);
      granted.add(EpcWorkflowAction.REVIEW_COMMENT_ASSIGN);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER);
    }
    if (schedule.canApprove) {
      this.grantReviewGovernanceActions(granted);
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK);
    }

    // Review governance is enforced by discipline/session assignment layers.
    // Anyone with schedule read access may attempt review actions; non-reviewers are denied downstream.
    if (schedule.canView) {
      this.grantReviewGovernanceActions(granted);
    }

    return granted;
  }

  private grantReviewGovernanceActions(
    granted: Set<EpcWorkflowAction>,
  ): void {
    granted.add(EpcWorkflowAction.REVIEW_SESSION_APPROVE);
    granted.add(EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE);
    granted.add(EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN);
    granted.add(EpcWorkflowAction.REVIEW_COMMENT_VERIFY);
    granted.add(EpcWorkflowAction.REVIEW_COMMENT_ASSIGN);
  }

  private mapTransitionToAction(
    from: EdvStatus,
    to: EdvStatus,
  ): EpcWorkflowAction {
    if (to === EdvStatus.LOCKED) {
      return EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK;
    }
    if (to === EdvStatus.APPROVED) {
      return EpcWorkflowAction.REVIEW_SESSION_APPROVE;
    }
    if (to === EdvStatus.IN_REVIEW) {
      return EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT;
    }
    if (to === EdvStatus.DRAFT) {
      return EpcWorkflowAction.REVISION_TRIGGER;
    }
    if (to === EdvStatus.SUPERSEDED) {
      return EpcWorkflowAction.REVISION_TRIGGER;
    }
    return EpcWorkflowAction.REVISION_TRIGGER;
  }
}
