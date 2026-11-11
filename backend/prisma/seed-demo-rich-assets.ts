import {
  CommentSeverity,
  CommentStatus,
  ExternalReviewTriggerStatus,
  ExternalReviewTriggerType,
  FolderContextType,
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
import type { SeedPdfEntry } from './seed-files/create-seed-pdfs';
import { ensureProjectAttachmentPdf } from './seed-files/create-seed-pdfs';
import { sid } from './seed-epc-demo';
import type { PmSeedContext } from './seed-pm-demo';

const U = {
  pm: '00000000-0000-4000-8000-000000000080',
  engineer: '00000000-0000-4000-8000-000000000081',
  docs: '00000000-0000-4000-8000-000000000083',
  reviewer: '00000000-0000-4000-8000-000000000084',
  lead: '00000000-0000-4000-8000-000000000085',
  deptChief: '00000000-0000-4000-8000-000000000086',
  owner: '00000000-0000-4000-8000-000000000089',
  consultant: '00000000-0000-4000-8000-00000000008a',
  designer: '00000000-0000-4000-8000-00000000008b',
  supportingDesigner: '00000000-0000-4000-8000-00000000008c',
} as const;

function d(iso: string): Date {
  return new Date(iso);
}

export type ProjectLifecycle = 'closed' | 'mid' | 'early';

export interface RichAssetsInput {
  ctx: PmSeedContext;
  p: number;
  projectId: string;
  projectCode: string;
  lifecycle: ProjectLifecycle;
  pdfRegistry: Map<string, SeedPdfEntry>;
  /** Primary discipline for submittals / releases */
  disciplineId: string;
  /** Primary design package for external release snapshots */
  primaryPackageId: string;
  /** Primary locked EDV for site release snapshots */
  primaryEdvId: string;
}

interface AttachmentDocSpec {
  documentId: string;
  docVersionId: string;
  folderId: string;
  fileName: string;
  changeNote: string;
  uploadedBy: string;
  versionNumber?: number;
}

/**
 * Creates Document + DocumentVersion rows backed by a real on-disk PDF.
 */
async function seedAttachmentDocument(
  input: RichAssetsInput,
  spec: AttachmentDocSpec,
): Promise<void> {
  const { ctx, p, projectCode, pdfRegistry } = input;
  const { prisma: db, companyId, adminUserId } = ctx;
  const entry = ensureProjectAttachmentPdf(projectCode, spec.fileName, pdfRegistry);
  const versionNumber = spec.versionNumber ?? 1;

  await db.document.upsert({
    where: { id: spec.documentId },
    update: {
      fileKey: entry.fileKey,
      fileType: 'application/pdf',
      fileSizeBytes: entry.fileSizeBytes,
      version: versionNumber,
      updatedBy: adminUserId,
    },
    create: {
      id: spec.documentId,
      folderId: spec.folderId,
      companyId,
      name: spec.fileName,
      fileKey: entry.fileKey,
      fileType: 'application/pdf',
      fileSizeBytes: entry.fileSizeBytes,
      version: versionNumber,
      isCurrent: true,
      isMandatory: false,
      expiryDate: d('2028-12-31'),
      createdBy: spec.uploadedBy,
      updatedBy: adminUserId,
    },
  });

  await db.documentVersion.upsert({
    where: { id: spec.docVersionId },
    update: {
      fileKey: entry.fileKey,
      fileSizeBytes: entry.fileSizeBytes,
      changeNote: spec.changeNote,
    },
    create: {
      id: spec.docVersionId,
      documentId: spec.documentId,
      uploadedBy: spec.uploadedBy,
      versionNumber,
      fileKey: entry.fileKey,
      fileSizeBytes: entry.fileSizeBytes,
      changeNote: spec.changeNote,
    },
  });
}

/**
 * Seeds construction submittals (IN_CONSTRUCTION) with real file attachments in submittal folders.
 */
async function seedConstructionSubmittals(input: RichAssetsInput): Promise<void> {
  const { ctx, p, projectId, projectCode, lifecycle, disciplineId } = input;
  const { prisma: db, companyId, adminUserId } = ctx;
  const prefix = projectCode.replace(/-/g, '');
  const projectFolderId = sid(p, 10);

  const constructionId = sid(p, 64);
  const constructionDraftId = sid(p, 65);
  const constructionFolderId = sid(p, 66);
  const constructionDraftFolderId = sid(p, 67);

  const constructionStatus =
    lifecycle === 'closed'
      ? SubmittalStatus.APPROVED
      : lifecycle === 'mid'
        ? SubmittalStatus.UNDER_REVIEW
        : SubmittalStatus.DRAFT;

  await db.submittal.upsert({
    where: { id: constructionId },
    update: {
      status: constructionStatus,
      assignedTo: lifecycle === 'mid' ? U.lead : U.pm,
      reviewedBy: lifecycle === 'closed' ? U.pm : null,
      reviewDate: lifecycle === 'closed' ? d('2025-04-10') : null,
      issuedAt: lifecycle === 'closed' ? d('2025-04-12T10:00:00Z') : null,
      updatedBy: U.engineer,
    },
    create: {
      id: constructionId,
      projectId,
      taskDisciplineId: disciplineId,
      submittedBy: U.engineer,
      assignedTo: lifecycle === 'mid' ? U.lead : U.pm,
      reviewedBy: lifecycle === 'closed' ? U.pm : null,
      submittalNumber: `SUB-${prefix}-CON-001`,
      category: 'Field Installation',
      title: 'Pile cap rebar installation - as-built documentation',
      submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
      preparedByRole: SubmittalPreparedByRole.SITE_TEAM,
      contractor: 'Gulf Foundations Site Crew',
      supplier: 'Emirates Rebar Supply',
      specReference: 'DIV 03 20 00',
      revisionNumber: lifecycle === 'closed' ? 2 : 1,
      status: constructionStatus,
      submissionDate: d('2026-03-12'),
      dueDate: d('2026-03-26'),
      reviewDate: lifecycle === 'closed' ? d('2025-04-10') : null,
      issuedAt: lifecycle === 'closed' ? d('2025-04-12T10:00:00Z') : null,
      createdBy: U.engineer,
      updatedBy: U.engineer,
    },
  });

  await db.submittal.upsert({
    where: { id: constructionDraftId },
    update: { status: SubmittalStatus.DRAFT, updatedBy: U.engineer },
    create: {
      id: constructionDraftId,
      projectId,
      taskDisciplineId: disciplineId,
      submittedBy: U.engineer,
      submittalNumber: `SUB-${prefix}-CON-002`,
      category: 'Field Installation',
      title: 'MEP sleeve coordination - level 2 slab penetration log',
      submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
      preparedByRole: SubmittalPreparedByRole.SITE_TEAM,
      contractor: 'Gulf MEP Site Crew',
      specReference: 'DIV 23 05 00',
      revisionNumber: 1,
      status: SubmittalStatus.DRAFT,
      dueDate: d('2026-04-05'),
      createdBy: U.engineer,
      updatedBy: U.engineer,
    },
  });

  for (const [folderId, submittalId, folderName] of [
    [constructionFolderId, constructionId, `SUB-${prefix}-CON-001`],
    [constructionDraftFolderId, constructionDraftId, `SUB-${prefix}-CON-002`],
  ] as const) {
    await db.documentFolder.upsert({
      where: { id: folderId },
      update: {},
      create: {
        id: folderId,
        companyId,
        parentId: projectFolderId,
        name: folderName,
        path: `/projects/${projectId}/submittals/${folderName}`,
        contextType: FolderContextType.SUBMITTAL,
        contextId: submittalId,
        isSystem: true,
        createdBy: U.engineer,
        updatedBy: adminUserId,
      },
    });
  }

  await seedAttachmentDocument(input, {
    documentId: sid(p, 181),
    docVersionId: sid(p, 481),
    folderId: constructionFolderId,
    fileName: 'Submittal-Site-As-Built-Photos.pdf',
    changeNote: 'Grid A3 pile cap - bar spacing and cover photos',
    uploadedBy: U.engineer,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 182),
    docVersionId: sid(p, 482),
    folderId: constructionFolderId,
    fileName: 'Construction-Checklist-Signed.pdf',
    changeNote: 'Signed QA checklist by site engineer',
    uploadedBy: U.engineer,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 183),
    docVersionId: sid(p, 483),
    folderId: constructionDraftFolderId,
    fileName: 'Site-Installation-Photo-Report.pdf',
    changeNote: 'Draft sleeve locations pending survey confirmation',
    uploadedBy: U.engineer,
  });

  if (lifecycle !== 'early') {
    await db.submittalReview.upsert({
      where: { id: sid(p, 163) },
      update: {},
      create: {
        id: sid(p, 163),
        submittalId: constructionId,
        reviewedBy: U.lead,
        revisionNumber: 1,
        status:
          lifecycle === 'closed'
            ? SubmittalStatus.APPROVED
            : SubmittalStatus.UNDER_REVIEW,
        comments:
          lifecycle === 'closed'
            ? 'As-built photos match IFC drawing S-104. Approved for record.'
            : 'Site photos received - verifying bar spacing against IFC drawing.',
        reviewedAt: d(lifecycle === 'closed' ? '2025-04-10' : '2026-03-14'),
        createdAt: d(lifecycle === 'closed' ? '2025-04-10' : '2026-03-14'),
      },
    });
  }

  if (lifecycle === 'closed') {
    await db.submittalReview.upsert({
      where: { id: sid(p, 164) },
      update: {},
      create: {
        id: sid(p, 164),
        submittalId: constructionId,
        reviewedBy: U.pm,
        revisionNumber: 2,
        status: SubmittalStatus.APPROVED,
        comments: 'Final sign-off - record filed in closeout archive.',
        reviewedAt: d('2025-04-11'),
        createdAt: d('2025-04-11'),
      },
    });
  }

  console.log(`✓ Created construction submittals with file attachments for ${projectCode}`);
}

