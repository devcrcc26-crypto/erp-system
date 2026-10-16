import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EdvStatus } from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';
import { ProjectDesignStage } from '../../domain/contracts/enums/project-design-stage.enum';
import {
  buildPermissionLayerResults,
  canPerformFromContext,
} from '../../domain/permission-context-builder';
import {
  evaluateAssigneeOverride,
  evaluatePermissionLayers,
} from '../../domain/contracts/permission-evaluator';
import {
  PermissionLayerId,
  PermissionLayerVerdict,
} from '../../domain/contracts/permission.model';
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
  readonly designPackageId?: string;
}

export interface WorkflowActionPermissionInput {
  readonly companyId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly action: EpcWorkflowAction;
  readonly taskDisciplineId: string;
  readonly designPackageId?: string;
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
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Asserts user may perform EDV status transition - deny wins.
   */
  async assertEdvTransitionAllowed(
    input: EdvTransitionPermissionInput & {
      actionOverride?: EpcWorkflowAction;
    },
  ): Promise<void> {
    const action =
      input.actionOverride ??
      this.mapTransitionToAction(input.edv.status, input.targetStatus);

    const [grantedActions, roleNames] = await Promise.all([
      this.resolveGrantedActions(input.userId, input.companyId),
      this.permissionService.getUserRoleNames(input.userId, input.companyId),
    ]);

    const discipline = input.edv.engineeringDocument.taskDiscipline;
    const projectTeamRole = await this.epcWorkflowRepository.findProjectTeamRole(
      input.companyId,
      input.projectId,
      input.userId,
    );
    const projectDesignStage = await this.resolveProjectDesignStage(
      input.companyId,
      input.projectId,
    );

    const packageOverrides = input.designPackageId
      ? await this.resolvePackageApprovalOverrides(
          input.companyId,
          input.designPackageId,
        )
      : undefined;

    const allowed = canPerformFromContext({
      companyId: input.companyId,
      userId: input.userId,
      projectId: input.projectId,
      action,
      taskDisciplineId: discipline.id,
      designPackageId: input.designPackageId,
      engineeringDocumentVersionId: input.edv.id,
      edvStatus: input.edv.status as never,
      grantedActions,
      projectTeamRole: projectTeamRole as never,
      projectDesignStage,
      disciplineDesignerUserId: discipline.designerUserId ?? undefined,
      disciplineSupportingDesignerUserId:
        discipline.supportingDesignerUserId ?? undefined,
      disciplineReviewerUserId: discipline.reviewerUserId ?? undefined,
      disciplineLeadUserId: discipline.disciplineLeadUserId ?? undefined,
      disciplineChiefUserId: discipline.chiefUserId ?? undefined,
      disciplineOwnerUserId: discipline.ownerUserId ?? undefined,
      disciplineInstituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
      subtaskDesignerUserId: packageOverrides?.designerUserId,
      subtaskSupportingDesignerUserId: packageOverrides?.supportingDesignerUserId,
      subtaskDisciplineOwnerUserId: packageOverrides?.disciplineOwnerUserId,
      subtaskReviewerUserId: packageOverrides?.reviewerUserId,
      subtaskDisciplinaryLeaderUserId: packageOverrides?.disciplinaryLeaderUserId,
      subtaskDeptDeputyChiefUserId: packageOverrides?.deptDeputyChiefUserId,
      subtaskInstituteChiefUserId: packageOverrides?.instituteChiefUserId,
      subtaskInstituteChiefName: packageOverrides?.instituteChiefName,
      subtaskSiteRepresentativeUserId: packageOverrides?.siteRepresentativeUserId,
      isDocumentController: roleNames.includes('Document Controller'),
      hasFullProjectAccess: hasFullProjectDataAccess(roleNames),
      currentAssigneeUserId: input.currentAssigneeUserId,
    });

    if (!allowed) {
      throw new ForbiddenException(`Permission denied for action ${action}`);
    }
  }

