import {
  CommentSeverity,
  CommentStatus,
  DesignPackageDependencyType,
  DesignPackageProjectedStatus,
  EdvStatus,
  EngineeringDocumentType,
  PrismaClient,
  ReviewSessionOutcome,
  ReviewSessionStatus,
  ReviewTier,
  SubmittalItemType,
  SubmittalStatus,
  TaskDisciplineProjectedStatus,
  TaskDisciplineReviewStatus,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import type { PmSeedContext } from './seed-pm-demo';

/** Deterministic UUID for EPC demo records (project index 1–3, entity offset). */
export function sid(project: number, entity: number): string {
  const n = project * 1000 + entity;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Deterministic subtask code for seeded design packages, matching sid()'s numbering. */
export function subtaskCode(project: number, entity: number): string {
  const n = project * 1000 + entity;
  return `SUB-${String(n).padStart(5, '0')}`;
}

export const EPC_DEMO_PROJECT_CODES = ['DEMO-001', 'DEMO-002', 'DEMO-003'] as const;

const DEMO_PROJECT_INDEX = 1;

/** Stable IDs for Playwright on DEMO-001 - unchanged from original seed. */
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
  reviewCommentId: sid(DEMO_PROJECT_INDEX, 223),
  designPackageName: 'Foundation Drawings - Review Package',
  designPackageLeadName: 'Structural Calculations - Lead Review',
  designPackageReviewerId: sid(DEMO_PROJECT_INDEX, 216),
  reviewSessionReviewerId: sid(DEMO_PROJECT_INDEX, 228),
  designPackageReviewerName: 'Steel Connection Details - Reviewer Package',
} as const;

const REVIEWER_USER_ID = '00000000-0000-4000-8000-000000000084';
const ENGINEER_USER_ID = '00000000-0000-4000-8000-000000000081';
const LEAD_USER_ID = '00000000-0000-4000-8000-000000000085';
const DEPT_CHIEF_USER_ID = '00000000-0000-4000-8000-000000000086';
const OWNER_USER_ID = '00000000-0000-4000-8000-000000000089';
const DOCS_USER_ID = '00000000-0000-4000-8000-000000000083';
const PM_USER_ID = '00000000-0000-4000-8000-000000000080';

function d(iso: string): Date {
  return new Date(iso);
}

/** SLA deadlines relative to seed run so demo sessions are not immediately overdue. */
function slaDaysFromNow(days: number): Date {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + days);
  return deadline;
}

/**
 * Removes all EPC workflow rows for DEMO-001…003 before PM demo re-seed.
 */
export async function cleanupEpcDemoData(
  prisma: PrismaClient,
  companyId: string,
): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { companyId, projectCode: { in: [...EPC_DEMO_PROJECT_CODES] } },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) {
    return;
  }

  const taskIds = (
    await prisma.task.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((t) => t.id);

  const deterministicDisciplineIds = [1, 2, 3].map((p) => sid(p, 200));
  const disciplineRows = await prisma.taskDiscipline.findMany({
    where: {
      companyId,
      OR: [
        { taskId: { in: taskIds } },
        { id: { in: deterministicDisciplineIds } },
      ],
    },
    select: { id: true },
  });
  const disciplineIds = [...new Set(disciplineRows.map((row) => row.id))];
  if (disciplineIds.length === 0) {
    return;
  }

  const packageRows = await prisma.designPackage.findMany({
    where: {
      companyId,
      taskDiscipline: { task: { projectId: { in: projectIds } } },
    },
    select: { id: true },
  });
  const packageIds = packageRows.map((row) => row.id);

  const sessionRows = await prisma.reviewSession.findMany({
    where: {
      companyId,
      OR: [
        { taskDisciplineId: { in: disciplineIds } },
        { designPackageId: { in: packageIds } },
      ],
    },
    select: { id: true },
  });
  const sessionIds = sessionRows.map((row) => row.id);

  const edvRows = await prisma.engineeringDocumentVersion.findMany({
    where: {
      companyId,
      engineeringDocument: { taskDisciplineId: { in: disciplineIds } },
    },
    select: { id: true },
  });
  const edvIds = edvRows.map((row) => row.id);

  const epcSubmittalIds = [sid(3, 55)];
  const epcSubmittalItemIds = [sid(3, 56)];

  if (sessionIds.length > 0) {
    await prisma.reviewComment.deleteMany({
      where: { reviewSessionId: { in: sessionIds } },
    });
    await prisma.reviewContextSnapshot.deleteMany({
      where: { reviewSessionId: { in: sessionIds } },
    });
    await prisma.reviewSession.deleteMany({ where: { id: { in: sessionIds } } });
  }

  const workflowEntityIds = [...edvIds, ...packageIds, ...sessionIds, ...disciplineIds];
  if (workflowEntityIds.length > 0) {
    await prisma.workflowEventLog.deleteMany({
      where: { companyId, entityId: { in: workflowEntityIds } },
    });
  }

  if (packageIds.length > 0) {
    await prisma.submittalItem.deleteMany({
      where: { designPackageId: { in: packageIds } },
    });
    await prisma.designPackageDependency.deleteMany({
      where: {
        OR: [
          { designPackageId: { in: packageIds } },
          { dependsOnPackageId: { in: packageIds } },
        ],
      },
    });
    await prisma.designPackageItem.deleteMany({
      where: { designPackageId: { in: packageIds } },
    });
    await prisma.designPackage.deleteMany({ where: { id: { in: packageIds } } });
  }

  await prisma.engineeringDocumentVersion.deleteMany({
    where: { engineeringDocument: { taskDisciplineId: { in: disciplineIds } } },
  });
  await prisma.engineeringDocument.deleteMany({
    where: { taskDisciplineId: { in: disciplineIds } },
  });
  await prisma.taskDisciplineReview.deleteMany({
    where: { taskDisciplineId: { in: disciplineIds } },
  });
  await prisma.taskDiscipline.deleteMany({ where: { id: { in: disciplineIds } } });

  await prisma.submittalItem.deleteMany({ where: { id: { in: epcSubmittalItemIds } } });
  await prisma.submittal.deleteMany({ where: { id: { in: epcSubmittalIds } } });

  const epcDocVersionIds = [1, 2, 3].flatMap((p) => [
    sid(p, 203),
    sid(p, 205),
    sid(p, 207),
    ...(p === 1 ? [sid(p, 206)] : []),
  ]);
  await prisma.documentVersion.deleteMany({ where: { id: { in: epcDocVersionIds } } });
}