/**
 * Seeds external releases (site + consultant) with issued submittals and EDV snapshots.
 */
async function seedExternalReleases(input: RichAssetsInput): Promise<void> {
  const { ctx, p, projectId, projectCode, lifecycle, disciplineId, primaryPackageId, primaryEdvId } =
    input;
  const { prisma: db, companyId, adminUserId } = ctx;
  const prefix = projectCode.replace(/-/g, '');

  if (lifecycle === 'early') {
    console.log(`✓ Skipped external releases for early-stage ${projectCode}`);
    return;
  }

  const siteReleaseId = sid(p, 55);
  const consultantReleaseId = sid(p, 57);

  await db.submittal.upsert({
    where: { id: siteReleaseId },
    update: {
      status: SubmittalStatus.APPROVED,
      issuedAt: d('2026-03-14T10:00:00Z'),
      updatedBy: U.docs,
    },
    create: {
      id: siteReleaseId,
      projectId,
      taskDisciplineId: disciplineId,
      submittedBy: U.docs,
      reviewedBy: U.pm,
      submittalNumber: `SUB-${prefix}-EXT-SITE-001`,
      category: 'Design',
      title: 'Structural IFC issue - site release package',
      submittalPurpose: SubmittalPurpose.DISCIPLINE_SITE,
      contractor: `${projectCode} JV`,
      specReference: 'DIV 03 30 00',
      revisionNumber: 1,
      status: SubmittalStatus.APPROVED,
      submissionDate: d('2026-03-12'),
      reviewDate: d('2026-03-13'),
      issuedAt: d('2026-03-14T10:00:00Z'),
      createdBy: U.docs,
      updatedBy: U.docs,
    },
  });

  await db.submittalReview.upsert({
    where: { id: sid(p, 155) },
    update: {},
    create: {
      id: sid(p, 155),
      submittalId: siteReleaseId,
      reviewedBy: U.lead,
      revisionNumber: 1,
      status: SubmittalStatus.APPROVED,
      comments: 'Approved for site issue - no further comments.',
      reviewedAt: d('2026-03-13'),
      createdAt: d('2026-03-13'),
    },
  });

  await db.submittalItem.upsert({
    where: { id: sid(p, 58) },
    update: {
      snapshotCaptured: true,
      snapshotEdvIds: [primaryEdvId],
      contentHash: `${projectCode}-external-site-snapshot-v1`,
      capturedAt: d('2026-03-13'),
      capturedBy: U.docs,
      snapshotPayload: [
        {
          edvId: primaryEdvId,
          revisionLabel: 'C',
          documentNumber: 'STR-IFC-001',
          title: 'Structural IFC - site issue',
        },
      ],
    },
    create: {
      id: sid(p, 58),
      companyId,
      submittalId: siteReleaseId,
      designPackageId: primaryPackageId,
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 0,
      snapshotCaptured: true,
      snapshotEdvIds: [primaryEdvId],
      contentHash: `${projectCode}-external-site-snapshot-v1`,
      capturedAt: d('2026-03-13'),
      capturedBy: U.docs,
      snapshotPayload: [
        {
          edvId: primaryEdvId,
          revisionLabel: 'C',
          documentNumber: 'STR-IFC-001',
          title: 'Structural IFC - site issue',
        },
      ],
      createdBy: U.docs,
    },
  });

  await seedAttachmentDocument(input, {
    documentId: sid(p, 184),
    docVersionId: sid(p, 484),
    folderId: sid(p, 16),
    fileName: 'External-Release-Site-Transmittal.pdf',
    changeNote: `Site release transmittal cover - ${projectCode}`,
    uploadedBy: U.docs,
  });

  const consultantStatus =
    lifecycle === 'closed'
      ? SubmittalStatus.APPROVED
      : SubmittalStatus.APPROVED_WITH_COMMENTS;

  await db.submittal.upsert({
    where: { id: consultantReleaseId },
    update: {
      status: consultantStatus,
      issuedAt: d('2026-03-11T15:00:00Z'),
      updatedBy: U.docs,
    },
    create: {
      id: consultantReleaseId,
      projectId,
      taskDisciplineId: disciplineId,
      submittedBy: U.docs,
      reviewedBy: U.consultant,
      submittalNumber: `SUB-${prefix}-EXT-CON-001`,
      category: 'Design',
      title: 'Facade coordination - consultant release package',
      submittalPurpose: SubmittalPurpose.DISCIPLINE_CONSULTANT,
      contractor: 'Facade Partners LLC',
      specReference: 'DIV 08 44 00',
      revisionNumber: 2,
      status: consultantStatus,
      submissionDate: d('2026-03-05'),
      reviewDate: d('2026-03-10'),
      issuedAt: d('2026-03-11T15:00:00Z'),
      createdBy: U.docs,
      updatedBy: U.docs,
    },
  });

  await db.submittalReview.upsert({
    where: { id: sid(p, 156) },
    update: {},
    create: {
      id: sid(p, 156),
      submittalId: consultantReleaseId,
      reviewedBy: U.pm,
      revisionNumber: 1,
      status: SubmittalStatus.REVISE_AND_RESUBMIT,
      comments: 'Consultant requested anchor detail clarification at grid B4.',
      reviewedAt: d('2026-02-28'),
      createdAt: d('2026-02-28'),
    },
  });

  await db.submittalReview.upsert({
    where: { id: sid(p, 157) },
    update: {},
    create: {
      id: sid(p, 157),
      submittalId: consultantReleaseId,
      reviewedBy: U.reviewer,
      revisionNumber: 2,
      status: consultantStatus,
      comments: 'Released to consultant with noted field verification items.',
      reviewedAt: d('2026-03-10'),
      createdAt: d('2026-03-10'),
    },
  });

  await seedAttachmentDocument(input, {
    documentId: sid(p, 185),
    docVersionId: sid(p, 485),
    folderId: sid(p, 16),
    fileName: 'External-Release-Consultant-Cover.pdf',
    changeNote: 'Consultant transmittal letter and distribution list',
    uploadedBy: U.docs,
  });

  await db.externalReviewTrigger.upsert({
    where: { id: sid(p, 288) },
    update: { status: ExternalReviewTriggerStatus.PROCESSED },
    create: {
      id: sid(p, 288),
      companyId,
      projectId,
      triggerType: ExternalReviewTriggerType.SUBMITTAL_REVIEW,
      sourceEntityType: 'submittal',
      sourceEntityId: consultantReleaseId,
      submittalId: consultantReleaseId,
      submittalItemIds: [],
      linkedDesignPackageId: primaryPackageId,
      payload: { submittalNumber: `SUB-${prefix}-EXT-CON-001`, releaseType: 'CONSULTANT' },
      status: ExternalReviewTriggerStatus.PROCESSED,
      createdBy: adminUserId,
    },
  });

  console.log(`✓ Created external releases (site + consultant) for ${projectCode}`);
}

