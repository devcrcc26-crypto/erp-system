'use client';

import { useMemo } from 'react';
import { Button, Descriptions, Drawer, Spin } from 'antd';
import CommentRevisionSection from '@/components/modules/projects/review/CommentRevisionSection';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { ReviewCommentDetail, ReviewModeComment } from '@/lib/api/epc.types';
import { useReviewComment } from '@/lib/query/review-comments';
import { formatProjectDate } from '@/lib/utils/project-display';
import { antDrawerBodyStyles } from '@/lib/theme/layout';

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
      revisionLabel: '—',
    },
    responseRevision: fallbackComment.responseRevision ?? null,
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
}): React.ReactNode {
  const detailQuery = useReviewComment(commentId ?? '', open && Boolean(commentId));

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
        ? `${comment.engineeringDocumentVersionId.slice(0, 8)}…`
        : '—');

  const drawerTitle =
    resolvedDocumentLabel !== '—'
      ? `Comment — ${resolvedDocumentLabel}`
      : 'Comment detail';

  const showResponse =
    comment &&
    (Boolean(comment.responseRevision) ||
      Boolean(comment.resolutionNote?.trim()) ||
      Boolean(comment.resolvedAt) ||
      comment.status === 'RESOLVED' ||
      comment.status === 'VERIFIED' ||
      comment.status === 'CLOSED');

  return (
    <Drawer
      title={drawerTitle}
      open={open}
      onClose={onClose}
      size={520}
      styles={antDrawerBodyStyles}
      footer={
        canEdit || (canDelete && onDelete) ? (
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Close</Button>
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
      {detailQuery.isLoading && !comment ? (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      ) : !comment ? (
        <p className="text-sm text-slate-500">Comment not found.</p>
      ) : (
        <div className="space-y-4">
          <Descriptions bordered size="small" column={1}>
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
              <p className="whitespace-pre-wrap text-sm text-slate-800">
                {comment.body}
              </p>
            </Descriptions.Item>
          </Descriptions>

          {showResponse ? (
            <CommentRevisionSection
              commentedOn={comment.commentedOn}
              responseRevision={comment.responseRevision}
              resolutionNote={comment.resolutionNote}
              resolvedAt={comment.resolvedAt}
              verifiedAt={comment.verifiedAt}
            />
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