async function seedWorkflowEvents(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  events: Array<{
    id: string;
    entityType: WorkflowEntityType;
    entityId: string;
    action: string;
    phase: WorkflowEventPhase;
    createdAt: string;
  }>,
): Promise<void> {
  for (const event of events) {
    await prisma.workflowEventLog.upsert({
      where: { id: event.id },
      update: {
        action: event.action,
        phase: event.phase,
        actorId,
      },
      create: {
        id: event.id,
        companyId,
        entityType: event.entityType,
        entityId: event.entityId,
        actorId,
        action: event.action,
        phase: event.phase,
        createdAt: d(event.createdAt),
      },
    });
  }
}

async function seedTaskDisciplineReviews(
  prisma: PrismaClient,
  companyId: string,
  adminUserId: string,
  projectIndex: number,
  taskDisciplineId: string,
  tiers: Array<{
    tier: ReviewTier;
    status: TaskDisciplineReviewStatus;
    reviewedBy?: string;
    reviewedAt?: string;
  }>,
): Promise<void> {
  for (const [index, tierRow] of tiers.entries()) {
    const id = sid(projectIndex, 270 + index);
    await prisma.taskDisciplineReview.upsert({
      where: {
        taskDisciplineId_reviewTier: {
          taskDisciplineId,
          reviewTier: tierRow.tier,
        },
      },
      update: {
        status: tierRow.status,
        reviewedBy: tierRow.reviewedBy ?? null,
        reviewedAt: tierRow.reviewedAt ? d(tierRow.reviewedAt) : null,
        updatedBy: adminUserId,
      },
      create: {
        id,
        companyId,
        taskDisciplineId,
        reviewTier: tierRow.tier,
        status: tierRow.status,
        reviewedBy: tierRow.reviewedBy ?? null,
        reviewedAt: tierRow.reviewedAt ? d(tierRow.reviewedAt) : null,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }
}

/**
 * Standard EPC workflow for a project index - owner, reviewer - lead review tiers.
 */
async function seedEpcProjectStandard(
  ctx: PmSeedContext,
  p: number,
  projectCode: string,
  names: {
    designPackageName: string;
    designPackageLeadName: string;
    designPackageReviewerName: string;
  },
): Promise<void> {
  const { prisma, companyId, adminUserId } = ctx;
  const taskId = sid(p, 30);

  await prisma.taskDiscipline.upsert({
    where: { id: sid(p, 200) },
    update: {
      disciplineName: 'Structural',
      projectedStatus: TaskDisciplineProjectedStatus.IN_PROGRESS,
      designerUserId: ENGINEER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      disciplineOwnerName: 'Hassan Al-Rashid',
      reviewerUserId: REVIEWER_USER_ID,
      disciplineLeadUserId: LEAD_USER_ID,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 200),
      taskId,
      companyId,
      disciplineName: 'Structural',
      projectedStatus: TaskDisciplineProjectedStatus.IN_PROGRESS,
      designerName: 'Sara Khalil',
      disciplineOwnerName: 'Hassan Al-Rashid',
      reviewerName: 'Nadia Saleh',
      disciplinaryLeader: 'Khalid Nasser',
      designerUserId: ENGINEER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      reviewerUserId: REVIEWER_USER_ID,
      disciplineLeadUserId: LEAD_USER_ID,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: sid(p, 203) },
    update: {},
    create: {
      id: sid(p, 203),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 1,
      fileKey: `demo/${projectCode}/Foundation-Layout-Rev-A.pdf`,
      fileSizeBytes: 512_000,
      changeNote: 'EPC demo drawing upload',
    },
  });

  await prisma.engineeringDocument.upsert({
    where: { id: sid(p, 201) },
    update: { title: 'Foundation Layout Drawing', updatedBy: adminUserId },
    create: {
      id: sid(p, 201),
      companyId,
      taskDisciplineId: sid(p, 200),
      documentType: EngineeringDocumentType.DRAWING,
      documentNumber: 'STR-FND-001',
      title: 'Foundation Layout Drawing',
      metadata: { sheet: 'S-101' },
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 202) },
    update: { status: EdvStatus.IN_REVIEW, updatedBy: adminUserId },
    create: {
      id: sid(p, 202),
      companyId,
      engineeringDocumentId: sid(p, 201),
      documentVersionId: sid(p, 203),
      revisionLabel: 'A',
      status: EdvStatus.IN_REVIEW,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 204) },
    update: { status: EdvStatus.IN_REVIEW, updatedBy: adminUserId },
    create: {
      id: sid(p, 204),
      companyId,
      engineeringDocumentId: sid(p, 201),
      documentVersionId: sid(p, 203),
      revisionLabel: 'B',
      status: EdvStatus.IN_REVIEW,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: sid(p, 210) },
    update: {
      name: names.designPackageName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-01'),
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 210),
      packageCode: subtaskCode(p, 210),
      companyId,
      taskDisciplineId: sid(p, 200),
      name: names.designPackageName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-01'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: sid(p, 211) },
    update: {},
    create: {
      id: sid(p, 211),
      companyId,
      designPackageId: sid(p, 210),
      engineeringDocumentVersionId: sid(p, 202),
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: sid(p, 220) },
    update: {
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.DISCIPLINE_OWNER,
      assignedToUserId: OWNER_USER_ID,
      slaDeadlineAt: slaDaysFromNow(14),
      slaEscalatedAt: null,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 220),
      companyId,
      designPackageId: sid(p, 210),
      taskDisciplineId: sid(p, 200),
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.DISCIPLINE_OWNER,
      assignedToUserId: OWNER_USER_ID,
      openedAt: d('2026-03-02'),
      slaDeadlineAt: slaDaysFromNow(14),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: sid(p, 221) },
    update: {
      referencedVersionIds: [sid(p, 202)],
      contentHash: 'epc-demo-snapshot-v1',
    },
    create: {
      id: sid(p, 221),
      companyId,
      reviewSessionId: sid(p, 220),
      referencedVersionIds: [sid(p, 202)],
      contentHash: 'epc-demo-snapshot-v1',
      capturedBy: adminUserId,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: sid(p, 212) },
    update: {
      name: names.designPackageLeadName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-05'),
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 212),
      packageCode: subtaskCode(p, 212),
      companyId,
      taskDisciplineId: sid(p, 200),
      name: names.designPackageLeadName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-05'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: sid(p, 213) },
    update: {},
    create: {
      id: sid(p, 213),
      companyId,
      designPackageId: sid(p, 212),
      engineeringDocumentVersionId: sid(p, 204),
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: sid(p, 226) },
    update: {
      status: ReviewSessionStatus.ACTIVE,
      assignedToUserId: LEAD_USER_ID,
      currentTier: ReviewTier.DISCIPLINE_LEAD,
      slaDeadlineAt: slaDaysFromNow(21),
      slaEscalatedAt: null,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 226),
      companyId,
      designPackageId: sid(p, 212),
      taskDisciplineId: sid(p, 200),
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.DISCIPLINE_LEAD,
      assignedToUserId: LEAD_USER_ID,
      openedAt: d('2026-03-06'),
      slaDeadlineAt: slaDaysFromNow(21),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: sid(p, 227) },
    update: {
      referencedVersionIds: [sid(p, 204)],
      contentHash: 'epc-demo-lead-snapshot-v1',
    },
    create: {
      id: sid(p, 227),
      companyId,
      reviewSessionId: sid(p, 226),
      referencedVersionIds: [sid(p, 204)],
      contentHash: 'epc-demo-lead-snapshot-v1',
      capturedBy: adminUserId,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: sid(p, 214) },
    update: {
      name: 'MEP Coordination - Draft Package',
      projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
      submittedAt: null,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 214),
      packageCode: subtaskCode(p, 214),
      companyId,
      taskDisciplineId: sid(p, 200),
      name: 'MEP Coordination - Draft Package',
      projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
      createdBy: ENGINEER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: sid(p, 206) },
    update: {},
    create: {
      id: sid(p, 206),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 4,
      fileKey: `demo/${projectCode}/MEP-Coordination-Rev-A.pdf`,
      fileSizeBytes: 445_000,
      changeNote: 'MEP coordination overlay',
    },
  });

  await prisma.engineeringDocument.upsert({
    where: { id: sid(p, 205) },
    update: { title: 'MEP Coordination Layout', updatedBy: adminUserId },
    create: {
      id: sid(p, 205),
      companyId,
      taskDisciplineId: sid(p, 200),
      documentType: EngineeringDocumentType.DRAWING,
      documentNumber: 'STR-MEP-001',
      title: 'MEP Coordination Layout',
      metadata: { sheet: 'M-301' },
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 207) },
    update: { status: EdvStatus.DRAFT, updatedBy: adminUserId },
    create: {
      id: sid(p, 207),
      companyId,
      engineeringDocumentId: sid(p, 205),
      documentVersionId: sid(p, 206),
      revisionLabel: 'A',
      status: EdvStatus.DRAFT,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: sid(p, 215) },
    update: {},
    create: {
      id: sid(p, 215),
      companyId,
      designPackageId: sid(p, 214),
      engineeringDocumentVersionId: sid(p, 207),
      sortOrder: 0,
      createdBy: ENGINEER_USER_ID,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: sid(p, 216) },
    update: {
      name: names.designPackageReviewerName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-10'),
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 216),
      packageCode: subtaskCode(p, 216),
      companyId,
      taskDisciplineId: sid(p, 200),
      name: names.designPackageReviewerName,
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-03-10'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: sid(p, 217) },
    update: {},
    create: {
      id: sid(p, 217),
      companyId,
      designPackageId: sid(p, 216),
      engineeringDocumentVersionId: sid(p, 202),
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: sid(p, 228) },
    update: {
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.REVIEWER,
      assignedToUserId: REVIEWER_USER_ID,
      slaDeadlineAt: slaDaysFromNow(18),
      slaEscalatedAt: null,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 228),
      companyId,
      designPackageId: sid(p, 216),
      taskDisciplineId: sid(p, 200),
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.REVIEWER,
      assignedToUserId: REVIEWER_USER_ID,
      openedAt: d('2026-03-11'),
      slaDeadlineAt: slaDaysFromNow(18),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: sid(p, 229) },
    update: {
      referencedVersionIds: [sid(p, 202)],
      contentHash: 'epc-demo-reviewer-snapshot-v1',
    },
    create: {
      id: sid(p, 229),
      companyId,
      reviewSessionId: sid(p, 228),
      referencedVersionIds: [sid(p, 202)],
      contentHash: 'epc-demo-reviewer-snapshot-v1',
      capturedBy: adminUserId,
    },
  });

  await prisma.reviewComment.upsert({
    where: { id: sid(p, 223) },
    update: {
      body: 'Verify anchor bolt projection matches structural grid.',
      status: CommentStatus.VERIFIED,
      resolutionNote: 'Anchor bolt projection aligned to structural grid in Rev B.',
      resolvedAt: d('2026-03-10'),
      verifiedAt: d('2026-03-11'),
      closedAt: null,
      updatedBy: REVIEWER_USER_ID,
    },
    create: {
      id: sid(p, 223),
      companyId,
      reviewSessionId: sid(p, 228),
      engineeringDocumentVersionId: sid(p, 202),
      body: 'Verify anchor bolt projection matches structural grid.',
      severity: CommentSeverity.MINOR,
      status: CommentStatus.VERIFIED,
      resolutionNote: 'Anchor bolt projection aligned to structural grid in Rev B.',
      resolvedAt: d('2026-03-10'),
      verifiedAt: d('2026-03-11'),
      assignedToUserId: ENGINEER_USER_ID,
      createdBy: OWNER_USER_ID,
      updatedBy: REVIEWER_USER_ID,
    },
  });

  await seedTaskDisciplineReviews(prisma, companyId, adminUserId, p, sid(p, 200), [
    { tier: ReviewTier.DISCIPLINE_OWNER, status: TaskDisciplineReviewStatus.IN_REVIEW },
    { tier: ReviewTier.REVIEWER, status: TaskDisciplineReviewStatus.IN_REVIEW },
    { tier: ReviewTier.DISCIPLINE_LEAD, status: TaskDisciplineReviewStatus.PENDING },
    { tier: ReviewTier.DEPT_CHIEF, status: TaskDisciplineReviewStatus.PENDING },
  ]);

  await seedWorkflowEvents(prisma, companyId, ENGINEER_USER_ID, [
    {
      id: sid(p, 240),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 202),
      action: 'CREATE_REVISION',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-02-28T09:00:00Z',
    },
    {
      id: sid(p, 241),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 202),
      action: 'SUBMIT_FOR_REVIEW',
      phase: WorkflowEventPhase.INTENT,
      createdAt: '2026-03-01T10:00:00Z',
    },
    {
      id: sid(p, 242),
      entityType: WorkflowEntityType.DesignPackage,
      entityId: sid(p, 210),
      action: 'PACKAGE_SUBMITTED',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-03-01T11:00:00Z',
    },
  ]);
}

