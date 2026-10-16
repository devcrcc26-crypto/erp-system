import { ForbiddenException } from '@nestjs/common';
import { FolderContextType } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentPermissionService } from '../document-permission.service';

describe.each([
  { contextType: FolderContextType.PURCHASE_REQUEST, model: 'purchaseRequest' },
  { contextType: FolderContextType.EXPENSE_CLAIM, model: 'expenseClaim' },
  {
    contextType: FolderContextType.MATERIAL_REQUISITION,
    model: 'materialRequisition',
  },
  {
    contextType: FolderContextType.CONSUMABLES_REQUISITION,
    model: 'consumablesRequisition',
  },
] as const)(
  'DocumentPermissionService - $contextType attachments',
  ({ contextType, model }) => {
    const companyId = 'company-1';
    const recordId = 'record-1';
    const documentId = 'doc-1';

    let granted: Set<string>;
    let findRecord: jest.Mock;
    let service: DocumentPermissionService;

    beforeEach(() => {
      granted = new Set();
      findRecord = jest.fn().mockResolvedValue({
        employeeId: 'employee-1',
        createdBy: 'filer-1',
        approvalRequest: { tiers: [{ approverId: 'approver-1' }] },
      });
      const prisma = {
        document: {
          findFirst: jest.fn().mockResolvedValue({
            folder: { contextType, contextId: recordId },
          }),
        },
        purchaseRequest: { findFirst: jest.fn() },
        expenseClaim: { findFirst: jest.fn() },
        materialRequisition: { findFirst: jest.fn() },
        consumablesRequisition: { findFirst: jest.fn() },
      };
      prisma[model].findFirst = findRecord;
      service = new DocumentPermissionService(
        {
          hasPermission: jest.fn(
            async (
              _userId: string,
              _companyId: string,
              module: string,
              action: string,
            ) => granted.has(`${module}.${action}`),
          ),
        } as never,
        prisma as unknown as PrismaService,
      );
    });

    const view = (userId: string): Promise<void> =>
      service.assertCanViewDocument(userId, companyId, documentId);

    it.each(['employee-1', 'filer-1', 'approver-1'])(
      'lets %s (owner, filer or approver) open the file',
      async (userId) => {
        await expect(view(userId)).resolves.toBeUndefined();
        expect(findRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ id: recordId, companyId }),
          }),
        );
      },
    );

    it('lets HR viewers open the file', async () => {
      granted.add('hr.view');
      await expect(view('hr-officer')).resolves.toBeUndefined();
      expect(findRecord).not.toHaveBeenCalled();
    });

    it('rejects unrelated users', async () => {
      await expect(view('someone-else')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects when the record no longer exists', async () => {
      findRecord.mockResolvedValue(null);
      await expect(view('employee-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  },
);
