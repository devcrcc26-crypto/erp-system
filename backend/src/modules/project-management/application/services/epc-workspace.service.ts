import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CommentStatus,
  ReviewSession,
  ReviewSessionStatus,
  ReviewTier,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
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
  readonly projectId: string;
  readonly projectName: string;
  readonly currentTier: string;
  readonly slaDeadlineAt: string | null;
  readonly slaOverdue: boolean;
  readonly openedAt: string;
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
  readonly designPackageId: string;
  readonly designPackageName: string;
  readonly reviewSessionId: string;
  readonly authorName: string;
  readonly createdAt: string;
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
  ) {}

  /**
   * Review inbox for the active governance tier holder only.
   * A session is visible when its currentTier matches the user's discipline role.
   */
  async getReviewInbox(
    ctx: PmContext,
    projectId?: string,
  ): Promise<ReviewInboxItem[]> {
    if (projectId) {
      await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    }

    const now = new Date();
    const sessions = await this.prisma.reviewSession.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        status: ReviewSessionStatus.ACTIVE,
        assignedToUserId: ctx.userId,
        ...(projectId
          ? {
              designPackage: {
                taskDiscipline: { task: { projectId, deletedAt: null } },
              },
            }
          : {}),
      }),
      include: {
        designPackage: {
          include: {
            taskDiscipline: {
              include: { task: { include: { project: true } } },
            },
          },
        },
      },
      orderBy: { slaDeadlineAt: 'asc' },
    });

    return sessions.map((s) => ({
      reviewSessionId: s.id,
      designPackageId: s.designPackageId,
      designPackageName: s.designPackage.name,
      taskDisciplineId: s.taskDisciplineId,
      disciplineName: s.designPackage.taskDiscipline.disciplineName,
      projectId: s.designPackage.taskDiscipline.task.projectId,
      projectName: s.designPackage.taskDiscipline.task.project.name,
      currentTier: s.currentTier,
      slaDeadlineAt: s.slaDeadlineAt?.toISOString() ?? null,
      slaOverdue: s.slaDeadlineAt ? s.slaDeadlineAt < now : false,
      openedAt: s.openedAt.toISOString(),
    }));
  }

  /**
   * Designer comment queue - assigned comments awaiting designer action.
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
        assignedToUserId: ctx.userId,
        status: {
          in: [
            CommentStatus.OPEN,
            CommentStatus.ACKNOWLEDGED,
            CommentStatus.IN_PROGRESS,
            CommentStatus.RESOLVED,
            CommentStatus.VERIFIED,
          ],
        },
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
            designPackage: { select: { id: true, name: true } },
          },
        },
      },
    });

    return rows.map((row) => {
      const edv = row.engineeringDocumentVersion;
      const doc = edv.engineeringDocument;
      const discipline = doc.taskDiscipline;
      const project = discipline.task.project;

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
        designPackageId: row.reviewSession.designPackageId,
        designPackageName: row.reviewSession.designPackage.name,
        reviewSessionId: row.reviewSessionId,
        authorName: formatReviewerName(row.author),
        createdAt: row.createdAt.toISOString(),
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
  ): Promise<ReviewModeView> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId: ctx.companyId }),
    });
    if (!pkg) {
      throw new NotFoundException('Design package not found');
    }

    const [session, packageItems] = await Promise.all([
      this.prisma.reviewSession.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          designPackageId,
          status: ReviewSessionStatus.ACTIVE,
        }),
        include: {
          contextSnapshot: true,
          reviewSessionAttachments: {
            where: { deletedAt: null },
            orderBy: { attachedAt: 'asc' },
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
            orderBy: { createdAt: 'asc' },
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
            },
          },
        },
      }),
      this.prisma.designPackageItem.findMany({
        where: { companyId: ctx.companyId, designPackageId },
        orderBy: { sortOrder: 'asc' },
        select: { engineeringDocumentVersionId: true },
      }),
    ]);

    let lastReturnedSessionComments: { status: CommentStatus }[] = [];
    let lastReturnedSession: ReviewModeView['lastReturnedSession'] = null;
    if (!session) {
      const lastReturned = await this.prisma.reviewSession.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          designPackageId,
          status: ReviewSessionStatus.RETURNED_FOR_REWORK,
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
      lastReturnedSessionComments = lastReturned?.comments ?? [];
      if (lastReturned) {
        lastReturnedSession = {
          closedReason: lastReturned.closedReason,
          closedAt: lastReturned.closedAt?.toISOString() ?? null,
          returnedByTier: lastReturned.currentTier,
          comments: lastReturned.comments.map((c) => ({
            body: c.body,
            reviewTier: c.reviewTier,
            authorName: formatReviewerName(c.author),
            createdAt: c.createdAt.toISOString(),
            severity: c.severity,
          })),
        };
      }
    }

    const sessionComments = session?.comments ?? [];
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
        (item) => item.engineeringDocumentVersionId,
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
