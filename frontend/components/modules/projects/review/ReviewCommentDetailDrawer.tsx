// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Descriptions, Drawer, Tag } from 'antd';
import CommentRevisionSection from '@/components/modules/projects/review/CommentRevisionSection';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import RevisionWorkspace from '@/components/modules/projects/engineering/RevisionWorkspace';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type {
  MyCommentItem,
  ReviewCommentDetail,
  ReviewModeComment,
} from '@/lib/api/epc.types';
import { useReviewComment, useTransitionReviewComment } from '@/lib/query/review-comments';
import { useDesignPackageReviewMode } from '@/lib/query/epc-workspace';
import { formatProjectDate } from '@/lib/utils/project-display';
import { resolveEdvDisplayLabel } from '@/lib/utils/edv-display';
import { reviewModeHref } from '@/lib/utils/schedule-subtasks';
import { layout, standardDetailDrawerProps } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';

function RaisedCommentCard({ comment }: { comment: ReviewModeComment }): React.ReactNode {
  const docChips =
    comment.documents && comment.documents.length > 0
      ? comment.documents.map((doc) => (
          <Tag key={doc.engineeringDocumentVersionId} className="!m-0">
            {doc.documentTitle} · Rev {doc.revisionLabel}
          </Tag>
        ))
      : comment.commentedOn
        ? [
            <Tag key={comment.commentedOn.engineeringDocumentVersionId} className="!m-0">
              {comment.commentedOn.documentTitle} · Rev {comment.commentedOn.revisionLabel}
            </Tag>,
          ]
        : [];

  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CommentSeverityTag severity={comment.severity} />
        <StatusBadge label={comment.status.replace(/_/g, ' ')} variant="info" />
      </div>
      <p className="mb-2 whitespace-pre-wrap text-slate-800">{comment.body}</p>
      {docChips.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">{docChips}</div>
      )}
      {comment.attachment && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="min-w-0 truncate">Comment file: {comment.attachment.name}</span>
          <EdvFileActions
            compact
            documentVersionId={comment.attachment.documentVersionId}
            fileName={comment.attachment.name}
          />
        </div>
      )}
      {comment.responseAttachment && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="min-w-0 truncate">
            Response attachment: {comment.responseAttachment.name}
          </span>
          <EdvFileActions
            compact
            documentVersionId={comment.responseAttachment.documentVersionId}
            fileName={comment.responseAttachment.name}
          />
        </div>
      )}
      <p className={`mt-1 ${layout.drawerMutedText}`}>
        {comment.status.replace(/_/g, ' ')} · {formatProjectDate(comment.createdAt)}
      </p>
    </div>
  );
}

function mergeFallbackComment(
  fallbackComment: ReviewModeComment,
): ReviewCommentDetail {
  return {
    id: fallbackComment.id,
    reviewSessionId: '',
    designPackageId: '',
    engineeringDocumentVersionId: fallbackComment.engineeringDocumentVersionId,
    body: fallbackComment.body,
    severity: fallbackComment.severity,
    status: fallbackComment.status,
    createdBy: fallbackComment.createdBy,
    authorName: fallbackComment.authorName,
    assignedToUserId: fallbackComment.assignedToUserId,
    assigneeName: fallbackComment.assigneeName,
    createdAt: fallbackComment.createdAt,
    updatedAt: fallbackComment.createdAt,
    resolutionNote: fallbackComment.resolutionNote ?? null,
    resolvedAt: fallbackComment.resolvedAt ?? null,
    verifiedAt: fallbackComment.verifiedAt ?? null,
    commentedOn: fallbackComment.commentedOn ?? {
      engineeringDocumentVersionId: fallbackComment.engineeringDocumentVersionId,
      engineeringDocumentId: '',
      documentVersionId: '',
      documentTitle: 'Document',
      revisionLabel: '-',
    },
    responseRevision: fallbackComment.responseRevision ?? null,
    attachment: fallbackComment.attachment ?? null,
    responseAttachment: fallbackComment.responseAttachment ?? null,
  };
}

