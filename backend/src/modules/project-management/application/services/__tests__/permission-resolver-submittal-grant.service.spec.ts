import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { EpcWorkflowAction } from '../../../domain/contracts/enums/epc-workflow-action.enum';
import { EpcWorkflowRepository } from '../../../infrastructure/repositories/epc-workflow.repository';
import { PermissionResolverService } from '../permission-resolver.service';

describe('PermissionResolverService submittal grants', () => {
  const userId = 'user-1';
  const companyId = 'company-1';

  let getUserModulePermissions: jest.Mock;
  let service: PermissionResolverService;

  beforeEach(() => {
    getUserModulePermissions = jest.fn();

    service = new PermissionResolverService(
      {
        getUserModulePermissions,
      } as unknown as PermissionService,
      {} as unknown as EpcWorkflowRepository,
      {} as unknown as PrismaService,
    );
  });

  it('grants SUBMITTAL_CREATE when schedule create permission is present', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: false,
      canCreate: true,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);

    expect(granted.has(EpcWorkflowAction.SUBMITTAL_CREATE)).toBe(true);
  });

  it('grants SUBMITTAL_ISSUE when schedule approve permission is present', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: true,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);

    expect(granted.has(EpcWorkflowAction.SUBMITTAL_ISSUE)).toBe(true);
  });

  it('grants assignee-scoped designer actions without schedule create/edit', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);

    expect(granted.has(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT)).toBe(true);
    expect(granted.has(EpcWorkflowAction.DESIGN_PACKAGE_ITEM_ADD)).toBe(true);
    expect(granted.has(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD)).toBe(
      true,
    );
    expect(granted.has(EpcWorkflowAction.REVIEW_COMMENT_ASSIGN)).toBe(true);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_APPROVE)).toBe(true);
    expect(granted.has(EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN)).toBe(true);
    expect(granted.has(EpcWorkflowAction.SUBMITTAL_CREATE)).toBe(false);
  });

  it('does not grant SUBMITTAL_CREATE when schedule create and edit are absent', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);

    expect(granted.has(EpcWorkflowAction.SUBMITTAL_CREATE)).toBe(false);
  });

  it('keeps existing engineering upload grants for schedule create users', async () => {
    getUserModulePermissions.mockResolvedValue({
      canView: false,
      canCreate: true,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    });

    const granted = await service.resolveGrantedActions(userId, companyId);

    expect(granted.has(EpcWorkflowAction.ENGINEERING_DOCUMENT_VERSION_UPLOAD)).toBe(
      true,
    );
    expect(granted.has(EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT)).toBe(true);
    expect(granted.has(EpcWorkflowAction.REVISION_TRIGGER)).toBe(true);
  });
});