  /**
   * Asserts user may perform a workflow action - deny wins.
   */
  async assertActionAllowed(input: WorkflowActionPermissionInput): Promise<void> {
    const [grantedActions, roleNames] = await Promise.all([
      this.resolveGrantedActions(input.userId, input.companyId),
      this.permissionService.getUserRoleNames(input.userId, input.companyId),
    ]);

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
    const projectDesignStage = await this.resolveProjectDesignStage(
      input.companyId,
      input.projectId,
    );

    const packageOverrides = input.designPackageId
      ? await this.resolvePackageApprovalOverrides(
          input.companyId,
          input.designPackageId,
        )
      : undefined;

    const context = {
      companyId: input.companyId,
      userId: input.userId,
      projectId: input.projectId,
      action: input.action,
      taskDisciplineId: input.taskDisciplineId,
      designPackageId: input.designPackageId,
      grantedActions,
      projectTeamRole: projectTeamRole as never,
      projectDesignStage,
      disciplineDesignerUserId: discipline.designerUserId ?? undefined,
      disciplineSupportingDesignerUserId:
        discipline.supportingDesignerUserId ?? undefined,
      disciplineReviewerUserId: discipline.reviewerUserId ?? undefined,
      disciplineLeadUserId: discipline.disciplineLeadUserId ?? undefined,
      disciplineChiefUserId: discipline.chiefUserId ?? undefined,
      disciplineOwnerUserId: discipline.ownerUserId ?? undefined,
      disciplineInstituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
      subtaskDesignerUserId: packageOverrides?.designerUserId,
      subtaskSupportingDesignerUserId: packageOverrides?.supportingDesignerUserId,
      subtaskDisciplineOwnerUserId: packageOverrides?.disciplineOwnerUserId,
      subtaskReviewerUserId: packageOverrides?.reviewerUserId,
      subtaskDisciplinaryLeaderUserId: packageOverrides?.disciplinaryLeaderUserId,
      subtaskDeptDeputyChiefUserId: packageOverrides?.deptDeputyChiefUserId,
      subtaskInstituteChiefUserId: packageOverrides?.instituteChiefUserId,
      subtaskInstituteChiefName: packageOverrides?.instituteChiefName,
      subtaskSiteRepresentativeUserId: packageOverrides?.siteRepresentativeUserId,
      isDocumentController: roleNames.includes('Document Controller'),
      hasFullProjectAccess: hasFullProjectDataAccess(roleNames),
      currentAssigneeUserId: input.currentAssigneeUserId,
    };

    const layerResults = buildPermissionLayerResults(context);
    if (!evaluatePermissionLayers(layerResults)) {
      const stageLayer = layerResults.find(
        (r) => r.layer === PermissionLayerId.PROJECT_DESIGN_STAGE,
      );
      if (stageLayer?.verdict === PermissionLayerVerdict.DENY) {
        throw new ForbiddenException({
          message:
            stageLayer.reason ??
            `Action blocked in stage ${projectDesignStage}`,
          error: 'PROJECT_STAGE_BLOCKED',
          details: { stage: projectDesignStage },
        });
      }
      throw new ForbiddenException(
        `Permission denied for action ${input.action}`,
      );
    }

    if (
      !evaluateAssigneeOverride(
        input.action,
        input.userId,
        input.currentAssigneeUserId,
      )
    ) {
      throw new ForbiddenException(
        `Permission denied for action ${input.action}`,
      );
    }
  }

