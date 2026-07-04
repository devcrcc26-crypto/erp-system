import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EdvStatus } from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';

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
import { ProjectDesignStage } from '../../domain/contracts/enums/project-design-stage.enum';
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

    // DEMO BYPASS — remove after demo
    if (DEMO_NON_REVIEW_ACTIONS.has(action)) {
      const isMember = await this.isProjectMember(
        input.userId,
        input.companyId,
        input.projectId,
      );
      if (isMember) {
        return;
      }
    }
    // END DEMO BYPASS

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
    const projectDesignStage = await this.resolveProjectDesignStage(
      input.companyId,
      input.projectId,
    );

    const demoMemberBypass = await this.isProjectMember(
      input.userId,
      input.companyId,
      input.projectId,
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
      projectDesignStage,
      disciplineDesignerUserId: discipline.designerUserId ?? undefined,
      disciplineSupportingDesignerUserId:
        discipline.supportingDesignerUserId ?? undefined,
      disciplineReviewerUserId: discipline.reviewerUserId ?? undefined,
      disciplineLeadUserId: discipline.disciplineLeadUserId ?? undefined,
      disciplineChiefUserId: discipline.chiefUserId ?? undefined,
      disciplineOwnerUserId: discipline.ownerUserId ?? undefined,
      disciplineInstituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
      currentAssigneeUserId: input.currentAssigneeUserId,
      demoMemberBypass,
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

    // DEMO BYPASS — remove after demo
    if (DEMO_NON_REVIEW_ACTIONS.has(input.action)) {
      const isMember = await this.isProjectMember(
        input.userId,
        input.companyId,
        input.projectId,
      );
      if (isMember) {
        return;
      }
    }
    // END DEMO BYPASS

    const demoMemberBypass = await this.isProjectMember(
      input.userId,
      input.companyId,
      input.projectId,
    );

    const allowed = canPerformFromContext({
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
      packageOwnerUserId: packageOverrides?.packageOwnerUserId,
      packageReviewerUserId: packageOverrides?.packageReviewerUserId,
      packageDisciplineLeadUserId: packageOverrides?.packageDisciplineLeadUserId,
      packageChiefUserId: packageOverrides?.packageChiefUserId,
      packageInstituteChiefUserId: packageOverrides?.packageInstituteChiefUserId,
      isDocumentController: roleNames.includes('Document Controller'),
      currentAssigneeUserId: input.currentAssigneeUserId,
      demoMemberBypass,
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
    const [schedule, engineeringDocuments] = await Promise.all([
      this.permissionService.getUserModulePermissions(userId, companyId, 'schedule'),
      this.permissionService.getUserModulePermissions(
        userId,
        companyId,
        'engineering_documents',
      ),
    ]);

    const granted = new Set<EpcWorkflowAction>();

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
      granted.add(EpcWorkflowAction.SUBMITTAL_ISSUE);
    }

    if (engineeringDocuments.canCreate) {
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD);
      granted.add(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER);
    }

    return granted;
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

  // DEMO BYPASS helper — remove after demo
  private async isProjectMember(
    userId: string,
    _companyId: string,
    projectId: string,
  ): Promise<boolean> {
    const membership = await this.prisma.projectTeam.findFirst({
      where: {
        projectId,
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return membership !== null;
  }
  // END DEMO BYPASS helper

  private async resolvePackageApprovalOverrides(
    companyId: string,
    designPackageId: string,
  ): Promise<{
    packageOwnerUserId?: string;
    packageReviewerUserId?: string;
    packageDisciplineLeadUserId?: string;
    packageChiefUserId?: string;
    packageInstituteChiefUserId?: string;
  }> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      select: {
        packageOwnerUserId: true,
        packageReviewerUserId: true,
        packageDisciplineLeadUserId: true,
        packageChiefUserId: true,
        packageInstituteChiefUserId: true,
      },
    });
    if (!pkg) {
      return {};
    }
    return {
      packageOwnerUserId: pkg.packageOwnerUserId ?? undefined,
      packageReviewerUserId: pkg.packageReviewerUserId ?? undefined,
      packageDisciplineLeadUserId: pkg.packageDisciplineLeadUserId ?? undefined,
      packageChiefUserId: pkg.packageChiefUserId ?? undefined,
      packageInstituteChiefUserId: pkg.packageInstituteChiefUserId ?? undefined,
    };
  }
}
