import { ConflictException } from '@nestjs/common';
import { ConflictGuardService } from './conflict-guard.service';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { EdvWithDiscipline } from '../../infrastructure/repositories/epc-workflow.repository';

function mockEdv(id: string, status: EdvStatus): EdvWithDiscipline {
  return {
    id,
    status: status as EdvWithDiscipline['status'],
    revisionLabel: '1',
    isCurrent: false,
    companyId: 'co',
    engineeringDocumentId: 'doc',
    documentVersionId: 'dv',
    createdAt: new Date(),
    createdBy: 'u',
    updatedAt: new Date(),
    updatedBy: 'u',
    deletedAt: null,
    deletedBy: null,
    engineeringDocument: {
      id: 'doc',
      companyId: 'co',
      taskDisciplineId: 'td',
      documentType: 'DRAWING',
      documentNumber: 'DOC-001',
      title: 't',
      metadata: {},
      createdAt: new Date(),
      createdBy: 'u',
      updatedAt: new Date(),
      updatedBy: 'u',
      deletedAt: null,
      deletedBy: null,
      taskDiscipline: {
        id: 'td',
        taskId: 'task',
        companyId: 'co',
        disciplineId: 'disc-catalog-1',
        disciplineName: 'Structural',
        projectedStatus: 'IN_PROGRESS',
        designerName: null,
        reviewerName: null,
        disciplinaryLeader: null,
        deptChiefEngineer: null,
        disciplineOwnerName: null,
        designerUserId: null,
        ownerUserId: null,
        reviewerUserId: null,
        disciplineLeadUserId: null,
        chiefUserId: null,
        instituteChiefUserId: null,
        supportingDesignerUserId: null,
        isClosed: false,
        closedAt: null,
        closedBy: null,
        actualCompletionTime: null,
        deptReviewTime: null,
        disciplineIndex: null,
        createdAt: new Date(),
        createdBy: 'u',
        updatedAt: new Date(),
        updatedBy: 'u',
        deletedAt: null,
        deletedBy: null,
      },
    },
  };
}

describe('ConflictGuardService', () => {
  const epcReviewRepository = {
    findActiveSessionForPackage: jest.fn(),
    findActiveSessionForEdv: jest.fn(),
    findPackageDependencies: jest.fn(),
    findLockedEdvIdsForPackage: jest.fn(),
    findActiveSessionForEngineeringDocument: jest.fn(),
  };
  const guard = new ConflictGuardService(epcReviewRepository as never);

  it('rejects batch when EDV count mismatch', () => {
    expect(() =>
      guard.assertBatchEdvsResolved(['a', 'b'], [mockEdv('a', EdvStatus.IN_REVIEW)]),
    ).toThrow(ConflictException);
  });

  it('builds approve plan for IN_REVIEW → APPROVED', () => {
    const plan = guard.assertBatchTransitionPlan(
      [mockEdv('a', EdvStatus.IN_REVIEW)],
      EdvStatus.APPROVED,
      [EdvStatus.IN_REVIEW],
    );
    expect(plan).toEqual([
      { edvId: 'a', from: EdvStatus.IN_REVIEW, to: EdvStatus.APPROVED },
    ]);
  });

  it('rejects package lock when not all APPROVED', () => {
    expect(() =>
      guard.assertPackageLockEligible([EdvStatus.IN_REVIEW], 'pkg-1'),
    ).toThrow(ConflictException);
  });
});
