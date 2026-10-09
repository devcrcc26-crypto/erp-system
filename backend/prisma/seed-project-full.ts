import {
  CommentSeverity,
  CommentStatus,
  DeliverableStatus,
  DesignPackageDependencyType,
  EdvStatus,
  ExternalReviewTriggerStatus,
  ExternalReviewTriggerType,
  FolderContextType,
  PrismaClient,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
  ProjectContractType,
  ProjectStatus,
  ProjectType,
  ReviewSessionOutcome,
  ReviewSessionStatus,
  ReviewTier,
  SubmittalItemType,
  SubmittalPreparedByRole,
  SubmittalPurpose,
  SubmittalStatus,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { resolveSeedAdminPassword } from '../src/shared/script-guards/seed-admin-password';
import {
  type DemoProjectDef,
  type PmSeedContext,
  seedDemoUsers,
  seedProjectBundle,
} from './seed-pm-demo';
import { seedEpcStandardWorkflow, sid } from './seed-epc-demo';

const DEFAULT_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

export const FULL_PROJECT_INDEX = 4;
export const FULL_PROJECT_CODE = 'FULL-001';

export const FULL_PROJECT_DEF: DemoProjectDef = {
  index: FULL_PROJECT_INDEX,
  code: FULL_PROJECT_CODE,
  name: 'Full Seed Reference Project',
  location: 'Dubai South',
  projectType: 'COMMERCIAL' as ProjectType,
  status: 'IN_PROGRESS' as ProjectStatus,
  budget: 25_000_000,
  startDate: '2026-02-01',
  plannedFinishDate: '2028-03-31',
  contractType: ProjectContractType.CONTRACT,
};

const DOCS_USER_ID = '00000000-0000-4000-8000-000000000083';
const PM_USER_ID = '00000000-0000-4000-8000-000000000080';
const ENGINEER_USER_ID = '00000000-0000-4000-8000-000000000081';
const REVIEWER_USER_ID = '00000000-0000-4000-8000-000000000084';
const LEAD_USER_ID = '00000000-0000-4000-8000-000000000085';
const OWNER_USER_ID = '00000000-0000-4000-8000-000000000089';

function d(iso: string): Date {
  return new Date(iso);
}

/**
 * Loads seed context from an already-seeded foundation database.
 */
export async function buildPmSeedContextFromDb(
  prisma: PrismaClient,
): Promise<PmSeedContext> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
  const adminPassword = resolveSeedAdminPassword();

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: DEFAULT_COMPANY_ID },
  });

  const adminUser = await prisma.user.findUniqueOrThrow({
    where: {
      companyId_email: { companyId: company.id, email: adminEmail },
    },
  });

  const branch = await prisma.branch.findFirstOrThrow({
    where: { companyId: company.id, isHeadOffice: true },
  });

  const department = await prisma.department.findFirstOrThrow({
    where: { companyId: company.id },
  });

  const position = await prisma.position.findFirstOrThrow({
    where: { companyId: company.id },
  });

  const roles = await prisma.role.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true },
  });

  const roleMap = new Map(roles.map((role) => [role.name, role.id]));

  return {
    prisma,
    companyId: company.id,
    branchId: branch.id,
    departmentId: department.id,
    positionId: position.id,
    adminUserId: adminUser.id,
    roleMap,
    defaultPassword: adminPassword,
  };
}

/**
 * Removes prior FULL-001 data so re-seeding stays idempotent.
 */