  /**
   * Maps RBAC module flags to EPC workflow actions.
   * Assignee-gated designer actions are always granted at Layer 1 -
   * Layer 3 (discipline/subtask FKs) is the real gate for those.
   */
  async resolveGrantedActions(
    userId: string,
    companyId: string,
  ): Promise<ReadonlySet<EpcWorkflowAction>> {
    const [schedule, engineeringDocuments, designPackages] = await Promise.all([
      this.permissionService.getUserModulePermissions(userId, companyId, 'schedule'),
      this.permissionService.getUserModulePermissions(
        userId,
        companyId,
        'engineering_documents',
      ),
      this.permissionService.getUserModulePermissions(
        userId,
        companyId,
        'design_packages',
      ),
    ]);

    const granted = new Set<EpcWorkflowAction>();

    // FK-assigned designers (often Employee / Designer without schedule.*)
    // must clear system-role Layer 1; assignment Layer 3 still enforces scope.
    this.grantAssigneeScopedDesignerActions(granted);

    if (schedule.canCreate) {
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD);
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER_CREATE);
      granted.add(EpcWorkflowAction.SUBMITTAL_CREATE);
    }
    if (schedule.canEdit) {
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD);
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE);
      granted.add(EpcWorkflowAction.REVIEW_COMMENT_ASSIGN);
      granted.add(EpcWorkflowAction.REVIEW_COMMENT_ACKNOWLEDGE);
      granted.add(EpcWorkflowAction.REVIEW_COMMENT_RESOLVE);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER_CREATE);
      granted.add(EpcWorkflowAction.SUBMITTAL_CREATE);
    }
    if (schedule.canApprove) {
      this.grantReviewApprovalActions(granted);
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK);
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UNLOCK);
      granted.add(EpcWorkflowAction.SUBMITTAL_ISSUE);
    }

    if (engineeringDocuments.canCreate) {
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD);
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER);
    }

    if (designPackages.canCreate || designPackages.canEdit) {
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD);
      granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER);
      granted.add(EpcWorkflowAction.REVISION_TRIGGER_CREATE);
    }

    return granted;
  }

  /**
   * Actions that Layer 3 scopes to package/discipline assignee FKs.
   * Designer file actions + review-tier actions (approve/comment/verify/return).
   */
  private grantAssigneeScopedDesignerActions(
    granted: Set<EpcWorkflowAction>,
  ): void {
    granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD);
    granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER);
    granted.add(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT);
    granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD);
    granted.add(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE);
    granted.add(EpcWorkflowAction.REVISION_TRIGGER);
    granted.add(EpcWorkflowAction.REVISION_TRIGGER_CREATE);
    granted.add(EpcWorkflowAction.REVIEW_COMMENT_ACKNOWLEDGE);
    granted.add(EpcWorkflowAction.REVIEW_COMMENT_RESOLVE);
    // Reviewer / tier holders - Layer 3 enforces matching assignment
    granted.add(EpcWorkflowAction.REVIEW_COMMENT_ASSIGN);
    granted.add(EpcWorkflowAction.REVIEW_COMMENT_VERIFY);
    granted.add(EpcWorkflowAction.REVIEW_SESSION_APPROVE);
    granted.add(EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE);
    granted.add(EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN);
    // Discipline leader - Layer 3 enforces matching assignment
    granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_LOCK);
    granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UNLOCK);
    // Any FK role on the discipline/subtask - Layer 3 enforces matching assignment
    granted.add(EpcWorkflowAction.SUBMITTAL_CREATE);
    granted.add(EpcWorkflowAction.SUBMITTAL_ISSUE);
  }

  private grantReviewApprovalActions(
    granted: Set<EpcWorkflowAction>,
  ): void {
    granted.add(EpcWorkflowAction.REVIEW_SESSION_APPROVE);
    granted.add(EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE);
    granted.add(EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN);
    granted.add(EpcWorkflowAction.REVIEW_COMMENT_VERIFY);
  }

  /**
   * Loads the tenant-scoped project design stage used by workflow permission gates.
   */
  private async resolveProjectDesignStage(
    companyId: string,
    projectId: string,
  ): Promise<ProjectDesignStage> {
    const project = await this.prisma.project.findFirst({
      where: activeOnly({ id: projectId, companyId }),
      select: { designStage: true },
    });

    if (!project?.designStage) {
      throw new BadRequestException('Project design stage is not set.');
    }

    return project.designStage as ProjectDesignStage;
  }

  private mapTransitionToAction(
    from: EdvStatus,
    to: EdvStatus,
  ): EpcWorkflowAction {
    if (from === EdvStatus.LOCKED && to === EdvStatus.APPROVED) {
      return EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UNLOCK;
    }
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

  private async resolvePackageApprovalOverrides(
    companyId: string,
    designPackageId: string,
  ): Promise<{
    designerUserId?: string;
    supportingDesignerUserId?: string;
    disciplineOwnerUserId?: string;
    reviewerUserId?: string;
    disciplinaryLeaderUserId?: string;
    deptDeputyChiefUserId?: string;
    instituteChiefUserId?: string;
    instituteChiefName?: string;
    siteRepresentativeUserId?: string;
  }> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      select: {
        designerUserId: true,
        supportingDesignerUserId: true,
        disciplineOwnerUserId: true,
        reviewerUserId: true,
        disciplinaryLeaderUserId: true,
        deptDeputyChiefUserId: true,
        instituteChiefUserId: true,
        instituteChiefName: true,
        siteRepresentativeUserId: true,
      },
    });
    if (!pkg) {
      return {};
    }
    return {
      designerUserId: pkg.designerUserId ?? undefined,
      supportingDesignerUserId: pkg.supportingDesignerUserId ?? undefined,
      disciplineOwnerUserId: pkg.disciplineOwnerUserId ?? undefined,
      reviewerUserId: pkg.reviewerUserId ?? undefined,
      disciplinaryLeaderUserId: pkg.disciplinaryLeaderUserId ?? undefined,
      deptDeputyChiefUserId: pkg.deptDeputyChiefUserId ?? undefined,
      instituteChiefUserId: pkg.instituteChiefUserId ?? undefined,
      instituteChiefName: pkg.instituteChiefName ?? undefined,
      siteRepresentativeUserId: pkg.siteRepresentativeUserId ?? undefined,
    };
  }
}