/** DEMO-001 - Marina Tower: owner, reviewer - lead tiers each have an approvable inbox package. */
async function seedEpcProject001(ctx: PmSeedContext): Promise<void> {
  await seedEpcProjectStandard(ctx, 1, 'DEMO-001', {
    designPackageName: EPC_DEMO.designPackageName,
    designPackageLeadName: EPC_DEMO.designPackageLeadName,
    designPackageReviewerName: EPC_DEMO.designPackageReviewerName,
  });
}

/**
 * Seeds the standard EPC workflow on any project index (e.g. FULL-001 at index 4).
 */
export async function seedEpcStandardWorkflow(
  ctx: PmSeedContext,
  projectIndex: number,
  projectCode: string,
): Promise<void> {
  await seedEpcProjectStandard(ctx, projectIndex, projectCode, {
    designPackageName: `${projectCode} - Foundation Drawings Package`,
    designPackageLeadName: `${projectCode} - Structural Calculations Package`,
    designPackageReviewerName: `${projectCode} - Steel Connection Details Package`,
  });
}

/**
 * DEMO-002 - Airport Expansion: dept-chief governance tier + closed approved package.
 */
async function seedEpcProject002(ctx: PmSeedContext): Promise<void> {
  const { prisma, companyId, adminUserId } = ctx;
  const p = 2;
  const taskId = sid(p, 30);

  await prisma.taskDiscipline.upsert({
    where: { id: sid(p, 200) },
    update: {
      disciplineName: 'MEP',
      projectedStatus: TaskDisciplineProjectedStatus.PENDING_LEAD,
      designerUserId: ENGINEER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      disciplineOwnerName: 'Hassan Al-Rashid',
      reviewerUserId: REVIEWER_USER_ID,
      disciplineLeadUserId: LEAD_USER_ID,
      chiefUserId: DEPT_CHIEF_USER_ID,
      deptChiefEngineer: 'Rania Aziz',
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 200),
      taskId,
      companyId,
      disciplineName: 'MEP',
      projectedStatus: TaskDisciplineProjectedStatus.PENDING_LEAD,
      designerName: 'Sara Khalil',
      disciplineOwnerName: 'Hassan Al-Rashid',
      reviewerName: 'Nadia Saleh',
      disciplinaryLeader: 'Khalid Nasser',
      deptChiefEngineer: 'Rania Aziz',
      designerUserId: ENGINEER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      reviewerUserId: REVIEWER_USER_ID,
      disciplineLeadUserId: LEAD_USER_ID,
      chiefUserId: DEPT_CHIEF_USER_ID,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: sid(p, 203) },
    update: {},
    create: {
      id: sid(p, 203),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 1,
      fileKey: 'demo/DEMO-002/HVAC-Layout-Rev-A.pdf',
      fileSizeBytes: 640_000,
      changeNote: 'Terminal HVAC layout',
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: sid(p, 205) },
    update: {},
    create: {
      id: sid(p, 205),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 2,
      fileKey: 'demo/DEMO-002/Electrical-SLD-Rev-A.pdf',
      fileSizeBytes: 420_000,
      changeNote: 'Electrical single line diagram',
    },
  });

  await prisma.engineeringDocument.upsert({
    where: { id: sid(p, 201) },
    update: { title: 'Terminal HVAC Layout', updatedBy: adminUserId },
    create: {
      id: sid(p, 201),
      companyId,
      taskDisciplineId: sid(p, 200),
      documentType: EngineeringDocumentType.DRAWING,
      documentNumber: 'MEP-HVAC-001',
      title: 'Terminal HVAC Layout',
      metadata: { sheet: 'M-201' },
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocument.upsert({
    where: { id: sid(p, 202) },
    update: { title: 'Electrical Single Line Diagram', updatedBy: adminUserId },
    create: {
      id: sid(p, 202),
      companyId,
      taskDisciplineId: sid(p, 200),
      documentType: EngineeringDocumentType.DRAWING,
      documentNumber: 'MEP-ELE-001',
      title: 'Electrical Single Line Diagram',
      metadata: { sheet: 'E-101' },
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 204) },
    update: { status: EdvStatus.LOCKED, updatedBy: adminUserId },
    create: {
      id: sid(p, 204),
      companyId,
      engineeringDocumentId: sid(p, 201),
      documentVersionId: sid(p, 203),
      revisionLabel: 'A',
      status: EdvStatus.LOCKED,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 206) },
    update: { status: EdvStatus.APPROVED, updatedBy: adminUserId },
    create: {
      id: sid(p, 206),
      companyId,
      engineeringDocumentId: sid(p, 202),
      documentVersionId: sid(p, 205),
      revisionLabel: 'A',
      status: EdvStatus.APPROVED,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: sid(p, 210) },
    update: {
      name: 'Terminal MEP Release - Dept Review',
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-02-15'),
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 210),
      packageCode: subtaskCode(p, 210),
      companyId,
      taskDisciplineId: sid(p, 200),
      name: 'Terminal MEP Release - Dept Review',
      projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD,
      submittedAt: d('2026-02-15'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: sid(p, 211) },
    update: {},
    create: {
      id: sid(p, 211),
      companyId,
      designPackageId: sid(p, 210),
      engineeringDocumentVersionId: sid(p, 204),
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: sid(p, 230) },
    update: {
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.DEPT_CHIEF,
      assignedToUserId: DEPT_CHIEF_USER_ID,
      slaDeadlineAt: slaDaysFromNow(30),
      slaEscalatedAt: null,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 230),
      companyId,
      designPackageId: sid(p, 210),
      taskDisciplineId: sid(p, 200),
      status: ReviewSessionStatus.ACTIVE,
      currentTier: ReviewTier.DEPT_CHIEF,
      assignedToUserId: DEPT_CHIEF_USER_ID,
      openedAt: d('2026-02-20'),
      slaDeadlineAt: slaDaysFromNow(30),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: sid(p, 231) },
    update: {
      referencedVersionIds: [sid(p, 204)],
      contentHash: 'epc-demo-dept-snapshot-v1',
    },
    create: {
      id: sid(p, 231),
      companyId,
      reviewSessionId: sid(p, 230),
      referencedVersionIds: [sid(p, 204)],
      contentHash: 'epc-demo-dept-snapshot-v1',
      capturedBy: adminUserId,
    },
  });

  await prisma.reviewComment.upsert({
    where: { id: sid(p, 232) },
    update: {
      body: 'Confirm chilled water pipe sizing for concourse zone B.',
      status: CommentStatus.VERIFIED,
      resolutionNote: 'Pipe sizing confirmed against approved equipment schedule.',
      resolvedAt: d('2026-02-20'),
      verifiedAt: d('2026-02-21'),
      closedAt: null,
      updatedBy: DEPT_CHIEF_USER_ID,
    },
    create: {
      id: sid(p, 232),
      companyId,
      reviewSessionId: sid(p, 230),
      engineeringDocumentVersionId: sid(p, 204),
      body: 'Confirm chilled water pipe sizing for concourse zone B.',
      severity: CommentSeverity.MAJOR,
      status: CommentStatus.VERIFIED,
      resolutionNote: 'Pipe sizing confirmed against approved equipment schedule.',
      resolvedAt: d('2026-02-20'),
      verifiedAt: d('2026-02-21'),
      assignedToUserId: ENGINEER_USER_ID,
      createdBy: DEPT_CHIEF_USER_ID,
      updatedBy: DEPT_CHIEF_USER_ID,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: sid(p, 212) },
    update: {
      name: 'Electrical Single Line - Approved',
      projectedStatus: DesignPackageProjectedStatus.APPROVED,
      submittedAt: d('2026-01-10'),
      approvedAt: d('2026-02-01'),
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 212),
      packageCode: subtaskCode(p, 212),
      companyId,
      taskDisciplineId: sid(p, 200),
      name: 'Electrical Single Line - Approved',
      projectedStatus: DesignPackageProjectedStatus.APPROVED,
      submittedAt: d('2026-01-10'),
      approvedAt: d('2026-02-01'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: sid(p, 213) },
    update: {},
    create: {
      id: sid(p, 213),
      companyId,
      designPackageId: sid(p, 212),
      engineeringDocumentVersionId: sid(p, 206),
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: sid(p, 234) },
    update: {
      status: ReviewSessionStatus.APPROVED,
      outcome: ReviewSessionOutcome.APPROVED,
      currentTier: ReviewTier.DISCIPLINE_LEAD,
      assignedToUserId: LEAD_USER_ID,
      closedAt: d('2026-02-01'),
      updatedBy: LEAD_USER_ID,
    },
    create: {
      id: sid(p, 234),
      companyId,
      designPackageId: sid(p, 212),
      taskDisciplineId: sid(p, 200),
      status: ReviewSessionStatus.APPROVED,
      outcome: ReviewSessionOutcome.APPROVED,
      currentTier: ReviewTier.DISCIPLINE_LEAD,
      assignedToUserId: LEAD_USER_ID,
      openedAt: d('2026-01-15'),
      closedAt: d('2026-02-01'),
      createdBy: adminUserId,
      updatedBy: LEAD_USER_ID,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: sid(p, 235) },
    update: {
      referencedVersionIds: [sid(p, 206)],
      contentHash: 'epc-demo-approved-snapshot-v1',
    },
    create: {
      id: sid(p, 235),
      companyId,
      reviewSessionId: sid(p, 234),
      referencedVersionIds: [sid(p, 206)],
      contentHash: 'epc-demo-approved-snapshot-v1',
      capturedBy: LEAD_USER_ID,
    },
  });

  await prisma.reviewComment.upsert({
    where: { id: sid(p, 236) },
    update: {
      body: 'Load schedule matches approved equipment list.',
      status: CommentStatus.VERIFIED,
      resolutionNote: 'Equipment list cross-check complete.',
      resolvedAt: d('2026-01-28'),
      verifiedAt: d('2026-01-29'),
      closedAt: d('2026-02-01'),
      updatedBy: LEAD_USER_ID,
    },
    create: {
      id: sid(p, 236),
      companyId,
      reviewSessionId: sid(p, 234),
      engineeringDocumentVersionId: sid(p, 206),
      body: 'Load schedule matches approved equipment list.',
      severity: CommentSeverity.MINOR,
      status: CommentStatus.VERIFIED,
      resolutionNote: 'Equipment list cross-check complete.',
      resolvedAt: d('2026-01-28'),
      verifiedAt: d('2026-01-29'),
      closedAt: d('2026-02-01'),
      assignedToUserId: ENGINEER_USER_ID,
      createdBy: LEAD_USER_ID,
      updatedBy: LEAD_USER_ID,
    },
  });

  await prisma.designPackageDependency.upsert({
    where: { id: sid(p, 260) },
    update: {
      dependencyType: DesignPackageDependencyType.FINISH_TO_START,
    },
    create: {
      id: sid(p, 260),
      companyId,
      designPackageId: sid(p, 210),
      dependsOnPackageId: sid(p, 212),
      dependencyType: DesignPackageDependencyType.FINISH_TO_START,
      createdBy: adminUserId,
    },
  });

  await seedTaskDisciplineReviews(prisma, companyId, adminUserId, p, sid(p, 200), [
    {
      tier: ReviewTier.DISCIPLINE_OWNER,
      status: TaskDisciplineReviewStatus.APPROVED,
      reviewedBy: OWNER_USER_ID,
      reviewedAt: '2026-01-15',
    },
    {
      tier: ReviewTier.REVIEWER,
      status: TaskDisciplineReviewStatus.APPROVED,
      reviewedBy: REVIEWER_USER_ID,
      reviewedAt: '2026-01-20',
    },
    {
      tier: ReviewTier.DISCIPLINE_LEAD,
      status: TaskDisciplineReviewStatus.APPROVED,
      reviewedBy: LEAD_USER_ID,
      reviewedAt: '2026-02-01',
    },
    { tier: ReviewTier.DEPT_CHIEF, status: TaskDisciplineReviewStatus.IN_REVIEW },
  ]);

  await seedWorkflowEvents(prisma, companyId, LEAD_USER_ID, [
    {
      id: sid(p, 240),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 206),
      action: 'APPROVE_REVISION',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-02-01T14:00:00Z',
    },
    {
      id: sid(p, 241),
      entityType: WorkflowEntityType.DesignPackage,
      entityId: sid(p, 212),
      action: 'PACKAGE_APPROVED',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-02-01T15:00:00Z',
    },
  ]);
}

