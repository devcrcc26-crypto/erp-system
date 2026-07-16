import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CommentStatus,
  Prisma,
  ReviewSession,
  ReviewSessionStatus,
  ReviewTier,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  hasFullProjectDataAccess,
  isProjectAdministrator,
} from '../../../../shared/permissions/project-admin.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { ReviewSessionListQueryDto } from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import { MappedReviewSessionListItem } from './design-packages.service';
import { ProjectScopeService } from './project-scope.service';
import {
  CommentEdvSnapshot,
  resolveCommentRevisionContexts,
} from '../utils/comment-revision-context.util';
import {
  mapReviewSessionAttachments,
  MappedReviewSessionAttachment,
} from '../utils/review-session-attachment.mapper';

export interface ReviewInboxItem {
  readonly reviewSessionId: string;
  readonly designPackageId: string;
  readonly designPackageName: string;
  readonly taskDisciplineId: string;
  readonly disciplineName: string;
  readonly disciplineIndex: number | null;
  readonly overseasTaskNumber: string | null;
  readonly taskIdCode: string | null;
  readonly subtaskId: string | null;
  readonly packageCode: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly currentTier: string;
  readonly slaDeadlineAt: string | null;
  readonly slaOverdue: boolean;
  readonly openedAt: string;
  readonly inboxStatus: 'PENDING' | 'COMPLETED';
  readonly sessionStatus: string;
  readonly actionTakenAt: string | null;
  readonly completedAction: 'APPROVED' | 'RETURNED' | null;
}

export interface MyCommentItem {
  readonly commentId: string;
  readonly body: string | null;
  readonly status: CommentStatus;
  readonly severity: string;
  readonly engineeringDocumentVersionId: string;
  readonly documentVersionId: string;
  readonly engineeringDocumentId: string;
  readonly documentTitle: string;
  readonly revisionLabel: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly taskDisciplineId: string;
  readonly disciplineName: string;
  readonly disciplineIndex: number | null;
  readonly overseasTaskNumber: string | null;
  readonly taskIdCode: string | null;
  readonly subtaskId: string | null;
  readonly packageCode: string | null;
  readonly designPackageId: string;
  readonly designPackageName: string;
  readonly reviewSessionId: string;
  readonly authorName: string;
  readonly assigneeId: string;
  readonly assigneeFirstName: string;
  readonly assigneeLastName: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly commentInboxStatus: 'PENDING' | 'COMPLETED';
  /** True when this row belongs in the designer "Directed to me" queue. */
  readonly isDirectedToMe: boolean;
  readonly resolutionNote: string | null;
  readonly verifiedAt: string | null;
  readonly responseDocumentVersionId: string | null;
  readonly responseDocumentTitle: string | null;
}

export interface ProjectStatusBoard {
  readonly projectId: string;
  readonly packagesByStatus: Record<string, number>;
  readonly disciplinesByStatus: Record<string, number>;
  readonly activeReviewSessions: number;
  readonly slaOverdueSessions: number;
  readonly openComments: number;
  readonly pendingSubmittals: number;
}

export interface DispatcherWorkloadItem {
  userId: string;
  displayName: string;
  assignedReviewSessions: number;
  openComments: number;
  slaOverdue: number;
}

export interface ReviewModeView {
  readonly designPackageId: string;
  readonly reviewSessionId: string | null;
  readonly sessionStatus: string | null;
  readonly currentTier: string | null;
  /** EDVs in this package (documents under review). */
  readonly packageEdvIds: readonly string[];
  /** Frozen locked EDVs from upstream dependency packages at session open. */
  readonly snapshotEdvIds: readonly string[];
  readonly contentHash: string | null;
  readonly comments: readonly {
    id: string;
    body: string | null;
    status: CommentStatus;
    severity: string;
    reviewTier: ReviewTier | null;
    engineeringDocumentVersionId: string;
    createdBy: string;
    createdAt: string;
    assignedToUserId: string;
    authorName: string;
    assigneeName: string;
    resolutionNote: string | null;
    resolvedAt: string | null;
    verifiedAt: string | null;
    commentedOn: CommentEdvSnapshot;
    responseRevision: CommentEdvSnapshot | null;
    attachment: {
      documentVersionId: string;
      name: string;
    } | null;
    responseAttachment: {
      documentVersionId: string;
      name: string;
    } | null;
    documents: readonly {
      engineeringDocumentVersionId: string;
      revisionLabel: string;
      documentTitle: string;
      documentNumber: string;
    }[];
    files: readonly {
      id: string;
      documentVersionId: string;
      fileName: string;
      isResponseFile: boolean;
    }[];
  }[];
  /** Status-only comments from the most recent RETURNED_FOR_REWORK session (when no ACTIVE session). */
  readonly lastReturnedSessionComments: readonly { status: CommentStatus }[];
  /** Full read-only context of the most recent RETURNED_FOR_REWORK session (when no ACTIVE session). */
  readonly lastReturnedSession: {
    closedReason: string | null;
    closedAt: string | null;
    returnedByTier: ReviewTier;
    comments: readonly {
      body: string | null;
      reviewTier: ReviewTier | null;
      authorName: string;
      createdAt: string;
      severity: string;
    }[];
  } | null;
  /** Tier markup attachments accumulated across the session lifecycle. */
  readonly attachments: readonly MappedReviewSessionAttachment[];
}

