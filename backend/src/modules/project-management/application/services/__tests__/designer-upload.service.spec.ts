import { ForbiddenException } from '@nestjs/common';
import { EdvStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { EpcWorkflowAction } from '../../../domain/contracts/enums/epc-workflow-action.enum';
import { ProjectDesignStage } from '../../../domain/contracts/enums/project-design-stage.enum';
import { canPerformFromContext } from '../../../domain/permission-context-builder';
import {
  EngineeringDocumentRepository,
  EngineeringDocumentVersionRepository,
  TaskDisciplineScopeRepository,
} from '../../../infrastructure/repositories/epc-storage.repository';
import { EpcWorkflowRepository } from '../../../infrastructure/repositories/epc-workflow.repository';
import { PmContext } from '../../types/pm-context.type';
import { ConflictGuardService } from '../conflict-guard.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { EngineeringDocumentsService } from '../engineering-documents.service';
import { PermissionResolverService } from '../permission-resolver.service';
import { WorkflowEventLogService } from '../workflow-event-log.service';
import { WorkflowKernelService } from '../workflow-kernel.service';

const primaryDesignerId = 'user-primary';
const supportingDesignerId = 'user-supporting';
const unrelatedUserId = 'user-unrelated';
const companyId = 'company-1';
const projectId = 'project-1';
const taskDisciplineId = 'discipline-1';

const grantedUploadActions = new Set([
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
  EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_REGISTER,
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD,
  EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE,
  EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
]);

function permissionContext(
  userId: string,
  action: EpcWorkflowAction,
): Parameters<typeof canPerformFromContext>[0] {
  return {
    companyId,
    userId,
    projectId,
    action,
    taskDisciplineId,
    projectTeamRole: 'OTHER' as never,
    projectDesignStage: ProjectDesignStage.DETAILED_DESIGN_DD,
    grantedActions: grantedUploadActions,
    disciplineDesignerUserId: primaryDesignerId,
    disciplineSupportingDesignerUserId: supportingDesignerId,
  };
}

describe('designer-upload rights', () => {
  describe('Layer 3 - primary vs supporting designer', () => {
    it('1. primary designer uploads EDV → allowed', () => {
      expect(
        canPerformFromContext(
          permissionContext(
            primaryDesignerId,
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          ),
        ),
      ).toBe(true);
    });

    it('2. supporting designer uploads EDV → allowed', () => {
      expect(
        canPerformFromContext(
          permissionContext(
            supportingDesignerId,
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          ),
        ),
      ).toBe(true);
    });

    it('3. unrelated user uploads EDV → ForbiddenException', async () => {
      const service = buildPermissionResolver({
        designerUserId: primaryDesignerId,
        supportingDesignerUserId: supportingDesignerId,
      });

      await expect(
        service.assertActionAllowed({
          companyId,
          userId: unrelatedUserId,
          projectId,
          action: EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          taskDisciplineId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('4. supporting designer submits package → ForbiddenException', async () => {
      const service = buildPermissionResolver({
        designerUserId: primaryDesignerId,
        supportingDesignerUserId: supportingDesignerId,
      });

      await expect(
        service.assertActionAllowed({
          companyId,
          userId: supportingDesignerId,
          projectId,
          action: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
          taskDisciplineId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('5. primary designer submits → allowed', () => {
      expect(
        canPerformFromContext(
          permissionContext(
            primaryDesignerId,
            EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
          ),
        ),
      ).toBe(true);
    });

    it('6. supporting designer adds EDV to package → allowed', () => {
      expect(
        canPerformFromContext(
          permissionContext(
            supportingDesignerId,
            EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD,
          ),
        ),
      ).toBe(true);
    });

    it('7. supporting designer removes EDV → allowed', () => {
      expect(
        canPerformFromContext(
          permissionContext(
            supportingDesignerId,
            EpcWorkflowAction.DESIGN_PACKAGE_ITEM_REMOVE,
          ),
        ),
      ).toBe(true);
    });

    it('8. document controller assigned on discipline uploads EDV → allowed', () => {
      const documentControllerId = 'user-doc-controller';
      expect(
        canPerformFromContext({
          ...permissionContext(
            documentControllerId,
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          ),
          isDocumentController: true,
          disciplineDesignerUserId: undefined,
          disciplineSupportingDesignerUserId: undefined,
          disciplineOwnerUserId: documentControllerId,
        }),
      ).toBe(true);
    });

    it('9. document controller not assigned on discipline uploads EDV → denied', () => {
      expect(
        canPerformFromContext({
          ...permissionContext(
            'user-doc-controller',
            EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD,
          ),
          isDocumentController: true,
          disciplineDesignerUserId: primaryDesignerId,
          disciplineOwnerUserId: 'other-user',
        }),
      ).toBe(false);
    });

    it('10. document controller cannot submit package for review', () => {
      const documentControllerId = 'user-doc-controller';
      expect(
        canPerformFromContext({
          ...permissionContext(
            documentControllerId,
            EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
          ),
          isDocumentController: true,
          disciplineOwnerUserId: documentControllerId,
        }),
      ).toBe(false);
    });

    it('11. document controller cannot add EDV to package', () => {
      const documentControllerId = 'user-doc-controller';
      expect(
        canPerformFromContext({
          ...permissionContext(
            documentControllerId,
            EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD,
          ),
          isDocumentController: true,
          disciplineOwnerUserId: documentControllerId,
        }),
      ).toBe(false);
    });
  });

  describe('isCurrent flag on EDV upload', () => {
    const ctx: PmContext = { companyId, userId: primaryDesignerId };
    const engineeringDocumentId = 'eng-doc-1';

    let engineeringDocumentRepository: {
      findById: jest.Mock;
      createWithInitialCurrentVersion: jest.Mock;
    };
    let engineeringDocumentVersionRepository: {
      findByDocumentId: jest.Mock;
      countByDocument: jest.Mock;
      createAsCurrent: jest.Mock;
    };
    let workflowKernel: { execute: jest.Mock };
    let service: EngineeringDocumentsService;

    beforeEach(() => {
      engineeringDocumentRepository = {
        findById: jest.fn(),
        createWithInitialCurrentVersion: jest.fn(),
      };
      engineeringDocumentVersionRepository = {
        findByDocumentId: jest.fn(),
        countByDocument: jest.fn(),
        createAsCurrent: jest.fn(),
      };
      workflowKernel = { execute: jest.fn().mockResolvedValue({}) };

      service = new EngineeringDocumentsService(
        engineeringDocumentRepository as unknown as EngineeringDocumentRepository,
        engineeringDocumentVersionRepository as unknown as EngineeringDocumentVersionRepository,
        {
          findScoped: jest.fn().mockResolvedValue({
            id: taskDisciplineId,
            disciplineName: 'Structural',
            taskId: 'task-1',
          }),
          findWithReviewRoles: jest.fn().mockResolvedValue({
            id: taskDisciplineId,
            disciplineName: 'Structural',
            taskId: 'task-1',
            designerUserId: primaryDesignerId,
            supportingDesignerUserId: supportingDesignerId,
            ownerUserId: null,
            reviewerUserId: null,
            disciplineLeadUserId: null,
            chiefUserId: null,
            instituteChiefUserId: null,
          }),
          hasPackageDesignerAssignment: jest.fn().mockResolvedValue(false),
          findDocumentVersion: jest.fn().mockResolvedValue({ id: 'doc-version-1' }),
        } as unknown as TaskDisciplineScopeRepository,
        {
          ensureDisciplineFolder: jest.fn().mockResolvedValue({ id: 'folder-1' }),
        } as unknown as EngineeringDocumentFolderService,
        {
          assertNoActiveSessionForEngineeringDocument: jest.fn(),
        } as unknown as ConflictGuardService,
        { logCrud: jest.fn() } as unknown as WorkflowEventLogService,
        workflowKernel as unknown as WorkflowKernelService,
        { getVersionDownloadUrl: jest.fn() } as never,
        { engineeringDocumentVersion: { findFirst: jest.fn() } } as never,
      );
    });

    it('8. new EDV registered → new has isCurrent=true, previous has isCurrent=false', async () => {
      engineeringDocumentRepository.findById.mockResolvedValue({
        id: engineeringDocumentId,
        taskDisciplineId,
      });
      engineeringDocumentVersionRepository.findByDocumentId.mockResolvedValue([
        {
          id: 'edv-rev-0',
          status: EdvStatus.APPROVED,
          revisionLabel: '0',
          isCurrent: true,
        },
      ]);
      engineeringDocumentVersionRepository.countByDocument.mockResolvedValue(1);
      engineeringDocumentVersionRepository.createAsCurrent.mockResolvedValue({
        id: 'edv-rev-1',
        companyId,
        engineeringDocumentId,
        documentVersionId: 'doc-version-2',
        revisionLabel: '1',
        status: EdvStatus.DRAFT,
        isCurrent: true,
        createdBy: primaryDesignerId,
        updatedBy: primaryDesignerId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        deletedBy: null,
      });

      await service.uploadNewVersion(
        ctx,
        projectId,
        taskDisciplineId,
        engineeringDocumentId,
        { documentVersionId: 'doc-version-2' },
      );

      expect(engineeringDocumentVersionRepository.createAsCurrent).toHaveBeenCalledWith(
        expect.any(Object),
        companyId,
        engineeringDocumentId,
        primaryDesignerId,
      );
      const created =
        await engineeringDocumentVersionRepository.createAsCurrent.mock.results[0]
          .value;
      expect(created.isCurrent).toBe(true);
    });

    it('9. second upload to same document → only newest isCurrent=true', async () => {
      engineeringDocumentRepository.findById.mockResolvedValue({
        id: engineeringDocumentId,
        taskDisciplineId,
      });

      const rev0 = {
        id: 'edv-rev-0',
        status: EdvStatus.APPROVED,
        revisionLabel: '0',
        isCurrent: true,
      };
      const rev1Superseded = {
        id: 'edv-rev-1',
        status: EdvStatus.LOCKED,
        revisionLabel: '1',
        isCurrent: false,
      };

      engineeringDocumentVersionRepository.findByDocumentId
        .mockResolvedValueOnce([rev0])
        .mockResolvedValueOnce([{ ...rev0, status: EdvStatus.SUPERSEDED, isCurrent: false }, rev1Superseded]);
      engineeringDocumentVersionRepository.countByDocument
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);
      engineeringDocumentVersionRepository.createAsCurrent
        .mockResolvedValueOnce({
          id: 'edv-rev-1',
          isCurrent: true,
          revisionLabel: '1',
          status: EdvStatus.DRAFT,
          companyId,
          engineeringDocumentId,
          documentVersionId: 'doc-version-2',
          createdBy: primaryDesignerId,
          updatedBy: primaryDesignerId,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
        })
        .mockResolvedValueOnce({
          id: 'edv-rev-2',
          isCurrent: true,
          revisionLabel: '2',
          status: EdvStatus.DRAFT,
          companyId,
          engineeringDocumentId,
          documentVersionId: 'doc-version-3',
          createdBy: primaryDesignerId,
          updatedBy: primaryDesignerId,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
        });

      await service.uploadNewVersion(
        ctx,
        projectId,
        taskDisciplineId,
        engineeringDocumentId,
        { documentVersionId: 'doc-version-2' },
      );
      await service.uploadNewVersion(
        ctx,
        projectId,
        taskDisciplineId,
        engineeringDocumentId,
        { documentVersionId: 'doc-version-3' },
      );

      expect(engineeringDocumentVersionRepository.createAsCurrent).toHaveBeenCalledTimes(2);
      const secondCreated =
        await engineeringDocumentVersionRepository.createAsCurrent.mock.results[1]
          .value;
      expect(secondCreated.id).toBe('edv-rev-2');
      expect(secondCreated.isCurrent).toBe(true);
      const firstCreated =
        await engineeringDocumentVersionRepository.createAsCurrent.mock.results[0]
          .value;
      expect(firstCreated.id).toBe('edv-rev-1');
      expect(firstCreated.isCurrent).toBe(true);
    });
  });
});

function buildPermissionResolver(discipline: {
  designerUserId: string;
  supportingDesignerUserId: string;
}): PermissionResolverService {
  return new PermissionResolverService(
    {
      getUserModulePermissions: jest.fn().mockResolvedValue({
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: false,
        canApprove: false,
      }),
      getUserRoleNames: jest.fn().mockResolvedValue([]),
    } as unknown as PermissionService,
    {
      findProjectTeamRole: jest.fn().mockResolvedValue('OTHER'),
      findTaskDisciplineContext: jest.fn().mockResolvedValue({
        id: taskDisciplineId,
        designerUserId: discipline.designerUserId,
        supportingDesignerUserId: discipline.supportingDesignerUserId,
        reviewerUserId: null,
        disciplineLeadUserId: null,
        chiefUserId: null,
        ownerUserId: null,
        instituteChiefUserId: null,
      }),
    } as unknown as EpcWorkflowRepository,
    {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          designStage: 'DETAILED_DESIGN_DD',
        }),
      },
    } as unknown as PrismaService,
  );
}
