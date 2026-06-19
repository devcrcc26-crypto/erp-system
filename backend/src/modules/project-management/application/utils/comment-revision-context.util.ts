import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

export interface CommentEdvSnapshot {
  engineeringDocumentVersionId: string;
  engineeringDocumentId: string;
  documentVersionId: string;
  documentTitle: string;
  revisionLabel: string;
}

export interface CommentRevisionContext {
  commentedOn: CommentEdvSnapshot;
  responseRevision: CommentEdvSnapshot | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
}

type EdvWithDoc = {
  id: string;
  documentVersionId: string;
  revisionLabel: string;
  createdAt: Date;
  engineeringDocument: {
    id: string;
    title: string;
  };
};

type CommentInput = {
  id: string;
  engineeringDocumentVersionId: string;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  verifiedAt: Date | null;
};

/**
 * Resolves original and latest response EDV snapshots keyed by comment id.
 */
export async function resolveCommentRevisionContexts(
  prisma: PrismaService,
  companyId: string,
  comments: readonly CommentInput[],
): Promise<Map<string, CommentRevisionContext>> {
  const result = new Map<string, CommentRevisionContext>();
  if (comments.length === 0) {
    return result;
  }

  const commentedEdvIds = [
    ...new Set(comments.map((comment) => comment.engineeringDocumentVersionId)),
  ];

  const commentedEdvs = await prisma.engineeringDocumentVersion.findMany({
    where: activeOnly({
      companyId,
      id: { in: commentedEdvIds },
    }),
    include: {
      engineeringDocument: {
        select: { id: true, title: true },
      },
    },
  });

  const commentedEdvById = new Map(commentedEdvs.map((edv) => [edv.id, edv]));
  const engineeringDocumentIds = [
    ...new Set(commentedEdvs.map((edv) => edv.engineeringDocumentId)),
  ];

  const allVersions = await prisma.engineeringDocumentVersion.findMany({
    where: activeOnly({
      companyId,
      engineeringDocumentId: { in: engineeringDocumentIds },
    }),
    orderBy: { createdAt: 'desc' },
    include: {
      engineeringDocument: {
        select: { id: true, title: true },
      },
    },
  });

  const versionsByDocumentId = new Map<string, EdvWithDoc[]>();
  for (const version of allVersions) {
    const existing = versionsByDocumentId.get(version.engineeringDocumentId) ?? [];
    existing.push(version);
    versionsByDocumentId.set(version.engineeringDocumentId, existing);
  }

  for (const comment of comments) {
    const commentedEdv = commentedEdvById.get(comment.engineeringDocumentVersionId);
    if (!commentedEdv) {
      continue;
    }

    const commentedOn = toSnapshot(commentedEdv);
    const documentVersions =
      versionsByDocumentId.get(commentedEdv.engineeringDocumentId) ?? [];
    const responseRevision = findResponseRevision(commentedEdv, documentVersions);

    result.set(comment.id, {
      commentedOn,
      responseRevision,
      resolutionNote: comment.resolutionNote,
      resolvedAt: comment.resolvedAt?.toISOString() ?? null,
      verifiedAt: comment.verifiedAt?.toISOString() ?? null,
    });
  }

  return result;
}

export async function resolveSingleCommentRevisionContext(
  prisma: PrismaService,
  companyId: string,
  comment: CommentInput,
): Promise<CommentRevisionContext | null> {
  const contexts = await resolveCommentRevisionContexts(prisma, companyId, [comment]);
  return contexts.get(comment.id) ?? null;
}

function findResponseRevision(
  commentedEdv: EdvWithDoc,
  documentVersions: readonly EdvWithDoc[],
): CommentEdvSnapshot | null {
  const newer = documentVersions.find(
    (version) =>
      version.id !== commentedEdv.id &&
      version.createdAt.getTime() > commentedEdv.createdAt.getTime(),
  );
  return newer ? toSnapshot(newer) : null;
}

function toSnapshot(edv: EdvWithDoc): CommentEdvSnapshot {
  return {
    engineeringDocumentVersionId: edv.id,
    engineeringDocumentId: edv.engineeringDocument.id,
    documentVersionId: edv.documentVersionId,
    documentTitle: edv.engineeringDocument.title,
    revisionLabel: edv.revisionLabel,
  };
}