export interface VersionHistoryEntry {
  readonly engineeringDocumentVersionId: string;
  readonly revisionLabel: string;
  readonly status: string;
  readonly createdAt: string;
  readonly loop: 'INTERNAL' | 'EXTERNAL';
  /** Storage document version used for download. */
  readonly documentVersionId: string;
  /** File version number from DocumentVersion. */
  readonly fileVersionNumber: number | null;
  /** Original uploaded file name. */
  readonly fileName: string | null;
  readonly events: readonly {
    action: string;
    phase: WorkflowEventPhase;
    createdAt: string;
  }[];
}

/**
 * Read-model queries for EPC workspaces (inbox, dashboard, trace).
 */
@Injectable()
export class EpcWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly epcReviewRepository: EpcReviewRepository,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Review inbox for the current user - PENDING sessions awaiting their
   * action at the current tier, plus COMPLETED sessions they previously
   * approved, escalated, or returned (full history, nothing disappears).
   */
  async getReviewInbox(
    ctx: PmContext,
    projectId?: string,
  ): Promise<ReviewInboxItem[]> {
    if (projectId) {
      await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    }

    const now = new Date();
    const projectFilter = projectId
      ? {
          designPackage: {
            taskDiscipline: { task: { projectId, deletedAt: null } },
          },
        }
      : {};

    const sessionInclude = {
      designPackage: {
        include: {
          taskDiscipline: {
            include: { task: { include: { project: true } } },
          },
        },
      },
    } as const;

    const [pendingSessions, completedEvents] = await Promise.all([
      this.prisma.reviewSession.findMany({
        where: activeOnly({
          companyId: ctx.companyId,
          status: ReviewSessionStatus.ACTIVE,
          assignedToUserId: ctx.userId,
          ...projectFilter,
        }),
        include: sessionInclude,
        orderBy: { slaDeadlineAt: 'asc' },
      }),
      this.prisma.workflowEventLog.findMany({
        where: {
          companyId: ctx.companyId,
          entityType: WorkflowEntityType.ReviewSession,
          actorId: ctx.userId,
          action: {
            in: ['APPROVE_REVIEW_SESSION', 'ADVANCE_REVIEW_TIER', 'RETURN_FOR_REWORK'],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { entityId: true, action: true, createdAt: true },
      }),
    ]);

    const pendingIds = new Set(pendingSessions.map((s) => s.id));
    const latestActionBySession = new Map<
      string,
      { action: string; createdAt: Date }
    >();
    for (const event of completedEvents) {
      if (!latestActionBySession.has(event.entityId)) {
        latestActionBySession.set(event.entityId, {
          action: event.action,
          createdAt: event.createdAt,
        });
      }
    }
    const completedIds = [...latestActionBySession.keys()].filter(
      (id) => !pendingIds.has(id),
    );

    const completedSessions = completedIds.length
      ? await this.prisma.reviewSession.findMany({
          where: activeOnly({
            id: { in: completedIds },
            companyId: ctx.companyId,
            ...projectFilter,
          }),
          include: sessionInclude,
        })
      : [];

    const mapSession = (
      s: ReviewSession & {
        designPackage: {
          name: string;
          subtaskId: string | null;
          packageCode: string;
          taskDiscipline: {
            disciplineName: string;
            disciplineIndex: number | null;
            task: {
              projectId: string;
              overseasTaskNumber: string | null;
              taskIdCode: string;
              project: { name: string };
            };
          };
        };
      },
      inboxStatus: 'PENDING' | 'COMPLETED',
    ): ReviewInboxItem => {
      const completedEvent = latestActionBySession.get(s.id);
      const completedAction: ReviewInboxItem['completedAction'] =
        !completedEvent
          ? null
          : completedEvent.action === 'RETURN_FOR_REWORK'
            ? 'RETURNED'
            : 'APPROVED';

      return {
        reviewSessionId: s.id,
        designPackageId: s.designPackageId,
        designPackageName: s.designPackage.name,
        taskDisciplineId: s.taskDisciplineId,
        disciplineName: s.designPackage.taskDiscipline.disciplineName,
        disciplineIndex: s.designPackage.taskDiscipline.disciplineIndex,
        overseasTaskNumber: s.designPackage.taskDiscipline.task.overseasTaskNumber ?? null,
        taskIdCode: s.designPackage.taskDiscipline.task.taskIdCode ?? null,
        subtaskId: s.designPackage.subtaskId ?? null,
        packageCode: s.designPackage.packageCode,
        projectId: s.designPackage.taskDiscipline.task.projectId,
        projectName: s.designPackage.taskDiscipline.task.project.name,
        currentTier: s.currentTier,
        slaDeadlineAt: s.slaDeadlineAt?.toISOString() ?? null,
        slaOverdue: s.slaDeadlineAt ? s.slaDeadlineAt < now : false,
        openedAt: s.openedAt.toISOString(),
        inboxStatus,
        sessionStatus: s.status,
        actionTakenAt: completedEvent?.createdAt.toISOString() ?? null,
        completedAction,
      };
    };

    const items = [
      ...pendingSessions.map((s) => mapSession(s, 'PENDING')),
      ...completedSessions.map((s) => mapSession(s, 'COMPLETED')),
    ];

    items.sort((a, b) => {
      if (a.inboxStatus !== b.inboxStatus) {
        return a.inboxStatus === 'PENDING' ? -1 : 1;
      }
      if (a.inboxStatus === 'PENDING') {
        if (!a.slaDeadlineAt) return 1;
        if (!b.slaDeadlineAt) return -1;
        return a.slaDeadlineAt.localeCompare(b.slaDeadlineAt);
      }
      return (b.actionTakenAt ?? '').localeCompare(a.actionTakenAt ?? '');
    });

    return items;
  }

  /**
   * Comment queue for the current user - everything they're assigned to or
   * authored, across all statuses. PENDING/COMPLETED grouping is computed
   * per row so the frontend can section rather than filter items away.
   */
  async getMyComments(
    ctx: PmContext,
    projectId?: string,
  ): Promise<MyCommentItem[]> {
    if (projectId) {
      await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    }

    const rows = await this.prisma.reviewComment.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        OR: [
          { assignedToUserId: ctx.userId },
          { createdBy: ctx.userId },
          // Recover designer queue after historical assignee-flip on resolve:
          // resolved+ comments on packages they design, even if assignee is the author.
          {
            AND: [
              { createdBy: { not: ctx.userId } },
              {
                status: {
                  in: [
                    CommentStatus.RESOLVED,
                    CommentStatus.VERIFIED,
                    CommentStatus.CLOSED,
                  ],
                },
              },
              {
                reviewSession: {
                  designPackage: {
                    OR: [
                      { designerUserId: ctx.userId },
                      { supportingDesignerUserId: ctx.userId },
                    ],
                  },
                },
              },
            ],
          },
        ],
        ...(projectId
          ? {
              reviewSession: {
                designPackage: {
                  taskDiscipline: { task: { projectId, deletedAt: null } },
                },
              },
            }
          : {}),
      }),
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
        assignedToUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        responseDocumentVersion: {
          select: {
            id: true,
            document: { select: { id: true, name: true } },
          },
        },
        engineeringDocumentVersion: {
          include: {
            engineeringDocument: {
              include: {
                taskDiscipline: {
                  include: {
                    task: {
                      include: { project: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        reviewSession: {
          include: {
            designPackage: {
              select: {
                id: true,
                name: true,
                subtaskId: true,
                packageCode: true,
                designerUserId: true,
                supportingDesignerUserId: true,
              },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      const edv = row.engineeringDocumentVersion;
      const doc = edv.engineeringDocument;
      const discipline = doc.taskDiscipline;
      const project = discipline.task.project;
      const designPackage = row.reviewSession.designPackage;

      const isAuthor = row.createdBy === ctx.userId;
      const isAssignee = row.assignedToUserId === ctx.userId;
      const isPackageDesigner =
        designPackage.designerUserId === ctx.userId ||
        designPackage.supportingDesignerUserId === ctx.userId;
      // Directed = designer work queue (assignee or package designer, not author).
      const isDirectedToMe = !isAuthor && (isAssignee || isPackageDesigner);
      const commentInboxStatus: MyCommentItem['commentInboxStatus'] =
        row.status === CommentStatus.VERIFIED ||
        row.status === CommentStatus.CLOSED ||
        (isDirectedToMe && row.status === CommentStatus.RESOLVED)
          ? 'COMPLETED'
          : 'PENDING';

      return {
        commentId: row.id,
        body: row.body,
        status: row.status,
        severity: row.severity,
        engineeringDocumentVersionId: row.engineeringDocumentVersionId,
        documentVersionId: edv.documentVersionId,
        engineeringDocumentId: doc.id,
        documentTitle: doc.title,
        revisionLabel: edv.revisionLabel,
        projectId: project.id,
        projectName: project.name,
        taskDisciplineId: discipline.id,
        disciplineName: discipline.disciplineName,
        disciplineIndex: discipline.disciplineIndex,
        overseasTaskNumber: discipline.task.overseasTaskNumber ?? null,
        taskIdCode: discipline.task.taskIdCode ?? null,
        subtaskId: designPackage.subtaskId ?? null,
        packageCode: designPackage.packageCode,
        designPackageId: row.reviewSession.designPackageId,
        designPackageName: designPackage.name,
        reviewSessionId: row.reviewSessionId,
        authorName: formatReviewerName(row.author),
        assigneeId: row.assignedToUser.id,
        assigneeFirstName: row.assignedToUser.firstName,
        assigneeLastName: row.assignedToUser.lastName,
        createdBy: row.createdBy,
        responseDocumentVersionId: row.responseDocumentVersion?.id ?? null,
        responseDocumentTitle: row.responseDocumentVersion?.document.name ?? null,
        createdAt: row.createdAt.toISOString(),
        commentInboxStatus,
        resolutionNote: row.resolutionNote,
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
        isDirectedToMe,
      };
    });
  }

  /**
   * Project status board with bottleneck KPIs.
   */
  async getStatusBoard(
    ctx: PmContext,
    projectId: string,
  ): Promise<ProjectStatusBoard> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const now = new Date();

    const disciplines = await this.prisma.taskDiscipline.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        task: { projectId, deletedAt: null },
      }),
      select: { projectedStatus: true },
    });

    const packages = await this.prisma.designPackage.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        taskDiscipline: { task: { projectId, deletedAt: null } },
      }),
      select: { projectedStatus: true },
    });

    const packagesByStatus: Record<string, number> = {};
    for (const p of packages) {
      packagesByStatus[p.projectedStatus] =
        (packagesByStatus[p.projectedStatus] ?? 0) + 1;
    }

    const disciplinesByStatus: Record<string, number> = {};
    for (const d of disciplines) {
      disciplinesByStatus[d.projectedStatus] =
        (disciplinesByStatus[d.projectedStatus] ?? 0) + 1;
    }

    const [activeReviewSessions, slaOverdueSessions, openComments, pendingSubmittals] =
      await Promise.all([
        this.prisma.reviewSession.count({
          where: activeOnly({
            companyId: ctx.companyId,
            status: ReviewSessionStatus.ACTIVE,
            designPackage: {
              taskDiscipline: { task: { projectId } },
            },
          }),
        }),
        this.prisma.reviewSession.count({
          where: activeOnly({
            companyId: ctx.companyId,
            status: ReviewSessionStatus.ACTIVE,
            slaDeadlineAt: { lt: now },
            designPackage: {
              taskDiscipline: { task: { projectId } },
            },
          }),
        }),
        this.prisma.reviewComment.count({
          where: activeOnly({
            companyId: ctx.companyId,
            status: {
              in: [
                CommentStatus.OPEN,
                CommentStatus.ACKNOWLEDGED,
                CommentStatus.IN_PROGRESS,
              ],
            },
            reviewSession: {
              designPackage: {
                taskDiscipline: { task: { projectId } },
              },
            },
          }),
        }),
        this.prisma.submittal.count({
          where: activeOnly({
            projectId,
            issuedAt: null,
          }),
        }),
      ]);

    return {
      projectId,
      packagesByStatus,
      disciplinesByStatus,
      activeReviewSessions,
      slaOverdueSessions,
      openComments,
      pendingSubmittals,
    };
  }

  /**
   * Dispatcher workload - assigned sessions and comments per user.
   */
  async getWorkload(
    ctx: PmContext,
    projectId: string,
  ): Promise<DispatcherWorkloadItem[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const now = new Date();

    const sessions = await this.prisma.reviewSession.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        status: ReviewSessionStatus.ACTIVE,
        designPackage: {
          taskDiscipline: { task: { projectId } },
        },
        assignedToUserId: { not: null },
      }),
      select: {
        assignedToUserId: true,
        slaDeadlineAt: true,
        assignedToUser: {
          select: { id: true, firstName: true, lastName: true, chineseName: true },
        },
      },
    });

    const comments = await this.prisma.reviewComment.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        status: { in: [CommentStatus.OPEN, CommentStatus.IN_PROGRESS] },
        reviewSession: {
          designPackage: {
            taskDiscipline: { task: { projectId } },
          },
        },
      }),
      select: { assignedToUserId: true },
    });

    const map = new Map<string, DispatcherWorkloadItem>();

    for (const s of sessions) {
      if (!s.assignedToUserId || !s.assignedToUser) {
        continue;
      }
      const existing = map.get(s.assignedToUserId) ?? {
        userId: s.assignedToUserId,
        displayName: formatReviewerName({ ...s.assignedToUser, email: null }),
        assignedReviewSessions: 0,
        openComments: 0,
        slaOverdue: 0,
      };
      existing.assignedReviewSessions++;
      if (s.slaDeadlineAt && s.slaDeadlineAt < now) {
        existing.slaOverdue++;
      }
      map.set(s.assignedToUserId, existing);
    }

    for (const c of comments) {
      const existing = map.get(c.assignedToUserId);
      if (existing) {
        existing.openComments++;
      }
    }

    return [...map.values()].sort(
      (a, b) => b.assignedReviewSessions - a.assignedReviewSessions,
    );
  }

  /**
   * Review mode payload - session, snapshot, comments.
   */
  async getReviewMode(
    ctx: PmContext,
    designPackageId: string,
    reviewSessionId?: string,
  ): Promise<ReviewModeView> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId: ctx.companyId }),
      include: {
        taskDiscipline: {
          select: {
            disciplineLeadUserId: true,
            task: { select: { supervisingChiefUserId: true } },
          },
        },
      },
    });
    if (!pkg) {
      throw new NotFoundException('Design package not found');
    }

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const isFullAccess =
      hasFullProjectDataAccess(roleNames) || isProjectAdministrator(roleNames);
    const isDesigner =
      pkg.designerUserId === ctx.userId ||
      pkg.supportingDesignerUserId === ctx.userId;
    const isDisciplineLeader =
      pkg.taskDiscipline?.disciplineLeadUserId === ctx.userId;
    const isResponsiblePerson =
      pkg.taskDiscipline?.task.supervisingChiefUserId === ctx.userId;
    const seesAllSessions =
      isFullAccess || isDesigner || isDisciplineLeader || isResponsiblePerson;
    // Approvers only see comments they authored, were assigned, or raised at their
    // tier / this session's current tier. Designers and full-access roles see all.
    const seesAllComments = isFullAccess || isDesigner;

    const tierRoleHolder: Partial<Record<ReviewTier, string | null>> = {
      [ReviewTier.REVIEWER]: pkg.reviewerUserId,
      [ReviewTier.DISCIPLINE_LEAD]: pkg.disciplinaryLeaderUserId,
      [ReviewTier.DEPT_CHIEF]: pkg.deptDeputyChiefUserId,
      [ReviewTier.INSTITUTE_CHIEF]: pkg.instituteChiefUserId,
    };
    const userTiers = (Object.keys(tierRoleHolder) as ReviewTier[]).filter(
      (tier) => tierRoleHolder[tier] === ctx.userId,
    );

    if (!seesAllSessions && userTiers.length === 0) {
      throw new NotFoundException('Design package not found');
    }

    const tierScope = seesAllSessions ? {} : { currentTier: { in: userTiers } };

    const sessionInclude = {
      contextSnapshot: true,
      reviewSessionAttachments: {
        where: { deletedAt: null },
        orderBy: { attachedAt: 'asc' as const },
        include: {
          attachedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
            },
          },
          document: { select: { id: true, name: true } },
        },
      },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' as const },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
              email: true,
            },
          },
          assignedToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
              email: true,
            },
          },
          documents: {
            select: {
              engineeringDocumentVersionId: true,
              engineeringDocumentVersion: {
                select: {
                  id: true,
                  revisionLabel: true,
                  engineeringDocument: {
                    select: {
                      title: true,
                      documentNumber: true,
                    },
                  },
                },
              },
            },
          },
          files: {
            select: {
              id: true,
              documentVersionId: true,
              fileName: true,
              isResponseFile: true,
            },
          },
          commentDocumentVersion: {
            select: {
              id: true,
              document: { select: { name: true } },
            },
          },
          responseDocumentVersion: {
            select: {
              id: true,
              document: { select: { name: true } },
            },
          },
        },
      },
    };

    const packageItemsPromise = this.prisma.designPackageItem.findMany({
      where: { companyId: ctx.companyId, designPackageId },
      orderBy: { sortOrder: 'asc' },
      select: {
        engineeringDocumentVersionId: true,
        engineeringDocumentVersion: {
          select: { engineeringDocumentId: true },
        },
      },
    });

    type SessionWithInclude = Prisma.ReviewSessionGetPayload<{
      include: typeof sessionInclude;
    }>;

    let session: SessionWithInclude | null = null;
    let lastReturnedSessionComments: { status: CommentStatus }[] = [];
    let lastReturnedSession: ReviewModeView['lastReturnedSession'] = null;

    if (reviewSessionId) {
      const requested = await this.prisma.reviewSession.findFirst({
        where: activeOnly({
          id: reviewSessionId,
          companyId: ctx.companyId,
          designPackageId,
        }),
        include: sessionInclude,
      });
      if (!requested) {
        throw new NotFoundException('Review session not found');
      }
      const completedByMe = await this.prisma.workflowEventLog.count({
        where: {
          companyId: ctx.companyId,
          entityType: WorkflowEntityType.ReviewSession,
          entityId: requested.id,
          actorId: ctx.userId,
          action: {
            in: ['APPROVE_REVIEW_SESSION', 'ADVANCE_REVIEW_TIER', 'RETURN_FOR_REWORK'],
          },
        },
      });
      const hasCommentOnSession = await this.prisma.reviewComment.findFirst({
        where: {
          reviewSessionId: requested.id,
          deletedAt: null,
          OR: [{ createdBy: ctx.userId }, { assignedToUserId: ctx.userId }],
        },
        select: { id: true },
      });
      const authorized =
        seesAllSessions ||
        userTiers.includes(requested.currentTier as ReviewTier) ||
        completedByMe > 0 ||
        Boolean(hasCommentOnSession);
      if (!authorized) {
        throw new NotFoundException('Review session not found');
      }
      session = requested;
    } else {
      session = await this.prisma.reviewSession.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          designPackageId,
          status: ReviewSessionStatus.ACTIVE,
          ...tierScope,
        }),
        include: sessionInclude,
      });

      if (!session) {
        session = await this.prisma.reviewSession.findFirst({
          where: activeOnly({
            companyId: ctx.companyId,
            designPackageId,
            status: ReviewSessionStatus.RETURNED_FOR_REWORK,
            comments: {
              some: {
                deletedAt: null,
                status: CommentStatus.RESOLVED,
              },
            },
            ...tierScope,
          }),
          orderBy: { closedAt: 'desc' },
          include: sessionInclude,
        });
      }

      if (!session) {
        const lastReturned = await this.prisma.reviewSession.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          designPackageId,
          status: ReviewSessionStatus.RETURNED_FOR_REWORK,
          ...tierScope,
        }),
        orderBy: { closedAt: 'desc' },
        select: {
          id: true,
          currentTier: true,
          closedAt: true,
          closedReason: true,
          comments: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            select: {
              status: true,
              body: true,
              reviewTier: true,
              severity: true,
              createdAt: true,
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  chineseName: true,
                  email: true,
                },
              },
            },
          },
        },
      });
      const returnedCommentsRaw = lastReturned?.comments ?? [];
      const returnedCommentsVisible = seesAllComments
        ? returnedCommentsRaw
        : returnedCommentsRaw.filter(
            (c) =>
              userTiers.includes(c.reviewTier as ReviewTier) ||
              (lastReturned != null && c.reviewTier === lastReturned.currentTier),
          );
      lastReturnedSessionComments = returnedCommentsVisible.map((c) => ({
        status: c.status,
      }));
      if (lastReturned) {
        lastReturnedSession = {
          closedReason: lastReturned.closedReason,
          closedAt: lastReturned.closedAt?.toISOString() ?? null,
          returnedByTier: lastReturned.currentTier,
          comments: returnedCommentsVisible.map((c) => ({
            body: c.body,
            reviewTier: c.reviewTier,
            authorName: formatReviewerName(c.author),
            createdAt: c.createdAt.toISOString(),
            severity: c.severity,
          })),
        };
      }
      }
    }

    const packageItems = await packageItemsPromise;
    const currentVersions = await this.prisma.engineeringDocumentVersion.findMany({
      where: {
        engineeringDocumentId: {
          in: packageItems.map((p) => p.engineeringDocumentVersion.engineeringDocumentId),
        },
        isCurrent: true,
        deletedAt: null,
      },
      select: { id: true, engineeringDocumentId: true },
    });
    const currentVersionMap = new Map(
      currentVersions.map((v) => [v.engineeringDocumentId, v.id]),
    );
    // Approvers only see comments they authored, were assigned, or raised at their
    // tier / this session's current tier. Designers and full-access roles see all.
    const sessionCommentsRaw = session?.comments ?? [];
    const sessionComments = seesAllComments
      ? sessionCommentsRaw
      : sessionCommentsRaw.filter(
          (c) =>
            c.createdBy === ctx.userId ||
            c.assignedToUserId === ctx.userId ||
            (session != null && c.reviewTier === session.currentTier) ||
            userTiers.includes(c.reviewTier as ReviewTier),
        );
    const revisionContexts = await resolveCommentRevisionContexts(
      this.prisma,
      ctx.companyId,
      sessionComments.map((comment) => ({
        id: comment.id,
        engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
        resolutionNote: comment.resolutionNote,
        resolvedAt: comment.resolvedAt,
        verifiedAt: comment.verifiedAt,
      })),
    );

    return {
      designPackageId,
      reviewSessionId: session?.id ?? null,
      sessionStatus: session?.status ?? null,
      currentTier: session?.currentTier ?? null,
      packageEdvIds: packageItems.map(
        (item) =>
          currentVersionMap.get(
            item.engineeringDocumentVersion.engineeringDocumentId,
          ) ?? item.engineeringDocumentVersionId,
      ),
      snapshotEdvIds: session?.contextSnapshot?.referencedVersionIds ?? [],
      contentHash: session?.contextSnapshot?.contentHash ?? null,
      comments: sessionComments.map((c) => {
        const revision = revisionContexts.get(c.id);
        const commentedOn = revision?.commentedOn ?? {
          engineeringDocumentVersionId: c.engineeringDocumentVersionId,
          engineeringDocumentId: '',
          documentVersionId: '',
          documentTitle: 'Document',
          revisionLabel: '-',
        };

        return {
          id: c.id,
          body: c.body,
          status: c.status,
          severity: c.severity,
          reviewTier: c.reviewTier,
          engineeringDocumentVersionId: c.engineeringDocumentVersionId,
          createdBy: c.createdBy,
          createdAt: c.createdAt.toISOString(),
          assignedToUserId: c.assignedToUserId,
          authorName: formatReviewerName(c.author),
          assigneeName: formatReviewerName(c.assignedToUser),
          resolutionNote: revision?.resolutionNote ?? c.resolutionNote,
          resolvedAt: revision?.resolvedAt ?? c.resolvedAt?.toISOString() ?? null,
          verifiedAt: revision?.verifiedAt ?? c.verifiedAt?.toISOString() ?? null,
          commentedOn,
          responseRevision: revision?.responseRevision ?? null,
          attachment: c.commentDocumentVersion
            ? {
                documentVersionId: c.commentDocumentVersion.id,
                name: c.commentDocumentVersion.document.name,
              }
            : null,
          responseAttachment: c.responseDocumentVersion
            ? {
                documentVersionId: c.responseDocumentVersion.id,
                name: c.responseDocumentVersion.document.name,
              }
            : null,
          documents: c.documents.map((d) => ({
            engineeringDocumentVersionId: d.engineeringDocumentVersionId,
            revisionLabel: d.engineeringDocumentVersion.revisionLabel,
            documentTitle: d.engineeringDocumentVersion.engineeringDocument.title,
            documentNumber: d.engineeringDocumentVersion.engineeringDocument.documentNumber,
          })),
          files: c.files.map((f) => ({
            id: f.id,
            documentVersionId: f.documentVersionId,
            fileName: f.fileName,
            isResponseFile: f.isResponseFile,
          })),
        };
      }),
      lastReturnedSessionComments,
      lastReturnedSession,
      attachments: mapReviewSessionAttachments(session?.reviewSessionAttachments ?? []),
    };
  }

  /**
   * Version history with internal/external event classification per EDV.
   */
  async getVersionHistory(
    ctx: PmContext,
    engineeringDocumentId: string,
  ): Promise<VersionHistoryEntry[]> {
    const doc = await this.prisma.engineeringDocument.findFirst({
      where: activeOnly({ id: engineeringDocumentId, companyId: ctx.companyId }),
      include: {
        versions: {
          where: activeOnly({}),
          orderBy: { createdAt: 'asc' },
          include: {
            documentVersion: {
              select: {
                id: true,
                versionNumber: true,
                document: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!doc) {
      throw new NotFoundException('Engineering document not found');
    }

    const entries: VersionHistoryEntry[] = [];
    for (const version of doc.versions) {
      const events = await this.prisma.workflowEventLog.findMany({
        where: {
          companyId: ctx.companyId,
          entityType: WorkflowEntityType.EngineeringDocumentVersion,
          entityId: version.id,
        },
        orderBy: { createdAt: 'asc' },
      });

      const hasExternal = events.some((e) =>
        e.action.toUpperCase().includes('TRIGGER_REVISION'),
      );

      entries.push({
        engineeringDocumentVersionId: version.id,
        revisionLabel: version.revisionLabel,
        status: version.status,
        createdAt: version.createdAt.toISOString(),
        loop: hasExternal ? 'EXTERNAL' : 'INTERNAL',
        documentVersionId: version.documentVersionId,
        fileVersionNumber: version.documentVersion?.versionNumber ?? null,
        fileName: version.documentVersion?.document?.name ?? null,
        events: events.map((e) => ({
          action: e.action,
          phase: e.phase,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    }

    return entries;
  }

  /**
   * Lists review sessions across all disciplines in a project.
   */
  async listProjectReviewSessions(
    ctx: PmContext,
    projectId: string,
    query: ReviewSessionListQueryDto,
  ): Promise<PaginatedResult<MappedReviewSessionListItem>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const status = query.status
      ? (query.status as ReviewSessionStatus)
      : ReviewSessionStatus.ACTIVE;
    const { skip, take } = buildPrismaPagination(query.page, query.limit);

    const { rows, total } = await this.epcReviewRepository.listSessionsForProject(
      ctx.companyId,
      projectId,
      status,
      skip,
      take,
    );

    return buildPaginatedResult(
      rows.map((row) => this.mapReviewSessionListItem(row)),
      total,
      query.page,
      query.limit,
    );
  }

  private mapReviewSessionListItem(
    row: ReviewSession & {
      designPackage: { id: string; name: string };
      assignedToUser: {
        id: string;
        firstName: string;
        lastName: string;
        chineseName?: string | null;
      } | null;
    },
  ): MappedReviewSessionListItem {
    const now = Date.now();
    const slaOverdue =
      row.slaDeadlineAt != null && row.slaDeadlineAt.getTime() < now;

    return {
      id: row.id,
      designPackageId: row.designPackageId,
      designPackageName: row.designPackage.name,
      taskDisciplineId: row.taskDisciplineId,
      status: row.status,
      currentTier: row.currentTier,
      assigneeName: row.assignedToUser
        ? formatReviewerName({ ...row.assignedToUser, email: null })
        : null,
      slaDeadlineAt: row.slaDeadlineAt?.toISOString() ?? null,
      slaOverdue,
      openedAt: row.openedAt.toISOString(),
    };
  }
}

function formatReviewerName(user: {
  firstName: string;
  lastName: string;
  chineseName?: string | null;
  email: string | null;
}): string {
  const english = `${user.firstName} ${user.lastName}`.trim();
  const chinese = user.chineseName?.trim();
  if (english && chinese) {
    return `${english} (${chinese})`;
  }
  return english || chinese || user.email || 'Unknown user';
}