/**
 * Seeds review inbox history: superseded sessions, comment file attachments, tier markups.
 */
async function seedReviewInboxHistory(input: RichAssetsInput): Promise<void> {
  const { ctx, p, projectCode, lifecycle, disciplineId, primaryPackageId, primaryEdvId } = input;
  const { prisma: db, companyId, adminUserId } = ctx;

  const activeSessionId =
    lifecycle === 'early' ? sid(p, 220) : lifecycle === 'mid' ? sid(p, 222) : sid(p, 220);
  const historicalPackageId = primaryPackageId;

  // ── Superseded session (prior submission cycle) ──────────────────────────
  if (lifecycle !== 'early') {
    await db.reviewSession.upsert({
      where: { id: sid(p, 230) },
      update: {
        status: ReviewSessionStatus.SUPERSEDED,
        outcome: ReviewSessionOutcome.SUPERSEDED,
        closedAt: d('2026-01-10T16:00:00Z'),
        closedReason: 'Superseded by resubmission after designer rework.',
        updatedBy: U.designer,
      },
      create: {
        id: sid(p, 230),
        companyId,
        designPackageId: historicalPackageId,
        taskDisciplineId: disciplineId,
        status: ReviewSessionStatus.SUPERSEDED,
        outcome: ReviewSessionOutcome.SUPERSEDED,
        currentTier: ReviewTier.REVIEWER,
        assignedToUserId: U.reviewer,
        openedAt: d('2025-12-20T09:00:00Z'),
        closedAt: d('2026-01-10T16:00:00Z'),
        closedReason: 'Superseded by resubmission after designer rework.',
        createdBy: U.designer,
        updatedBy: U.designer,
      },
    });

    await db.reviewContextSnapshot.upsert({
      where: { reviewSessionId: sid(p, 230) },
      update: {
        referencedVersionIds: [primaryEdvId],
        contentHash: `${projectCode}-superseded-snapshot-v1`,
      },
      create: {
        id: sid(p, 231),
        companyId,
        reviewSessionId: sid(p, 230),
        referencedVersionIds: [primaryEdvId],
        contentHash: `${projectCode}-superseded-snapshot-v1`,
        capturedBy: U.reviewer,
      },
    });
  }

  // ── Returned session with full comment lifecycle + file attachments ──────
  const returnedSessionId = lifecycle === 'mid' ? sid(p, 223) : sid(p, 232);
  if (lifecycle !== 'early') {
    await db.reviewSession.upsert({
      where: { id: returnedSessionId },
      update: {
        status: ReviewSessionStatus.RETURNED_FOR_REWORK,
        outcome: ReviewSessionOutcome.RETURNED,
        closedAt: d('2026-02-15T16:00:00Z'),
        closedReason: 'Designer to address reviewer comments before resubmission.',
        updatedBy: U.reviewer,
      },
      create: {
        id: returnedSessionId,
        companyId,
        designPackageId: historicalPackageId,
        taskDisciplineId: disciplineId,
        status: ReviewSessionStatus.RETURNED_FOR_REWORK,
        outcome: ReviewSessionOutcome.RETURNED,
        currentTier: ReviewTier.REVIEWER,
        assignedToUserId: U.reviewer,
        openedAt: d('2026-01-28T09:00:00Z'),
        closedAt: d('2026-02-15T16:00:00Z'),
        closedReason: 'Designer to address reviewer comments before resubmission.',
        slaDeadlineAt: d('2026-02-05T17:00:00Z'),
        slaEscalatedAt: d('2026-02-06T09:00:00Z'),
        createdBy: U.designer,
        updatedBy: U.reviewer,
      },
    });

    await db.reviewContextSnapshot.upsert({
      where: { reviewSessionId: returnedSessionId },
      update: {
        referencedVersionIds: [primaryEdvId],
        contentHash: `${projectCode}-returned-snapshot-v1`,
      },
      create: {
        id: sid(p, 233),
        companyId,
        reviewSessionId: returnedSessionId,
        referencedVersionIds: [primaryEdvId],
        contentHash: `${projectCode}-returned-snapshot-v1`,
        capturedBy: U.reviewer,
      },
    });
  }

  // ── Attachment documents for comments and sessions ───────────────────────
  await seedAttachmentDocument(input, {
    documentId: sid(p, 186),
    docVersionId: sid(p, 486),
    folderId: sid(p, 16),
    fileName: 'Reviewer-Markup-Grid-B4.pdf',
    changeNote: 'Redline markup - reinforcement spacing at grid B4',
    uploadedBy: U.reviewer,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 187),
    docVersionId: sid(p, 487),
    folderId: sid(p, 16),
    fileName: 'Designer-Response-Memo.pdf',
    changeNote: 'Designer response memo addressing reviewer comments',
    uploadedBy: U.designer,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 188),
    docVersionId: sid(p, 488),
    folderId: sid(p, 16),
    fileName: 'Session-Tier1-Owner-Markup.pdf',
    changeNote: 'Discipline owner tier markup - session attachment',
    uploadedBy: U.owner,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 189),
    docVersionId: sid(p, 489),
    folderId: sid(p, 16),
    fileName: 'Session-Tier2-Reviewer-Redlines.pdf',
    changeNote: 'Reviewer tier redlines on coordination drawing',
    uploadedBy: U.reviewer,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 190),
    docVersionId: sid(p, 490),
    folderId: sid(p, 16),
    fileName: 'Session-Tier3-Lead-Approval.pdf',
    changeNote: 'Discipline lead approval stamp and sign-off sheet',
    uploadedBy: U.lead,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 191),
    docVersionId: sid(p, 491),
    folderId: sid(p, 16),
    fileName: 'Package-Brief-Coordination-Supplement.pdf',
    changeNote: 'Supplementary coordination brief attached to design package',
    uploadedBy: U.designer,
  });
  await seedAttachmentDocument(input, {
    documentId: sid(p, 192),
    docVersionId: sid(p, 492),
    folderId: sid(p, 16),
    fileName: 'Comment-Resolution-Photo-Evidence.pdf',
    changeNote: 'Photo evidence supporting comment resolution',
    uploadedBy: U.engineer,
  });

  // ── Package + session attachments (dedicated PDFs) ───────────────────────
  await db.designPackageAttachment.upsert({
    where: { id: sid(p, 1450) },
    update: {
      purpose: 'COORDINATION_BRIEF',
      note: 'Supplementary MEP/architecture coordination notes for lead review.',
    },
    create: {
      id: sid(p, 1450),
      companyId,
      designPackageId: primaryPackageId,
      documentId: sid(p, 191),
      attachedBy: U.designer,
      purpose: 'COORDINATION_BRIEF',
      note: 'Supplementary MEP/architecture coordination notes for lead review.',
    },
  });

  await db.designPackageAttachment.upsert({
    where: { id: sid(p, 1451) },
    update: {
      purpose: 'REFERENCE_DRAWING',
      note: 'Previous issue reference for rework comparison.',
    },
    create: {
      id: sid(p, 1451),
      companyId,
      designPackageId: primaryPackageId,
      documentId: sid(p, 186),
      attachedBy: U.supportingDesigner,
      purpose: 'REFERENCE_DRAWING',
      note: 'Previous issue reference for rework comparison.',
    },
  });

  for (const [entity, tier, docId, userId, purpose] of [
    [1452, ReviewTier.DISCIPLINE_OWNER, sid(p, 188), U.owner, 'OWNER_MARKUP'],
    [1453, ReviewTier.REVIEWER, sid(p, 189), U.reviewer, 'REVIEWER_REDLINES'],
    [1454, ReviewTier.DISCIPLINE_LEAD, sid(p, 190), U.lead, 'LEAD_APPROVAL'],
  ] as const) {
    await db.reviewSessionAttachment.upsert({
      where: { id: sid(p, entity) },
      update: { purpose, note: `${purpose} attachment for ${projectCode}` },
      create: {
        id: sid(p, entity),
        companyId,
        reviewSessionId: activeSessionId,
        tier,
        attachedByUserId: userId,
        documentId: docId,
        purpose,
        note: `${purpose} attachment for ${projectCode}`,
      },
    });
  }

  // ── Comments with markup + response file attachments ─────────────────────
  const commentSpecs: Array<{
    id: string;
    sessionId: string;
    body: string;
    severity: CommentSeverity;
    status: CommentStatus;
    assignedTo: string;
    createdBy: string;
    commentDocVersionId?: string;
    responseDocVersionId?: string;
    resolvedAt?: string;
    resolutionNote?: string;
    verifiedAt?: string;
    closedAt?: string;
  }> = [];

  if (lifecycle === 'early') {
    commentSpecs.push({
      id: sid(p, 610),
      sessionId: activeSessionId,
      body: 'Confirm pile cap reinforcement cover meets specification Section 03 20 00.',
      severity: CommentSeverity.MAJOR,
      status: CommentStatus.OPEN,
      assignedTo: U.designer,
      createdBy: U.owner,
      commentDocVersionId: sid(p, 486),
    });
  } else if (lifecycle === 'mid') {
    commentSpecs.push(
      {
        id: sid(p, 611),
        sessionId: returnedSessionId,
        body: 'Clash with MEP routing at level 2 - revise coordination overlay.',
        severity: CommentSeverity.MAJOR,
        status: CommentStatus.OPEN,
        assignedTo: U.designer,
        createdBy: U.reviewer,
        commentDocVersionId: sid(p, 489),
      },
      {
        id: sid(p, 612),
        sessionId: returnedSessionId,
        body: 'Confirm grid line offsets match survey control points SR-2026-014.',
        severity: CommentSeverity.MINOR,
        status: CommentStatus.RESOLVED,
        assignedTo: U.designer,
        createdBy: U.owner,
        commentDocVersionId: sid(p, 486),
        responseDocVersionId: sid(p, 487),
        resolvedAt: '2026-02-10',
        resolutionNote: 'Offsets verified against survey report SR-2026-014.',
      },
      {
        id: sid(p, 613),
        sessionId: activeSessionId,
        body: 'Fire damper locations missing at corridor crossings L12.',
        severity: CommentSeverity.MODERATE,
        status: CommentStatus.VERIFIED,
        assignedTo: U.supportingDesigner,
        createdBy: U.lead,
        commentDocVersionId: sid(p, 489),
        responseDocVersionId: sid(p, 492),
        resolvedAt: '2026-02-20',
        resolutionNote: 'Dampers added per NFPA 90A coordination sheet.',
        verifiedAt: '2026-02-22',
      },
      {
        id: sid(p, 614),
        sessionId: activeSessionId,
        body: 'Equipment schedule cross-reference to approved vendor list.',
        severity: CommentSeverity.MINOR,
        status: CommentStatus.CLOSED,
        assignedTo: U.designer,
        createdBy: U.reviewer,
        resolvedAt: '2026-01-30',
        resolutionNote: 'Schedule matches approved equipment list EQ-2026-08.',
        verifiedAt: '2026-02-01',
        closedAt: '2026-02-02',
      },
      {
        id: sid(p, 615),
        sessionId: sid(p, 230),
        body: 'Superseded session comment - anchor detail superseded in rev B.',
        severity: CommentSeverity.MODERATE,
        status: CommentStatus.CLOSED,
        assignedTo: U.designer,
        createdBy: U.reviewer,
        resolvedAt: '2026-01-05',
        resolutionNote: 'Addressed in resubmitted package.',
        closedAt: '2026-01-08',
      },
    );
  } else {
    commentSpecs.push(
      {
        id: sid(p, 616),
        sessionId: activeSessionId,
        body: 'Final as-built dimensions verified against survey - no outstanding items.',
        severity: CommentSeverity.MINOR,
        status: CommentStatus.CLOSED,
        assignedTo: U.designer,
        createdBy: U.lead,
        commentDocVersionId: sid(p, 490),
        responseDocVersionId: sid(p, 492),
        resolvedAt: '2025-03-10',
        resolutionNote: 'All dimensions within tolerance.',
        verifiedAt: '2025-03-12',
        closedAt: '2025-03-15',
      },
      {
        id: sid(p, 617),
        sessionId: sid(p, 221),
        body: 'Structural connection detail approved for IFC issue.',
        severity: CommentSeverity.MINOR,
        status: CommentStatus.CLOSED,
        assignedTo: U.designer,
        createdBy: U.deptChief,
        resolvedAt: '2025-04-01',
        closedAt: '2025-04-02',
      },
      {
        id: sid(p, 618),
        sessionId: sid(p, 230),
        body: 'Historical comment closed at project handover.',
        severity: CommentSeverity.MODERATE,
        status: CommentStatus.CLOSED,
        assignedTo: U.designer,
        createdBy: U.reviewer,
        closedAt: '2025-05-01',
      },
    );
  }

  for (const spec of commentSpecs) {
    await db.reviewComment.upsert({
      where: { id: spec.id },
      update: {
        body: spec.body,
        status: spec.status,
        commentDocumentVersionId: spec.commentDocVersionId ?? null,
        responseDocumentVersionId: spec.responseDocVersionId ?? null,
        resolutionNote: spec.resolutionNote ?? null,
        resolvedAt: spec.resolvedAt ? d(spec.resolvedAt) : null,
        verifiedAt: spec.verifiedAt ? d(spec.verifiedAt) : null,
        closedAt: spec.closedAt ? d(spec.closedAt) : null,
        updatedBy: spec.createdBy,
      },
      create: {
        id: spec.id,
        companyId,
        reviewSessionId: spec.sessionId,
        engineeringDocumentVersionId: primaryEdvId,
        body: spec.body,
        severity: spec.severity,
        status: spec.status,
        commentDocumentVersionId: spec.commentDocVersionId ?? null,
        responseDocumentVersionId: spec.responseDocVersionId ?? null,
        assignedToUserId: spec.assignedTo,
        createdBy: spec.createdBy,
        resolutionNote: spec.resolutionNote ?? null,
        resolvedAt: spec.resolvedAt ? d(spec.resolvedAt) : null,
        verifiedAt: spec.verifiedAt ? d(spec.verifiedAt) : null,
        closedAt: spec.closedAt ? d(spec.closedAt) : null,
        updatedBy: spec.createdBy,
      },
    });
  }

  // ── Workflow trail for inbox history ─────────────────────────────────────
  const workflowEvents: Array<{
    id: string;
    entityType: WorkflowEntityType;
    entityId: string;
    actorId: string;
    action: string;
    phase: WorkflowEventPhase;
    createdAt: string;
    reason?: string;
  }> = [];

  if (lifecycle === 'early') {
    workflowEvents.push({
      id: sid(p, 319),
      entityType: WorkflowEntityType.ReviewComment,
      entityId: sid(p, 610),
      actorId: U.owner,
      action: 'COMMENT_CREATED',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-03-02T09:00:00Z',
    });
  } else if (lifecycle === 'mid') {
    workflowEvents.push(
      {
        id: sid(p, 315),
        entityType: WorkflowEntityType.ReviewSession,
        entityId: sid(p, 230),
        actorId: U.designer,
        action: 'SESSION_SUPERSEDED',
        phase: WorkflowEventPhase.COMMITTED,
        createdAt: '2026-01-10T16:00:00Z',
      },
      {
        id: sid(p, 316),
        entityType: WorkflowEntityType.ReviewComment,
        entityId: sid(p, 611),
        actorId: U.reviewer,
        action: 'COMMENT_CREATED',
        phase: WorkflowEventPhase.COMMITTED,
        createdAt: '2026-01-29T10:00:00Z',
      },
      {
        id: sid(p, 317),
        entityType: WorkflowEntityType.ReviewComment,
        entityId: sid(p, 612),
        actorId: U.designer,
        action: 'COMMENT_RESOLVED',
        phase: WorkflowEventPhase.COMMITTED,
        createdAt: '2026-02-10T14:00:00Z',
      },
      {
        id: sid(p, 318),
        entityType: WorkflowEntityType.ReviewSession,
        entityId: returnedSessionId,
        actorId: U.reviewer,
        action: 'SESSION_RETURNED',
        phase: WorkflowEventPhase.COMMITTED,
        createdAt: '2026-02-15T16:00:00Z',
        reason: 'Outstanding major comments on coordination overlay',
      },
    );
  } else {
    workflowEvents.push(
      {
        id: sid(p, 315),
        entityType: WorkflowEntityType.ReviewSession,
        entityId: sid(p, 230),
        actorId: U.designer,
        action: 'SESSION_SUPERSEDED',
        phase: WorkflowEventPhase.COMMITTED,
        createdAt: '2025-02-01T16:00:00Z',
      },
      {
        id: sid(p, 316),
        entityType: WorkflowEntityType.ReviewComment,
        entityId: sid(p, 616),
        actorId: U.lead,
        action: 'COMMENT_VERIFIED',
        phase: WorkflowEventPhase.COMMITTED,
        createdAt: '2025-03-12T11:00:00Z',
      },
      {
        id: sid(p, 317),
        entityType: WorkflowEntityType.ReviewSession,
        entityId: sid(p, 220),
        actorId: U.lead,
        action: 'SESSION_APPROVED',
        phase: WorkflowEventPhase.COMMITTED,
        createdAt: '2025-03-15T16:00:00Z',
      },
    );
  }

  for (const event of workflowEvents) {
    await db.workflowEventLog.upsert({
      where: { id: event.id },
      update: { action: event.action, phase: event.phase, actorId: event.actorId },
      create: {
        id: event.id,
        companyId,
        entityType: event.entityType,
        entityId: event.entityId,
        actorId: event.actorId,
        action: event.action,
        phase: event.phase,
        reason: event.reason ?? null,
        createdAt: d(event.createdAt),
      },
    });
  }

  console.log(`✓ Created review inbox history and file attachments for ${projectCode}`);
}