export async function cleanupFullProject(ctx: PmSeedContext): Promise<void> {
  const { prisma, companyId } = ctx;
  const projectCode = FULL_PROJECT_CODE;

  const projects = await prisma.project.findMany({
    where: { companyId, projectCode },
    select: { id: true },
  });

  const projectIds = projects.map((row) => row.id);
  if (projectIds.length === 0) {
    return;
  }

  const taskIds = (
    await prisma.task.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const disciplineIds = (
    await prisma.taskDiscipline.findMany({
      where: {
        companyId,
        OR: [
          { taskId: { in: taskIds } },
          { id: sid(FULL_PROJECT_INDEX, 200) },
        ],
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  const packageIds = (
    await prisma.designPackage.findMany({
      where: { companyId, taskDisciplineId: { in: disciplineIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const sessionIds = (
    await prisma.reviewSession.findMany({
      where: {
        companyId,
        OR: [
          { taskDisciplineId: { in: disciplineIds } },
          { designPackageId: { in: packageIds } },
        ],
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  const edvIds = (
    await prisma.engineeringDocumentVersion.findMany({
      where: {
        companyId,
        engineeringDocument: { taskDisciplineId: { in: disciplineIds } },
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  const rfiIds = (
    await prisma.rfi.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const submittalIds = (
    await prisma.submittal.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const drawingIds = (
    await prisma.drawing.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const dailyLogIds = (
    await prisma.dailyLog.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const meetingIds = (
    await prisma.meeting.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const closeoutIds = (
    await prisma.closeout.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const folderIds = (
    await prisma.documentFolder.findMany({
      where: {
        companyId,
        contextType: FolderContextType.PROJECT,
        contextId: { in: projectIds },
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  const submittalAttachmentFolderIds =
    submittalIds.length > 0
      ? (
          await prisma.documentFolder.findMany({
            where: {
              companyId,
              contextType: FolderContextType.SUBMITTAL,
              contextId: { in: submittalIds },
            },
            select: { id: true },
          })
        ).map((row) => row.id)
      : [];

  const allFolderIds = [...folderIds, ...submittalAttachmentFolderIds];

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

  if (submittalIds.length > 0) {
    await prisma.submittalItem.deleteMany({
      where: { submittalId: { in: submittalIds } },
    });
    await prisma.submittalReview.deleteMany({
      where: { submittalId: { in: submittalIds } },
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

  if (disciplineIds.length > 0) {
    await prisma.deliverable.deleteMany({
      where: { taskDisciplineId: { in: disciplineIds } },
    });
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
  }

  await prisma.externalReviewTrigger.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await prisma.projectChangeRequest.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await prisma.deliverable.deleteMany({
    where: { projectId: { in: projectIds } },
  });

  if (taskIds.length > 0) {
    await prisma.taskDependency.deleteMany({
      where: {
        OR: [
          { predecessorTaskId: { in: taskIds } },
          { successorTaskId: { in: taskIds } },
        ],
      },
    });
  }

  if (rfiIds.length > 0) {
    await prisma.rfiResponse.deleteMany({ where: { rfiId: { in: rfiIds } } });
  }

  if (drawingIds.length > 0) {
    await prisma.drawingVersion.deleteMany({
      where: { drawingId: { in: drawingIds } },
    });
    await prisma.drawingLink.deleteMany({
      where: { drawingId: { in: drawingIds } },
    });
  }

  if (dailyLogIds.length > 0) {
    await prisma.dailyLogWorkforce.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogEquipment.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogVisitor.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogIncident.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
  }

  if (meetingIds.length > 0) {
    await prisma.meetingAgendaItem.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
    await prisma.meetingAttendee.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
    await prisma.actionItem.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
  }

  if (closeoutIds.length > 0) {
    await prisma.closeoutChecklistItem.deleteMany({
      where: { closeoutId: { in: closeoutIds } },
    });
    await prisma.warranty.deleteMany({
      where: { closeoutId: { in: closeoutIds } },
    });
  }

  if (allFolderIds.length > 0) {
    const documentIds = (
      await prisma.document.findMany({
        where: { folderId: { in: allFolderIds } },
        select: { id: true },
      })
    ).map((row) => row.id);

    const docVersionIds = [
      sid(FULL_PROJECT_INDEX, 14),
      sid(FULL_PROJECT_INDEX, 203),
      sid(FULL_PROJECT_INDEX, 206),
      sid(FULL_PROJECT_INDEX, 207),
      sid(FULL_PROJECT_INDEX, 291),
      sid(FULL_PROJECT_INDEX, 292),
      sid(FULL_PROJECT_INDEX, 293),
      sid(FULL_PROJECT_INDEX, 294),
      sid(FULL_PROJECT_INDEX, 295),
      sid(FULL_PROJECT_INDEX, 296),
      sid(FULL_PROJECT_INDEX, 68),
      sid(FULL_PROJECT_INDEX, 69),
    ];

    await prisma.engineeringDocumentVersion.deleteMany({
      where: { id: { in: [sid(FULL_PROJECT_INDEX, 296)] } },
    });

    await prisma.workflowEventLog.deleteMany({
      where: {
        companyId,
        id: {
          in: [297, 298, 299, 300, 301].map((n) => sid(FULL_PROJECT_INDEX, n)),
        },
      },
    });

    await prisma.documentVersion.deleteMany({
      where: { id: { in: docVersionIds } },
    });

    if (documentIds.length > 0) {
      await prisma.documentVersion.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    }
  }

  await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.milestone.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.rfi.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.submittal.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.drawing.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.dailyLog.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.meeting.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.correspondence.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await prisma.risk.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.issue.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.punchItem.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.closeout.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectTeam.deleteMany({ where: { projectId: { in: projectIds } } });

  if (allFolderIds.length > 0) {
    await prisma.documentFolder.deleteMany({ where: { id: { in: allFolderIds } } });
  }

  await prisma.project.deleteMany({ where: { id: { in: projectIds } }   });
}

/**
 * Document, submittal, external-release - review-inbox history for FULL-001.
 */
async function seedFullProjectRichHistory(
  ctx: PmSeedContext,
  projectId: string,
): Promise<void> {
  const { prisma, companyId, adminUserId } = ctx;
  const p = FULL_PROJECT_INDEX;
  const prefix = FULL_PROJECT_CODE;

  // ── General document version history ─────────────────────────────────────
  await prisma.documentVersion.upsert({
    where: { id: sid(p, 291) },
    update: {},
    create: {
      id: sid(p, 291),
      documentId: sid(p, 11),
      uploadedBy: adminUserId,
      versionNumber: 3,
      fileKey: `demo/${prefix}/Contract-Agreement-v3.pdf`,
      fileSizeBytes: 268_000,
      changeNote: 'Client markup incorporated',
    },
  });
  await prisma.documentVersion.upsert({
    where: { id: sid(p, 292) },
    update: {},
    create: {
      id: sid(p, 292),
      documentId: sid(p, 13),
      uploadedBy: DOCS_USER_ID,
      versionNumber: 1,
      fileKey: `demo/${prefix}/Project-Execution-Plan-v1.pdf`,
      fileSizeBytes: 312_000,
      changeNote: 'Baseline execution plan',
    },
  });
  await prisma.documentVersion.upsert({
    where: { id: sid(p, 293) },
    update: {},
    create: {
      id: sid(p, 293),
      documentId: sid(p, 12),
      uploadedBy: adminUserId,
      versionNumber: 1,
      fileKey: `demo/${prefix}/Site-Safety-Plan-v1.pdf`,
      fileSizeBytes: 198_000,
      changeNote: 'Initial safety plan upload',
    },
  });
  await prisma.documentVersion.upsert({
    where: { id: sid(p, 294) },
    update: {},
    create: {
      id: sid(p, 294),
      documentId: sid(p, 12),
      uploadedBy: DOCS_USER_ID,
      versionNumber: 2,
      fileKey: `demo/${prefix}/Site-Safety-Plan-v2.pdf`,
      fileSizeBytes: 205_000,
      changeNote: 'HSE audit comments addressed',
    },
  });
  await prisma.document.update({
    where: { id: sid(p, 12) },
    data: { version: 2, updatedBy: adminUserId },
  });
  await prisma.document.update({
    where: { id: sid(p, 13) },
    data: { version: 1, updatedBy: adminUserId },
  });

  // ── Engineering document revision chain + workflow history ───────────────
  await prisma.engineeringDocumentVersion.update({
    where: { id: sid(p, 202) },
    data: { status: EdvStatus.SUPERSEDED, updatedBy: adminUserId },
  });
  await prisma.engineeringDocumentVersion.update({
    where: { id: sid(p, 204) },
    data: { status: EdvStatus.APPROVED, updatedBy: adminUserId },
  });
  await prisma.documentVersion.upsert({
    where: { id: sid(p, 295) },
    update: {},
    create: {
      id: sid(p, 295),
      documentId: sid(p, 11),
      uploadedBy: ENGINEER_USER_ID,
      versionNumber: 5,
      fileKey: `demo/${prefix}/Foundation-Layout-Rev-C.pdf`,
      fileSizeBytes: 528_000,
      changeNote: 'Issue for construction',
    },
  });
  await prisma.engineeringDocumentVersion.upsert({
    where: { id: sid(p, 296) },
    update: { status: EdvStatus.LOCKED, updatedBy: adminUserId },
    create: {
      id: sid(p, 296),
      companyId,
      engineeringDocumentId: sid(p, 201),
      documentVersionId: sid(p, 295),
      revisionLabel: 'C',
      status: EdvStatus.LOCKED,
      createdBy: ENGINEER_USER_ID,
      updatedBy: adminUserId,
    },
  });
  await prisma.document.update({
    where: { id: sid(p, 11) },
    data: { version: 5, updatedBy: adminUserId },
  });

  const workflowEvents: Array<{
    id: string;
    entityType: WorkflowEntityType;
    entityId: string;
    action: string;
    phase: WorkflowEventPhase;
    createdAt: string;
    actorId: string;
  }> = [
    {
      id: sid(p, 297),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 202),
      action: 'CREATE_REVISION',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-02-20T09:00:00Z',
      actorId: ENGINEER_USER_ID,
    },
    {
      id: sid(p, 298),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 204),
      action: 'SUBMIT_FOR_REVIEW',
      phase: WorkflowEventPhase.INTENT,
      createdAt: '2026-02-25T10:00:00Z',
      actorId: ENGINEER_USER_ID,
    },
    {
      id: sid(p, 299),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 296),
      action: 'TRIGGER_REVISION',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-03-08T11:30:00Z',
      actorId: REVIEWER_USER_ID,
    },
    {
      id: sid(p, 300),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: sid(p, 296),
      action: 'LOCK_FOR_ISSUE',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-03-09T14:00:00Z',
      actorId: LEAD_USER_ID,
    },
    {
      id: sid(p, 301),
      entityType: WorkflowEntityType.DesignPackage,
      entityId: sid(p, 210),
      action: 'PACKAGE_RESUBMITTED',
      phase: WorkflowEventPhase.INTENT,
      createdAt: '2026-03-10T08:00:00Z',
      actorId: ENGINEER_USER_ID,
    },
  ];

  for (const event of workflowEvents) {
    await prisma.workflowEventLog.upsert({
      where: { id: event.id },
      update: {
        action: event.action,
        phase: event.phase,
        actorId: event.actorId,
      },
      create: {
        id: event.id,
        companyId,
        entityType: event.entityType,
        entityId: event.entityId,
        actorId: event.actorId,
        action: event.action,
        phase: event.phase,
        createdAt: d(event.createdAt),
      },
    });
  }

  // ── Submittal review history (construction submittals) ───────────────────
  await prisma.submittal.update({
    where: { id: sid(p, 50) },
    data: {
      taskDisciplineId: sid(p, 200),
      revisionNumber: 2,
      updatedBy: adminUserId,
    },
  });
  await prisma.submittalReview.upsert({
    where: { id: sid(p, 53) },
    update: {},
    create: {
      id: sid(p, 53),
      submittalId: sid(p, 50),
      reviewedBy: PM_USER_ID,
      revisionNumber: 1,
      status: SubmittalStatus.REVISE_AND_RESUBMIT,
      comments: 'Revise connection details at grid B4 - resubmit with markups.',
      reviewedAt: d('2026-02-08'),
      createdAt: d('2026-02-08'),
    },
  });
  await prisma.submittalReview.upsert({
    where: { id: sid(p, 54) },
    update: {},
    create: {
      id: sid(p, 54),
      submittalId: sid(p, 50),
      reviewedBy: PM_USER_ID,
      revisionNumber: 2,
      status: SubmittalStatus.UNDER_REVIEW,
      comments: 'Markup comments addressed - pending final sign-off.',
      reviewedAt: d('2026-02-22'),
      createdAt: d('2026-02-22'),
    },
  });
  await prisma.submittalReview.upsert({
    where: { id: sid(p, 59) },
    update: {},
    create: {
      id: sid(p, 59),
      submittalId: sid(p, 51),
      reviewedBy: PM_USER_ID,
      revisionNumber: 1,
      status: SubmittalStatus.APPROVED_WITH_COMMENTS,
      comments: 'Approved with minor field verification notes.',
      reviewedAt: d('2026-02-05'),
      createdAt: d('2026-02-05'),
    },
  });

  // ── In-construction submittals (site team) ───────────────────────────────
  const constructionSubmittalId = sid(p, 64);
  const constructionDraftSubmittalId = sid(p, 65);
  const constructionFolderId = sid(p, 66);
  const constructionDraftFolderId = sid(p, 67);
  const projectFolderId = sid(p, 10);

  await prisma.submittal.upsert({
    where: { id: constructionSubmittalId },
    update: {
      status: SubmittalStatus.UNDER_REVIEW,
      assignedTo: LEAD_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
    create: {
      id: constructionSubmittalId,
      projectId,
      taskDisciplineId: sid(p, 200),
      submittedBy: ENGINEER_USER_ID,
      assignedTo: LEAD_USER_ID,
      submittalNumber: `SUB-${prefix}-CON-001`,
      category: 'Field Installation',
      title: 'Pile cap rebar installation - as-built photos',
      submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
      preparedByRole: SubmittalPreparedByRole.SITE_TEAM,
      contractor: 'Gulf Foundations LLC',
      supplier: 'Emirates Rebar Supply',
      specReference: 'DIV 03 20 00',
      revisionNumber: 1,
      status: SubmittalStatus.UNDER_REVIEW,
      submissionDate: d('2026-03-12'),
      dueDate: d('2026-03-26'),
      createdBy: ENGINEER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });
  await prisma.submittal.upsert({
    where: { id: constructionDraftSubmittalId },
    update: {
      status: SubmittalStatus.DRAFT,
      updatedBy: ENGINEER_USER_ID,
    },
    create: {
      id: constructionDraftSubmittalId,
      projectId,
      taskDisciplineId: sid(p, 200),
      submittedBy: ENGINEER_USER_ID,
      submittalNumber: `SUB-${prefix}-CON-002`,
      category: 'Field Installation',
      title: 'MEP sleeve coordination - level 2 slab',
      submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
      preparedByRole: SubmittalPreparedByRole.SITE_TEAM,
      contractor: 'Gulf MEP Site Crew',
      specReference: 'DIV 23 05 00',
      revisionNumber: 1,
      status: SubmittalStatus.DRAFT,
      dueDate: d('2026-03-28'),
      createdBy: ENGINEER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });

  await prisma.documentFolder.upsert({
    where: { id: constructionFolderId },
    update: {},
    create: {
      id: constructionFolderId,
      companyId,
      parentId: projectFolderId,
      name: `SUB-${prefix}-CON-001`,
      path: `/projects/${projectId}/submittals/SUB-${prefix}-CON-001`,
      contextType: FolderContextType.SUBMITTAL,
      contextId: constructionSubmittalId,
      isSystem: true,
      createdBy: ENGINEER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });
  await prisma.documentFolder.upsert({
    where: { id: constructionDraftFolderId },
    update: {},
    create: {
      id: constructionDraftFolderId,
      companyId,
      parentId: projectFolderId,
      name: `SUB-${prefix}-CON-002`,
      path: `/projects/${projectId}/submittals/SUB-${prefix}-CON-002`,
      contextType: FolderContextType.SUBMITTAL,
      contextId: constructionDraftSubmittalId,
      isSystem: true,
      createdBy: ENGINEER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });

  await prisma.document.upsert({
    where: { id: sid(p, 68) },
    update: {},
    create: {
      id: sid(p, 68),
      folderId: constructionFolderId,
      companyId,
      name: 'Pile-cap-rebar-grid-A3.jpg',
      fileKey: `demo/${prefix}/submittals/pile-cap-rebar-grid-A3.jpg`,
      fileType: 'image/jpeg',
      fileSizeBytes: 1_240_000,
      version: 1,
      isCurrent: true,
      createdBy: ENGINEER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });
  await prisma.document.upsert({
    where: { id: sid(p, 69) },
    update: {},
    create: {
      id: sid(p, 69),
      folderId: constructionFolderId,
      companyId,
      name: 'Pile-cap-checklist-signed.pdf',
      fileKey: `demo/${prefix}/submittals/pile-cap-checklist-signed.pdf`,
      fileType: 'application/pdf',
      fileSizeBytes: 186_000,
      version: 1,
      isCurrent: true,
      createdBy: ENGINEER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });

  await prisma.submittalItem.upsert({
    where: { id: sid(p, 160) },
    update: {},
    create: {
      id: sid(p, 160),
      companyId,
      submittalId: constructionSubmittalId,
      designPackageId: sid(p, 210),
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 0,
      createdBy: ENGINEER_USER_ID,
    },
  });
  await prisma.submittalItem.upsert({
    where: { id: sid(p, 161) },
    update: {},
    create: {
      id: sid(p, 161),
      companyId,
      submittalId: constructionSubmittalId,
      designPackageId: sid(p, 214),
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 1,
      createdBy: ENGINEER_USER_ID,
    },
  });
  await prisma.submittalItem.upsert({
    where: { id: sid(p, 162) },
    update: {},
    create: {
      id: sid(p, 162),
      companyId,
      submittalId: constructionDraftSubmittalId,
      designPackageId: sid(p, 214),
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 0,
      createdBy: ENGINEER_USER_ID,
    },
  });

  await prisma.submittalReview.upsert({
    where: { id: sid(p, 163) },
    update: {},
    create: {
      id: sid(p, 163),
      submittalId: constructionSubmittalId,
      reviewedBy: LEAD_USER_ID,
      revisionNumber: 1,
      status: SubmittalStatus.UNDER_REVIEW,
      comments: 'Site photos received - verifying bar spacing against IFC drawing.',
      reviewedAt: d('2026-03-14'),
      createdAt: d('2026-03-14'),
    },
  });

  // ── External releases (site + consultant) ────────────────────────────────
  await prisma.submittal.upsert({
    where: { id: sid(p, 55) },
    update: {
      title: 'Structural IFC Issue - Site Release',
      status: SubmittalStatus.APPROVED,
      submittalPurpose: SubmittalPurpose.DISCIPLINE_SITE,
      issuedAt: d('2026-03-14T10:00:00Z'),
      updatedBy: DOCS_USER_ID,
    },
    create: {
      id: sid(p, 55),
      projectId,
      taskDisciplineId: sid(p, 200),
      submittedBy: DOCS_USER_ID,
      reviewedBy: PM_USER_ID,
      submittalNumber: `SUB-${prefix}-EXT-SITE-001`,
      category: 'Design',
      title: 'Structural IFC Issue - Site Release',
      submittalPurpose: SubmittalPurpose.DISCIPLINE_SITE,
      contractor: 'Full Seed JV',
      specReference: 'DIV 03 30 00',
      revisionNumber: 1,
      status: SubmittalStatus.APPROVED,
      submissionDate: d('2026-03-12'),
      reviewDate: d('2026-03-13'),
      issuedAt: d('2026-03-14T10:00:00Z'),
      createdBy: DOCS_USER_ID,
      updatedBy: DOCS_USER_ID,
    },
  });
  await prisma.submittalReview.upsert({
    where: { id: sid(p, 155) },
    update: {},
    create: {
      id: sid(p, 155),
      submittalId: sid(p, 55),
      reviewedBy: LEAD_USER_ID,
      revisionNumber: 1,
      status: SubmittalStatus.APPROVED,
      comments: 'Approved for site issue - no further comments.',
      reviewedAt: d('2026-03-13'),
      createdAt: d('2026-03-13'),
    },
  });
  await prisma.submittalItem.upsert({
    where: { id: sid(p, 58) },
    update: {
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 296)],
      contentHash: 'full-project-external-site-snapshot-v1',
      capturedAt: d('2026-03-13'),
      capturedBy: DOCS_USER_ID,
    },
    create: {
      id: sid(p, 58),
      companyId,
      submittalId: sid(p, 55),
      designPackageId: sid(p, 210),
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 0,
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 296)],
      contentHash: 'full-project-external-site-snapshot-v1',
      capturedAt: d('2026-03-13'),
      capturedBy: DOCS_USER_ID,
      createdBy: DOCS_USER_ID,
    },
  });

  await prisma.submittal.upsert({
    where: { id: sid(p, 57) },
    update: {
      title: 'Facade Coordination - Consultant Release',
      status: SubmittalStatus.APPROVED_WITH_COMMENTS,
      submittalPurpose: SubmittalPurpose.DISCIPLINE_CONSULTANT,
      issuedAt: d('2026-03-11T15:00:00Z'),
      updatedBy: DOCS_USER_ID,
    },
    create: {
      id: sid(p, 57),
      projectId,
      taskDisciplineId: sid(p, 200),
      submittedBy: DOCS_USER_ID,
      reviewedBy: PM_USER_ID,
      submittalNumber: `SUB-${prefix}-EXT-CON-001`,
      category: 'Design',
      title: 'Facade Coordination - Consultant Release',
      submittalPurpose: SubmittalPurpose.DISCIPLINE_CONSULTANT,
      contractor: 'Facade Partners LLC',
      specReference: 'DIV 08 44 00',
      revisionNumber: 2,
      status: SubmittalStatus.APPROVED_WITH_COMMENTS,
      submissionDate: d('2026-03-05'),
      reviewDate: d('2026-03-10'),
      issuedAt: d('2026-03-11T15:00:00Z'),
      createdBy: DOCS_USER_ID,
      updatedBy: DOCS_USER_ID,
    },
  });
  await prisma.submittalReview.upsert({
    where: { id: sid(p, 156) },
    update: {},
    create: {
      id: sid(p, 156),
      submittalId: sid(p, 57),
      reviewedBy: PM_USER_ID,
      revisionNumber: 1,
      status: SubmittalStatus.REVISE_AND_RESUBMIT,
      comments: 'Consultant requested anchor detail clarification.',
      reviewedAt: d('2026-02-28'),
      createdAt: d('2026-02-28'),
    },
  });
  await prisma.submittalReview.upsert({
    where: { id: sid(p, 157) },
    update: {},
    create: {
      id: sid(p, 157),
      submittalId: sid(p, 57),
      reviewedBy: REVIEWER_USER_ID,
      revisionNumber: 2,
      status: SubmittalStatus.APPROVED_WITH_COMMENTS,
      comments: 'Released to consultant with noted field verification items.',
      reviewedAt: d('2026-03-10'),
      createdAt: d('2026-03-10'),
    },
  });

  await prisma.externalReviewTrigger.upsert({
    where: { id: sid(p, 284) },
    update: { status: ExternalReviewTriggerStatus.PROCESSED },
    create: {
      id: sid(p, 284),
      companyId,
      projectId,
      triggerType: ExternalReviewTriggerType.SUBMITTAL_REVIEW,
      sourceEntityType: 'submittal',
      sourceEntityId: sid(p, 57),
      submittalId: sid(p, 57),
      submittalItemIds: [],
      payload: { submittalNumber: `SUB-${prefix}-EXT-CON-001` },
      status: ExternalReviewTriggerStatus.PROCESSED,
      createdBy: adminUserId,
    },
  });

  // ── Review inbox + closed review session history ─────────────────────────
  await prisma.reviewSession.upsert({
    where: { id: sid(p, 230) },
    update: {
      status: ReviewSessionStatus.RETURNED_FOR_REWORK,
      outcome: ReviewSessionOutcome.RETURNED,
      closedAt: d('2026-03-04T16:00:00Z'),
      closedReason: 'Designer to address reviewer comments before resubmission.',
      updatedBy: REVIEWER_USER_ID,
    },
    create: {
      id: sid(p, 230),
      companyId,
      designPackageId: sid(p, 214),
      taskDisciplineId: sid(p, 200),
      status: ReviewSessionStatus.RETURNED_FOR_REWORK,
      outcome: ReviewSessionOutcome.RETURNED,
      currentTier: ReviewTier.REVIEWER,
      assignedToUserId: REVIEWER_USER_ID,
      openedAt: d('2026-02-28T09:00:00Z'),
      closedAt: d('2026-03-04T16:00:00Z'),
      closedReason: 'Designer to address reviewer comments before resubmission.',
      createdBy: ENGINEER_USER_ID,
      updatedBy: REVIEWER_USER_ID,
    },
  });
  await prisma.reviewContextSnapshot.upsert({
    where: { id: sid(p, 231) },
    update: {
      referencedVersionIds: [sid(p, 207)],
      contentHash: 'full-project-returned-snapshot-v1',
    },
    create: {
      id: sid(p, 231),
      companyId,
      reviewSessionId: sid(p, 230),
      referencedVersionIds: [sid(p, 207)],
      contentHash: 'full-project-returned-snapshot-v1',
      capturedBy: REVIEWER_USER_ID,
    },
  });
  await prisma.reviewComment.upsert({
    where: { id: sid(p, 224) },
    update: {
      body: 'Clash with MEP routing at level 2 - revise coordination overlay.',
      status: CommentStatus.OPEN,
      updatedBy: REVIEWER_USER_ID,
    },
    create: {
      id: sid(p, 224),
      companyId,
      reviewSessionId: sid(p, 230),
      engineeringDocumentVersionId: sid(p, 207),
      body: 'Clash with MEP routing at level 2 - revise coordination overlay.',
      severity: CommentSeverity.MAJOR,
      status: CommentStatus.OPEN,
      assignedToUserId: ENGINEER_USER_ID,
      createdBy: REVIEWER_USER_ID,
      updatedBy: REVIEWER_USER_ID,
    },
  });
  await prisma.reviewComment.upsert({
    where: { id: sid(p, 225) },
    update: {
      body: 'Confirm grid line offsets match survey control.',
      status: CommentStatus.RESOLVED,
      resolutionNote: 'Offsets verified against survey report SR-2026-014.',
      resolvedAt: d('2026-03-09'),
      updatedBy: ENGINEER_USER_ID,
    },
    create: {
      id: sid(p, 225),
      companyId,
      reviewSessionId: sid(p, 228),
      engineeringDocumentVersionId: sid(p, 202),
      body: 'Confirm grid line offsets match survey control.',
      severity: CommentSeverity.MINOR,
      status: CommentStatus.RESOLVED,
      resolutionNote: 'Offsets verified against survey report SR-2026-014.',
      resolvedAt: d('2026-03-09'),
      assignedToUserId: ENGINEER_USER_ID,
      createdBy: OWNER_USER_ID,
      updatedBy: ENGINEER_USER_ID,
    },
  });
}

/**
 * Seeds EPC completion tables not covered by the standard workflow alone.
 */
async function seedFullProjectExtras(
  ctx: PmSeedContext,
  projectId: string,
): Promise<void> {
  const { prisma, companyId, adminUserId } = ctx;
  const p = FULL_PROJECT_INDEX;

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

  await prisma.externalReviewTrigger.upsert({
    where: { id: sid(p, 281) },
    update: {
      status: ExternalReviewTriggerStatus.PROCESSED,
    },
    create: {
      id: sid(p, 281),
      companyId,
      projectId,
      triggerType: ExternalReviewTriggerType.RFI,
      sourceEntityType: 'rfi',
      sourceEntityId: sid(p, 40),
      submittalId: sid(p, 50),
      submittalItemIds: [],
      payload: { rfiNumber: `RFI-${FULL_PROJECT_CODE}-001` },
      status: ExternalReviewTriggerStatus.PROCESSED,
      createdBy: adminUserId,
    },
  });

  await prisma.deliverable.upsert({
    where: { id: sid(p, 282) },
    update: {
      status: DeliverableStatus.IN_PROGRESS,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 282),
      companyId,
      projectId,
      taskDisciplineId: sid(p, 200),
      designPackageId: sid(p, 210),
      engineeringDocumentId: sid(p, 201),
      name: 'Foundation layout drawing package',
      status: DeliverableStatus.IN_PROGRESS,
      dueDate: d('2026-06-30'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.projectChangeRequest.upsert({
    where: { id: sid(p, 283) },
    update: {
      status: ProjectChangeRequestStatus.SUBMITTED,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 283),
      companyId,
      projectId,
      changeNumber: `CR-${FULL_PROJECT_CODE}-001`,
      title: 'RFI-driven reinforcement spacing clarification',
      description:
        'Formal change request raised from RFI response affecting pile cap detail at grid B4.',
      status: ProjectChangeRequestStatus.SUBMITTED,
      sourceType: ProjectChangeRequestSource.RFI,
      sourceEntityId: sid(p, 40),
      externalReviewTriggerId: sid(p, 281),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await prisma.submittalItem.upsert({
    where: { id: sid(p, 56) },
    update: {
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 202)],
      contentHash: 'full-project-submittal-snapshot-v1',
      capturedAt: d('2026-03-12'),
      capturedBy: DOCS_USER_ID,
    },
    create: {
      id: sid(p, 56),
      companyId,
      submittalId: sid(p, 50),
      designPackageId: sid(p, 210),
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 0,
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 202)],
      contentHash: 'full-project-submittal-snapshot-v1',
      capturedAt: d('2026-03-12'),
      capturedBy: DOCS_USER_ID,
      createdBy: DOCS_USER_ID,
    },
  });
}

/**
 * Creates FULL-001 with every project-scoped table populated.
 */
export async function seedFullProject(ctx: PmSeedContext): Promise<{
  projectId: string;
  projectCode: string;
}> {
  console.log(`Seeding full project ${FULL_PROJECT_CODE}...`);

  await cleanupFullProject(ctx);

  const users = await seedDemoUsers(ctx);
  const { projectId, projectCode } = await seedProjectBundle(
    ctx,
    FULL_PROJECT_DEF,
    users,
  );

  await seedEpcStandardWorkflow(ctx, FULL_PROJECT_INDEX, FULL_PROJECT_CODE);
  await seedFullProjectExtras(ctx, projectId);
  await seedFullProjectRichHistory(ctx, projectId);

  console.log(`  Full project seeded: ${projectCode} (${projectId})`);
  return { projectId, projectCode };
}