export default function ReviewCommentDetailDrawer({
  open,
  commentId,
  fallbackComment,
  documentLabel,
  canEdit,
  canDelete,
  deleteLoading,
  onClose,
  onEdit,
  onDelete,
  mode,
  myCommentItem,
  onChanged,
}: {
  open: boolean;
  commentId: string | null;
  fallbackComment?: ReviewModeComment | null;
  documentLabel?: string;
  canEdit: boolean;
  canDelete: boolean;
  deleteLoading?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** When set, shows an "Open in review mode" footer link and (for 'directed-to-me') the progressive workflow action. */
  mode?: 'raised-by-me' | 'directed-to-me';
  /** Required alongside `mode` — carries projectId/taskDisciplineId/reviewSessionId not present on ReviewCommentDetail. */
  myCommentItem?: MyCommentItem | null;
  /** Called after Acknowledge/Start/Revise succeeds, so the parent list can refetch. */
  onChanged?: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isRaisedByMe = mode === 'raised-by-me';
  const detailQuery = useReviewComment(
    commentId ?? '',
    open && Boolean(commentId) && !isRaisedByMe,
  );
  const transitionComment = useTransitionReviewComment();
  const [transitioning, setTransitioning] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const sessionCommentsQuery = useDesignPackageReviewMode(
    myCommentItem?.designPackageId ?? '',
    open && isRaisedByMe && Boolean(myCommentItem),
    myCommentItem?.reviewSessionId ?? null,
  );

  const myRaisedComments = useMemo(() => {
    if (!isRaisedByMe) {
      return [];
    }
    const all = (sessionCommentsQuery.data?.comments ?? []).filter(
      (c) => c.createdBy === currentUserId,
    );
    return [...all].sort((a, b) => {
      if (a.id === commentId) return -1;
      if (b.id === commentId) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [isRaisedByMe, sessionCommentsQuery.data, currentUserId, commentId]);

  const comment = useMemo((): ReviewCommentDetail | null => {
    if (detailQuery.data) {
      return detailQuery.data;
    }
    if (fallbackComment && fallbackComment.id === commentId) {
      return mergeFallbackComment(fallbackComment);
    }
    return null;
  }, [commentId, detailQuery.data, fallbackComment]);

  const resolvedDocumentLabel =
    documentLabel ??
    (comment?.commentedOn
      ? `${comment.commentedOn.documentTitle} · Rev ${comment.commentedOn.revisionLabel}`
      : comment
        ? resolveEdvDisplayLabel(comment.engineeringDocumentVersionId, [])
        : '-');

  const drawerTitle = isRaisedByMe
    ? `Comments I raised — ${myCommentItem?.subtaskId ?? myCommentItem?.packageCode ?? ''}`
    : resolvedDocumentLabel !== '-'
      ? `Comment - ${resolvedDocumentLabel}`
      : 'Comment detail';

  const showResponse =
    comment &&
    (Boolean(comment.responseRevision) ||
      Boolean(comment.responseAttachment) ||
      Boolean(comment.resolutionNote?.trim()) ||
      Boolean(comment.resolvedAt) ||
      comment.status === 'RESOLVED' ||
      comment.status === 'VERIFIED' ||
      comment.status === 'CLOSED');

  async function handleTransition(targetStatus: 'ACKNOWLEDGED' | 'IN_PROGRESS'): Promise<void> {
    if (!commentId) {
      return;
    }
    setTransitioning(true);
    try {
      await transitionComment.mutateAsync({ commentId, body: { targetStatus } });
      messageApi.success(
        targetStatus === 'ACKNOWLEDGED' ? 'Comment acknowledged' : 'Marked in progress',
      );
      void detailQuery.refetch();
      onChanged?.();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    } finally {
      setTransitioning(false);
    }
  }

  const reviewModeUrl =
    mode && myCommentItem
      ? reviewModeHref(
          myCommentItem.projectId,
          myCommentItem.taskDisciplineId,
          myCommentItem.designPackageId,
          myCommentItem.reviewSessionId,
          { readOnly: true },
        )
      : null;

  return (
    <>
      <Drawer
        {...standardDetailDrawerProps}
        title={drawerTitle}
        open={open}
        onClose={onClose}
        footer={
          canEdit || (canDelete && onDelete) || reviewModeUrl ? (
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Close</Button>
              {reviewModeUrl ? (
                <Link href={reviewModeUrl}>
                  <Button>Open in review mode</Button>
                </Link>
              ) : null}
              {canEdit && onEdit ? (
                <Button type="primary" onClick={onEdit}>
                  Edit
                </Button>
              ) : null}
              {canDelete && onDelete ? (
                <Button danger loading={deleteLoading} onClick={onDelete}>
                  Remove
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {isRaisedByMe ? (
          sessionCommentsQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              <div className="erp-page-skeleton h-10 w-full rounded" />
              <div className="erp-page-skeleton h-10 w-full rounded" />
              <div className="erp-page-skeleton h-24 w-full rounded" />
            </div>
          ) : myRaisedComments.length === 0 ? (
            <p className={layout.drawerMutedText}>No comments found for this session.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {myRaisedComments.map((c) => (
                <RaisedCommentCard key={c.id} comment={c} />
              ))}
            </div>
          )
        ) : detailQuery.isLoading && !comment ? (
          <div className="flex flex-col gap-3">
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-24 w-full rounded" />
          </div>
        ) : !comment ? (
          <p className={layout.drawerMutedText}>Comment not found.</p>
        ) : (
          <div className={layout.drawerStack}>
            <Descriptions
              className={layout.drawerDescriptionsClass}
              bordered
              size="small"
              column={1}
            >
              <Descriptions.Item label="Document">
                {resolvedDocumentLabel}
              </Descriptions.Item>
              <Descriptions.Item label="Severity">
                <CommentSeverityTag severity={comment.severity} />
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <StatusBadge
                  label={comment.status.replace(/_/g, ' ')}
                  variant="info"
                />
              </Descriptions.Item>
              <Descriptions.Item label="Author">
                {comment.authorName}
              </Descriptions.Item>
              <Descriptions.Item label="Assigned to">
                {comment.assigneeName}
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {formatProjectDate(comment.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="Comment">
                <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                  {comment.body}
                </p>
              </Descriptions.Item>
              {comment.attachment ? (
                <Descriptions.Item label="Attachment">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] text-[var(--color-text-primary)]">
                      {comment.attachment.name}
                    </span>
                    <EdvFileActions
                      compact
                      documentVersionId={comment.attachment.documentVersionId}
                      fileName={comment.attachment.name}
                    />
                  </div>
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            {mode === 'directed-to-me' && (
              <div className={layout.drawerSection}>
                {comment.status === 'OPEN' && (
                  <Button
                    type="primary"
                    size="small"
                    loading={transitioning}
                    onClick={() => void handleTransition('ACKNOWLEDGED')}
                  >
                    Acknowledge
                  </Button>
                )}
                {comment.status === 'ACKNOWLEDGED' && (
                  <Button
                    type="primary"
                    size="small"
                    loading={transitioning}
                    onClick={() => void handleTransition('IN_PROGRESS')}
                  >
                    Start work
                  </Button>
                )}
                {comment.status === 'IN_PROGRESS' && (
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => setRevisionOpen(true)}
                  >
                    Revise
                  </Button>
                )}
                {(comment.status === 'RESOLVED' ||
                  comment.status === 'VERIFIED' ||
                  comment.status === 'CLOSED') && (
                  <p className={layout.drawerMutedText}>Resolved</p>
                )}
              </div>
            )}

            {showResponse ? (
              <section className={layout.drawerSection}>
                <CommentRevisionSection
                commentedOn={comment.commentedOn}
                responseRevision={comment.responseRevision}
                responseAttachment={comment.responseAttachment}
                resolutionNote={comment.resolutionNote}
                resolvedAt={comment.resolvedAt}
                verifiedAt={comment.verifiedAt}
                />
              </section>
            ) : null}
          </div>
        )}
      </Drawer>

      <RevisionWorkspace
        open={revisionOpen}
        comment={
          myCommentItem
            ? { ...myCommentItem, status: comment?.status ?? myCommentItem.status }
            : null
        }
        onClose={() => setRevisionOpen(false)}
        onResolved={() => {
          setRevisionOpen(false);
          void detailQuery.refetch();
          onChanged?.();
        }}
      />
    </>
  );
}
