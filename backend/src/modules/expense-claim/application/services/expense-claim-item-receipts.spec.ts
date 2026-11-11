import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { AddExpenseClaimItemDto } from '../dtos/expense-claim.dtos';
import { ExpenseClaimService } from './expense-claim.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000201';
const CLAIM_ID = '00000000-0000-4000-8000-000000000301';
const ITEM_ID = '00000000-0000-4000-8000-000000000401';

const DTO = {
  category: 'Accommodation',
  description: 'Hotel receipt',
  expenseDate: '2026-10-20',
  amount: 500,
  currency: 'ETB',
} as AddExpenseClaimItemDto;

function upload(name: string) {
  return {
    originalname: name,
    mimetype: 'application/pdf',
    size: 10,
    buffer: Buffer.from('x'),
  };
}

type CreateArgs = {
  data: { receipts: { create: Array<{ documentId: string }> } };
};
type UpdateArgs = {
  data: {
    receipts?: { deleteMany: object; create: Array<{ documentId: string }> };
  };
};

describe('ExpenseClaimService - several receipts on one item', () => {
  let service: ExpenseClaimService;
  let create: jest.Mock<(args: CreateArgs) => Promise<unknown>>;
  let update: jest.Mock<(args: UpdateArgs) => Promise<unknown>>;

  beforeEach(() => {
    create = jest.fn<(args: CreateArgs) => Promise<unknown>>();
    update = jest.fn<(args: UpdateArgs) => Promise<unknown>>();
    const prisma = {
      expenseClaimItem: {
        create,
        update,
        findFirst: async () => ({
          id: ITEM_ID,
          claimId: CLAIM_ID,
          category: 'Accommodation',
          description: 'Hotel receipt',
          amount: 500,
          currency: 'ETB',
          expenseDate: new Date('2026-10-20'),
        }),
      },
    };
    service = new ExpenseClaimService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      { register: jest.fn(), unregister: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      assertDraftOwner: () => Promise<unknown>;
      uploadReceipts: (
        claim: unknown,
        companyId: string,
        userId: string,
        files: unknown[],
      ) => Promise<string[]>;
      recomputeTotal: () => Promise<void>;
    };
    jest.spyOn(internals, 'assertDraftOwner').mockResolvedValue({
      id: CLAIM_ID,
      claimNumber: 'EC-1',
      attachmentFolderId: 'folder-1',
    });
    jest
      .spyOn(internals, 'uploadReceipts')
      .mockImplementation(async (_c, _co, _u, files) =>
        files.map((_file, index) => `doc-${index + 1}`),
      );
    jest.spyOn(internals, 'recomputeTotal').mockResolvedValue(undefined);
    jest.spyOn(service, 'getClaim').mockResolvedValue({ id: CLAIM_ID });
  });

  it('creates ONE item holding both receipts (not one item per file)', async () => {
    await service.addItem(
      CLAIM_ID,
      DTO,
      [upload('invoice.pdf'), upload('payment.pdf')],
      COMPANY_ID,
      USER_ID,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.receipts.create).toEqual([
      { documentId: 'doc-1' },
      { documentId: 'doc-2' },
    ]);
  });

  it('replaces the receipts of the item when new files are uploaded', async () => {
    await service.updateItem(
      CLAIM_ID,
      ITEM_ID,
      {},
      [upload('a.pdf'), upload('b.pdf')],
      COMPANY_ID,
      USER_ID,
    );

    expect(update.mock.calls[0][0].data.receipts).toEqual({
      deleteMany: {},
      create: [{ documentId: 'doc-1' }, { documentId: 'doc-2' }],
    });
  });

  it('keeps the existing receipts when no new file is uploaded', async () => {
    await service.updateItem(CLAIM_ID, ITEM_ID, {}, [], COMPANY_ID, USER_ID);

    expect(update.mock.calls[0][0].data.receipts).toBeUndefined();
  });
});
