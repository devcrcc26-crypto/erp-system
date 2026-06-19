'use client';

import { useMemo } from 'react';
import { Button, Descriptions, Drawer, Spin } from 'antd';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { ReviewModeComment } from '@/lib/api/epc.types';
import { useReviewComment } from '@/lib/query/review-comments';
import { formatProjectDate } from '@/lib/utils/project-display';
import { antDrawerBodyStyles } from '@/lib/theme/layout';

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

  const comment = useMemo(() => {
    if (detailQuery.data) {
      return detailQuery.data;
    }
    if (fallbackComment && fallbackComment.id === commentId) {
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
      };
    }
    return null;
  }, [commentId, detailQuery.data, fallbackComment]);

  const resolvedDocumentLabel =
    documentLabel ??
    (comment
      ? `${comment.engineeringDocumentVersionId.slice(0, 8)}…`
      : '—');

  return (
    <Drawer
      title="Comment detail"
      open={open}
      onClose={onClose}
      size={480}
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
      )}
    </Drawer>
  );
}