/**
 * DEMO-003 - Riverside Residential: locked package, issued design submittal, version history.
 */
async function seedEpcProject003(ctx: PmSeedContext): Promise<void> {
  const { prisma, companyId, adminUserId } = ctx;
  const p = 3;
  const taskId = sid(p, 30);
  const projectId = sid(p, 1);

  await prisma.taskDiscipline.upsert({
    where: { id: sid(p, 200) },
    update: {
      disciplineName: 'Civil',
      projectedStatus: TaskDisciplineProjectedStatus.APPROVED,
      designerUserId: ENGINEER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      disciplineOwnerName: 'Hassan Al-Rashid',
      reviewerUserId: REVIEWER_USER_ID,
      disciplineLeadUserId: LEAD_USER_ID,
      chiefUserId: DEPT_CHIEF_USER_ID,
      actualCompletionTime: d('2026-03-10'),
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 200),
      taskId,
      companyId,
      disciplineName: 'Civil',
      projectedStatus: TaskDisciplineProjectedStatus.APPROVED,
      designerName: 'Sara Khalil',
      disciplineOwnerName: 'Hassan Al-Rashid',
      reviewerName: 'Nadia Saleh',
      disciplinaryLeader: 'Khalid Nasser',
      deptChiefEngineer: 'Rania Aziz',
      designerUserId: ENGINEER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      reviewerUserId: REVIEWER_USER_ID,
      disciplineLeadUserId: LEAD_USER_ID,
      chiefUserId: DEPT_CHIEF_USER_ID,
      actualCompletionTime: d('2026-03-10'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: sid(p, 203) },
    update: {},
    create: {
      id: sid(p, 203),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 1,
      fileKey: 'demo/DEMO-003/Site-Grading-Rev-A.pdf',
      fileSizeBytes: 380_000,
      changeNote: 'Initial grading plan',
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: sid(p, 205) },
    update: {},
    create: {
      id: sid(p, 205),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 2,
      fileKey: 'demo/DEMO-003/Site-Grading-Rev-B.pdf',
      fileSizeBytes: 395_000,
      changeNote: 'Client comment incorporation',
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: sid(p, 207) },
    update: {},
    create: {
      id: sid(p, 207),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 3,
      fileKey: 'demo/DEMO-003/Site-Grading-Rev-C.pdf',
      fileSizeBytes: 410_000,
      changeNote: 'Issue for construction',
    },
  });

  await prisma.engineeringDocument.upsert({
    where: { id: sid(p, 201) },
    update: { title: 'Site Grading Plan', updatedBy: adminUserId },
    create: {
      id: sid(p, 201),
      companyId,
      taskDisciplineId: sid(p, 200),
      documentType: EngineeringDocumentType.DRAWING,
      documentNumber: 'CIV-GRD-001',
      title: 'Site Grading Plan',
      metadata: { sheet: 'C-100' },
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 202) },
    update: { status: EdvStatus.SUPERSEDED, updatedBy: adminUserId },
    create: {
      id: sid(p, 202),
      companyId,
      engineeringDocumentId: sid(p, 201),
      documentVersionId: sid(p, 203),
      revisionLabel: 'A',
      status: EdvStatus.SUPERSEDED,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 204) },
    update: { status: EdvStatus.APPROVED, updatedBy: adminUserId },
    create: {
      id: sid(p, 204),
      companyId,
      engineeringDocumentId: sid(p, 201),
      documentVersionId: sid(p, 205),
      revisionLabel: 'B',
      status: EdvStatus.APPROVED,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 206) },
    update: { status: EdvStatus.LOCKED, updatedBy: adminUserId },
    create: {
      id: sid(p, 206),
      companyId,
      engineeringDocumentId: sid(p, 201),
      documentVersionId: sid(p, 207),
      revisionLabel: 'C',
      status: EdvStatus.LOCKED,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackage.upsert({
    where: { id: sid(p, 210) },
    update: {
      name: 'Civil Issue Package - IFC',
      projectedStatus: DesignPackageProjectedStatus.APPROVED,
      submittedAt: d('2026-03-01'),
      approvedAt: d('2026-03-10'),
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 210),
      packageCode: subtaskCode(p, 210),
      companyId,
      taskDisciplineId: sid(p, 200),
      name: 'Civil Issue Package - IFC',
      projectedStatus: DesignPackageProjectedStatus.APPROVED,
      submittedAt: d('2026-03-01'),
      approvedAt: d('2026-03-10'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.designPackageItem.upsert({
    where: { id: sid(p, 211) },
    update: {},
    create: {
      id: sid(p, 211),
      companyId,
      designPackageId: sid(p, 210),
      engineeringDocumentVersionId: sid(p, 206),
      sortOrder: 0,
      createdBy: adminUserId,
    },
  });

  await prisma.reviewSession.upsert({
    where: { id: sid(p, 220) },
    update: {
      status: ReviewSessionStatus.APPROVED,
      outcome: ReviewSessionOutcome.APPROVED,
      currentTier: ReviewTier.DEPT_CHIEF,
      assignedToUserId: DEPT_CHIEF_USER_ID,
      closedAt: d('2026-03-10'),
      updatedBy: DEPT_CHIEF_USER_ID,
    },
    create: {
      id: sid(p, 220),
      companyId,
      designPackageId: sid(p, 210),
      taskDisciplineId: sid(p, 200),
      status: ReviewSessionStatus.APPROVED,
      outcome: ReviewSessionOutcome.APPROVED,
      currentTier: ReviewTier.DEPT_CHIEF,
      assignedToUserId: DEPT_CHIEF_USER_ID,
      openedAt: d('2026-03-02'),
      closedAt: d('2026-03-10'),
      createdBy: adminUserId,
      updatedBy: DEPT_CHIEF_USER_ID,
    },
  });

  await prisma.reviewContextSnapshot.upsert({
    where: { id: sid(p, 221) },
    update: {
      referencedVersionIds: [sid(p, 206)],
      contentHash: 'epc-demo-ifc-snapshot-v1',
    },
    create: {
      id: sid(p, 221),
      companyId,
      reviewSessionId: sid(p, 220),
      referencedVersionIds: [sid(p, 206)],
      contentHash: 'epc-demo-ifc-snapshot-v1',
      capturedBy: DEPT_CHIEF_USER_ID,
    },
  });

  await prisma.submittal.upsert({
    where: { id: sid(p, 55) },
    update: {
      title: 'Civil Design Issue - Site Grading IFC',
      status: SubmittalStatus.APPROVED,
      issuedAt: d('2026-03-12'),
      updatedBy: DOCS_USER_ID,
    },
    create: {
      id: sid(p, 55),
      projectId,
      submittedBy: DOCS_USER_ID,
      reviewedBy: PM_USER_ID,
      submittalNumber: 'SUB-DEMO-003-EPC-001',
      category: 'Design',
      title: 'Civil Design Issue - Site Grading IFC',
      contractor: 'Riverside JV',
      specReference: 'DIV 31 22 00',
      revisionNumber: 1,
      status: SubmittalStatus.APPROVED,
      submissionDate: d('2026-03-11'),
      reviewDate: d('2026-03-12'),
      issuedAt: d('2026-03-12'),
      createdBy: DOCS_USER_ID,
      updatedBy: DOCS_USER_ID,
    },
  });

  await prisma.submittalItem.upsert({
    where: { id: sid(p, 56) },
    update: {
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 206)],
      contentHash: 'epc-demo-submittal-snapshot-v1',
      capturedAt: d('2026-03-11'),
      capturedBy: DOCS_USER_ID,
    },
    create: {
      id: sid(p, 56),
      companyId,
      submittalId: sid(p, 55),
      designPackageId: sid(p, 210),
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 0,
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 206)],
      snapshotPayload: [
        {
          engineeringDocumentVersionId: sid(p, 206),
          revisionLabel: 'C',
          documentNumber: 'CIV-GRD-001',
          title: 'Site Grading Plan',
        },
      ],
      contentHash: 'epc-demo-submittal-snapshot-v1',
      capturedAt: d('2026-03-11'),
      capturedBy: DOCS_USER_ID,
      createdBy: DOCS_USER_ID,
    },
  });

  await seedTaskDisciplineReviews(prisma, companyId, adminUserId, p, sid(p, 200), [
    {
      tier: ReviewTier.DISCIPLINE_OWNER,
      status: TaskDisciplineReviewStatus.APPROVED,
      reviewedBy: OWNER_USER_ID,
      reviewedAt: '2026-03-02',
    },
    {
      tier: ReviewTier.REVIEWER,
      status: TaskDisciplineReviewStatus.APPROVED,
      reviewedBy: REVIEWER_USER_ID,
      reviewedAt: '2026-03-05',
    },
    {
      tier: ReviewTier.DISCIPLINE_LEAD,
      status: TaskDisciplineReviewStatus.APPROVED,
      reviewedBy: LEAD_USER_ID,
      reviewedAt: '2026-03-08',
    },
    {
      tier: ReviewTier.DEPT_CHIEF,
      status: TaskDisciplineReviewStatus.APPROVED,
      reviewedBy: DEPT_CHIEF_USER_ID,
      reviewedAt: '2026-03-10',
    },
  ]);

  await seedWorkflowEvents(prisma, companyId, ENGINEER_USER_ID, [
    {
      id: sid(p, 240),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 204),
      action: 'TRIGGER_REVISION',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-02-20T11:00:00Z',
    },
    {
      id: sid(p, 241),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 206),
      action: 'LOCK_REVISION',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-03-10T16:00:00Z',
    },
    {
      id: sid(p, 242),
      entityType: WorkflowEntityType.DesignPackage,
      entityId: sid(p, 210),
      action: 'PACKAGE_APPROVED',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-03-10T17:00:00Z',
    },
    {
      id: sid(p, 243),
      entityType: WorkflowEntityType.Submittal,
      entityId: sid(p, 55),
      action: 'SUBMITTAL_ISSUED',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-03-12T09:00:00Z',
    },
  ]);
}

/**
 * Seeds full EPC workflow data on DEMO-001, DEMO-002 - DEMO-003.
 */
export async function seedEpcDemoData(ctx: PmSeedContext): Promise<void> {
  const { prisma, companyId } = ctx;

  const projects = await prisma.project.findMany({
    where: { companyId, projectCode: { in: [...EPC_DEMO_PROJECT_CODES] } },
    select: { id: true, projectCode: true },
    orderBy: { projectCode: 'asc' },
  });

  if (projects.length < 3) {
    console.log('  EPC demo skipped - DEMO-001…003 projects not found');
    return;
  }

  await cleanupEpcDemoData(prisma, companyId);

  await seedEpcProject001(ctx);
  await seedEpcProject002(ctx);
  await seedEpcProject003(ctx);

  console.log('  EPC workflow demo seeded on 3 projects:');
  console.log('    DEMO-001 Marina Tower - discipline owner + reviewer + lead review active');
  console.log('    DEMO-002 Airport Expansion - dept chief governance review');
  console.log('    DEMO-003 Riverside Residential - issued design submittal');
}