/**
 * Updates drawing versions with real PDF file keys.
 */
async function seedDrawingFileAttachments(input: RichAssetsInput): Promise<void> {
  const { ctx, p, projectCode, pdfRegistry } = input;
  const { prisma: db } = ctx;

  const drawingUpdates: Array<{ versionId: string; drawingId: string; fileName: string; revision: string }> = [
    { versionId: sid(p, 62), drawingId: sid(p, 60), fileName: 'Drawing-A-101-revC.pdf', revision: 'C' },
    { versionId: sid(p, 635), drawingId: sid(p, 61), fileName: 'Drawing-S-201-revB.pdf', revision: 'B' },
  ];

  for (const row of drawingUpdates) {
    const fileKey = `demo/${projectCode}/${row.fileName}`;
    await db.drawingVersion.upsert({
      where: { id: row.versionId },
      update: {
        fileKey,
        changeNote: `Issued for construction - ${row.fileName}`,
      },
      create: {
        id: row.versionId,
        drawingId: row.drawingId,
        uploadedBy: U.docs,
        revision: row.revision,
        fileKey,
        status: 'CURRENT',
        changeNote: `Issued for construction - ${row.fileName}`,
        createdAt: d('2026-02-01'),
      },
    });
  }

  await db.drawingVersion.upsert({
    where: { id: sid(p, 695) },
    update: { fileKey: `demo/${projectCode}/attachments/Drawing-Markup-MEP-Level12.pdf` },
    create: {
      id: sid(p, 695),
      drawingId: sid(p, 60),
      uploadedBy: U.reviewer,
      revision: 'C-MARKUP',
      fileKey: `demo/${projectCode}/attachments/Drawing-Markup-MEP-Level12.pdf`,
      status: 'SUPERSEDED',
      changeNote: 'Reviewer markup overlay - coordination comments',
      createdAt: d('2026-02-15'),
    },
  });

  ensureProjectAttachmentPdf(projectCode, 'Drawing-Markup-MEP-Level12.pdf', pdfRegistry);

  console.log(`✓ Updated drawing versions with real PDF attachments for ${projectCode}`);
}

/**
 * Seeds all rich demo assets: construction submittals, external releases, review inbox, attachments.
 */
export async function seedRichProjectAssets(input: RichAssetsInput): Promise<void> {
  await seedDrawingFileAttachments(input);
  await seedConstructionSubmittals(input);
  await seedExternalReleases(input);
  await seedReviewInboxHistory(input);
}
