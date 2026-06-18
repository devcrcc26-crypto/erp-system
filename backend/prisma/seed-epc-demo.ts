import {
  CommentSeverity,
  CommentStatus,
  DesignPackageProjectedStatus,
  EdvStatus,
  EngineeringDocumentType,
  PrismaClient,
  ReviewSessionStatus,
  ReviewTier,
  TaskDisciplineProjectedStatus,
} from '@prisma/client';
import type { PmSeedContext } from './seed-pm-demo';

/** Deterministic UUID for EPC demo on DEMO-001 (project index 1). */
function sid(project: number, entity: number): string {
  const n = project * 1000 + entity;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

const DEMO_PROJECT_INDEX = 1;

export const EPC_DEMO = {
  projectId: sid(DEMO_PROJECT_INDEX, 1),
  taskId: sid(DEMO_PROJECT_INDEX, 30),
  taskDisciplineId: sid(DEMO_PROJECT_INDEX, 200),
  engineeringDocumentId: sid(DEMO_PROJECT_INDEX, 201),
  engineeringDocumentVersionId: sid(DEMO_PROJECT_INDEX, 202),
  documentId: sid(DEMO_PROJECT_INDEX, 11),
  documentVersionId: sid(DEMO_PROJECT_INDEX, 203),
  designPackageId: sid(DEMO_PROJECT_INDEX, 210),
  designPackageItemId: sid(DEMO_PROJECT_INDEX, 211),
  designPackageLeadId: sid(DEMO_PROJECT_INDEX, 212),
  designPackageLeadItemId: sid(DEMO_PROJECT_INDEX, 213),
  engineeringDocumentLeadVersionId: sid(DEMO_PROJECT_INDEX, 204),
  reviewSessionId: sid(DEMO_PROJECT_INDEX, 220),
  reviewSessionLeadId: sid(DEMO_PROJECT_INDEX, 226),
  reviewContextSnapshotId: sid(DEMO_PROJECT_INDEX, 221),
  reviewContextSnapshotLeadId: sid(DEMO_PROJECT_INDEX, 227),
  reviewCommentId: sid(DEMO_PROJECT_INDEX, 222),
  designPackageName: 'Foundation Drawings — Review Package',
  designPackageLeadName: 'Structural Calculations — Lead Review',
} as const;

const REVIEWER_USER_ID = '00000000-0000-0000-0000-000000000084';
const ENGINEER_USER_ID = '00000000-0000-0000-0000-000000000081';
const LEAD_USER_ID = '00000000-0000-0000-0000-000000000085';

function d(iso: string): Date {
  return new Date(iso);
}

/**
 * Removes deterministic EPC demo rows before PM demo cleanup re-seeds documents.
 */
export async function cleanupEpcDemoData(prisma: PrismaClient): Promise<void> {
  await prisma.reviewComment.deleteMany({
    where: { id: EPC_DEMO.reviewCommentId },
  });
  await prisma.reviewContextSnapshot.deleteMany({
    where: {
      id: {
        in: [EPC_DEMO.reviewContextSnapshotId, EPC_DEMO.reviewContextSnapshotLeadId],
      },
    },
  });
  await prisma.reviewSession.deleteMany({
    where: {
      id: { in: [EPC_DEMO.reviewSessionId, EPC_DEMO.reviewSessionLeadId] },
    },
  });
  await prisma.designPackageItem.deleteMany({
    where: {
      id: {
        in: [EPC_DEMO.designPackageItemId, EPC_DEMO.designPackageLeadItemId],
      },
    },
  });
  await prisma.designPackage.deleteMany({
    where: { id: { in: [EPC_DEMO.designPackageId, EPC_DEMO.designPackageLeadId] } },
  });
  await prisma.engineeringDocumentVersion.deleteMany({
    where: {
      id: {
        in: [
          EPC_DEMO.engineeringDocumentVersionId,
          EPC_DEMO.engineeringDocumentLeadVersionId,
        ],
      },
    },
  });
  await prisma.engineeringDocument.deleteMany({
    where: { id: EPC_DEMO.engineeringDocumentId },
  });
  await prisma.taskDiscipline.deleteMany({
    where: { id: EPC_DEMO.taskDisciplineId },
  });
  await prisma.documentVersion.deleteMany({
    where: { id: EPC_DEMO.documentVersionId },
  });
}

/**
 * Seeds one active review session on DEMO-001 for Playwright / manual EPC walkthrough.
 */
export async function seedEpcDemoData(ctx: PmSeedContext): Promise<void> {
  const { prisma, companyId, adminUserId } = ctx;

  const project = await prisma.project.findFirst({
    where: { companyId, projectCode: 'DEMO-001' },
    select: { id: true },
  });
  if (!project) {
    return;
  }

  const task = await prisma.task.findFirst({
    where: { id: EPC_DEMO.taskId, projectId: project.id },
    select: { id: true },
  });
  if (!task) {
    return;
  }

  await cleanupEpcDemoData(prisma);

  await prisma.taskDiscipline.upsert({
    where: { id: EPC_DEMO.taskDisciplineId },
    update: {
      disciplineName: 'Structural',
      projectedStatus: TaskDisciplineProjectedStatus.IN_PROGRESS,
      designerUserId: ENGINEER_USER_ID,
      reviewerUserId: REVIEWER_USER_ID,
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.taskDisciplineId,
      taskId: task.id,
      companyId,
      disciplineName: 'Structural',
      projectedStatus: TaskDisciplineProjectedStatus.IN_PROGRESS,
      designerName: 'Sara Khalil',
      reviewerName: 'Nadia Saleh',
      designerUserId: ENGINEER_USER_ID,
      reviewerUserId: REVIEWER_USER_ID,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: EPC_DEMO.documentVersionId },
    update: {},
    create: {
      id: EPC_DEMO.documentVersionId,
      documentId: EPC_DEMO.documentId,
      uploadedBy: adminUserId,
      versionNumber: 1,
      fileKey: 'demo/DEMO-001/Foundation-Layout-Rev-A.pdf',
      fileSizeBytes: 512_000,
      changeNote: 'EPC demo drawing upload',
    },
  });

  await prisma.engineeringDocument.upsert({
    where: { id: EPC_DEMO.engineeringDocumentId },
    update: {
      title: 'Foundation Layout Drawing',
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.engineeringDocumentId,
      companyId,
      taskDisciplineId: EPC_DEMO.taskDisciplineId,
      documentType: EngineeringDocumentType.DRAWING,
      documentNumber: 'STR-FND-001',
      title: 'Foundation Layout Drawing',
      metadata: { sheet: 'S-101' },
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: EPC_DEMO.engineeringDocumentVersionId },
    update: {
      status: EdvStatus.IN_REVIEW,
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.engineeringDocumentVersionId,
      companyId,
      engineeringDocumentId: EPC_DEMO.engineeringDocumentId,
      documentVersionId: EPC_DEMO.documentVersionId,
      revisionLabel: 'A',
      status: EdvStatus.IN_REVIEW,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: EPC_DEMO.designPackageId },
    update: {
      name: EPC_DEMO.designPackageName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-01'),
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.designPackageId,
      companyId,
      taskDisciplineId: EPC_DEMO.taskDisciplineId,
      name: EPC_DEMO.designPackageName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-01'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: EPC_DEMO.designPackageItemId },
    update: {},
    create: {
      id: EPC_DEMO.designPackageItemId,
      companyId,
      designPackageId: EPC_DEMO.designPackageId,
      engineeringDocumentVersionId: EPC_DEMO.engineeringDocumentVersionId,
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: EPC_DEMO.reviewSessionId },
    update: {
      status: ReviewSessionStatus.ACTIVE,
      assignedToUserId: REVIEWER_USER_ID,
      slaDeadlineAt: d('2026-04-15'),
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.reviewSessionId,
      companyId,
      designPackageId: EPC_DEMO.designPackageId,
      taskDisciplineId: EPC_DEMO.taskDisciplineId,
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.REVIEWER,
      assignedToUserId: REVIEWER_USER_ID,
      openedAt: d('2026-03-02'),
      slaDeadlineAt: d('2026-04-15'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: EPC_DEMO.reviewContextSnapshotId },
    update: {
      referencedVersionIds: [EPC_DEMO.engineeringDocumentVersionId],
      contentHash: 'epc-demo-snapshot-v1',
    },
    create: {
      id: EPC_DEMO.reviewContextSnapshotId,
      companyId,
      reviewSessionId: EPC_DEMO.reviewSessionId,
      referencedVersionIds: [EPC_DEMO.engineeringDocumentVersionId],
      contentHash: 'epc-demo-snapshot-v1',
      capturedBy: adminUserId,
    },
  });

  await prisma.reviewComment.upsert({
    where: { id: EPC_DEMO.reviewCommentId },
    update: {
      body: 'Clarify pile cap reinforcement detail at grid A4.',
      status: CommentStatus.OPEN,
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.reviewCommentId,
      companyId,
      reviewSessionId: EPC_DEMO.reviewSessionId,
      engineeringDocumentVersionId: EPC_DEMO.engineeringDocumentVersionId,
      body: 'Clarify pile cap reinforcement detail at grid A4.',
      severity: CommentSeverity.MODERATE,
      status: CommentStatus.OPEN,
      assignedToUserId: ENGINEER_USER_ID,
      createdBy: REVIEWER_USER_ID,
      updatedBy: REVIEWER_USER_ID,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: EPC_DEMO.engineeringDocumentLeadVersionId },
    update: {
      status: EdvStatus.IN_REVIEW,
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.engineeringDocumentLeadVersionId,
      companyId,
      engineeringDocumentId: EPC_DEMO.engineeringDocumentId,
      documentVersionId: EPC_DEMO.documentVersionId,
      revisionLabel: 'B',
      status: EdvStatus.IN_REVIEW,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: EPC_DEMO.designPackageLeadId },
    update: {
      name: EPC_DEMO.designPackageLeadName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-05'),
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.designPackageLeadId,
      companyId,
      taskDisciplineId: EPC_DEMO.taskDisciplineId,
      name: EPC_DEMO.designPackageLeadName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-05'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: EPC_DEMO.designPackageLeadItemId },
    update: {},
    create: {
      id: EPC_DEMO.designPackageLeadItemId,
      companyId,
      designPackageId: EPC_DEMO.designPackageLeadId,
      engineeringDocumentVersionId: EPC_DEMO.engineeringDocumentLeadVersionId,
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: EPC_DEMO.reviewSessionLeadId },
    update: {
      status: ReviewSessionStatus.ACTIVE,
      assignedToUserId: LEAD_USER_ID,
      currentTier: ReviewTier.DISCIPLINE_LEAD,
      slaDeadlineAt: d('2026-04-20'),
      updatedBy: adminUserId,
    },
    create: {
      id: EPC_DEMO.reviewSessionLeadId,
      companyId,
      designPackageId: EPC_DEMO.designPackageLeadId,
      taskDisciplineId: EPC_DEMO.taskDisciplineId,
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.DISCIPLINE_LEAD,
      assignedToUserId: LEAD_USER_ID,
      openedAt: d('2026-03-06'),
      slaDeadlineAt: d('2026-04-20'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: EPC_DEMO.reviewContextSnapshotLeadId },
    update: {
      referencedVersionIds: [EPC_DEMO.engineeringDocumentLeadVersionId],
      contentHash: 'epc-demo-lead-snapshot-v1',
    },
    create: {
      id: EPC_DEMO.reviewContextSnapshotLeadId,
      companyId,
      reviewSessionId: EPC_DEMO.reviewSessionLeadId,
      referencedVersionIds: [EPC_DEMO.engineeringDocumentLeadVersionId],
      contentHash: 'epc-demo-lead-snapshot-v1',
      capturedBy: adminUserId,
    },
  });

  console.log('  EPC demo review package seeded on DEMO-001');
  console.log(`    Package: ${EPC_DEMO.designPackageName}`);
  console.log(`    Reviewer inbox: reviewer@company.local`);
  console.log(`    Designer comments: engineer@company.local`);
}
