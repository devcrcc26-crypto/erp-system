import {
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  ReviewTier,
} from '@prisma/client';
import { mapDesignPackage } from '../engineering-document.mapper';

describe('mapDesignPackage', () => {
  it('includes governance and brief fields required by the review UI', () => {
    const row = {
      id: 'pkg-1',
      companyId: 'company-1',
      taskDisciplineId: 'discipline-1',
      packageCode: 'SUB-00001',
      subtaskIndex: 1,
      subtaskId: 'OS-001-01-01',
      name: 'Package A',
      nameZh: null,
      mainWorkContent: null,
      plannedStartDate: null,
      plannedFinishDate: null,
      actualWorkDays: null,
      urgencyLevel: null,
      reviewLevel: null,
      projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
      projectionPending: false,
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      approvedAt: null,
      requiredTiers: [
        ReviewTier.DISCIPLINE_OWNER,
        ReviewTier.DISCIPLINE_LEAD,
        ReviewTier.DEPT_CHIEF,
      ],
      designerUserId: null,
      supportingDesignerUserId: null,
      disciplineOwnerUserId: null,
      reviewerUserId: null,
      disciplinaryLeaderUserId: null,
      deptDeputyChiefUserId: null,
      instituteChiefUserId: null,
      instituteChiefName: null,
      siteRepresentativeUserId: null,
      siteRepType: null,
      siteRepName: null,
      siteRepEmail: null,
      siteRepPhone: null,
      siteRepCompany: null,
      consultantName: null,
      consultantTitle: null,
      consultantEmail: null,
      consultantPhone: null,
      consultantCompany: null,
      briefText: 'Brief notes',
      sourceEntityType: 'RFI',
      sourceEntityId: 'rfi-1',
      packageStatus: DesignPackageStatus.OPEN,
      packageClosedAt: null,
      packageClosedBy: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: 'user-1',
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedBy: 'user-1',
      deletedAt: null,
      deletedBy: null,
      items: [],
    };

    const mapped = mapDesignPackage(row);

    expect(mapped.requiredTiers).toEqual([
      ReviewTier.DISCIPLINE_OWNER,
      ReviewTier.DISCIPLINE_LEAD,
      ReviewTier.DEPT_CHIEF,
    ]);
    expect(mapped.briefText).toBe('Brief notes');
    expect(mapped.sourceEntityType).toBe('RFI');
    expect(mapped.sourceEntityId).toBe('rfi-1');
  });
});
