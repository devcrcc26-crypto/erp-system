'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Space } from 'antd';
import { MessageSquare } from 'lucide-react';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewTierBadge from '@/components/modules/projects/review/ReviewTierBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import RevisionWorkspace from '@/components/modules/projects/engineering/RevisionWorkspace';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type { MyCommentItem, ReviewModeComment } from '@/lib/api/epc.types';
import { useTransitionReviewComment } from '@/lib/query/review-comments';
import { useAuthStore } from '@/stores/auth.store';
import { formatProjectDate } from '@/lib/utils/project-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

function commentStatusVariant(
  status: string,
): 'success' | 'warning' | 'info' | 'error' | 'default' {
  switch (status) {
    case 'VERIFIED':
    case 'CLOSED':
      return 'success';
    case 'RESOLVED':
      return 'info';
    case 'IN_PROGRESS':
    case 'ACKNOWLEDGED':
      return 'warning';
    default:
      return 'default';
  }
}

function toMyCommentItem(
  comment: ReviewModeComment,
  projectId: string,
  taskDisciplineId: string,
  packageName: string,
  designPackageId: string,
  reviewSessionId: string,
): MyCommentItem {
  const doc = comment.commentedOn;
  return {
    commentId: comment.id,
    body: comment.body ?? '',
    status: comment.status as MyCommentItem['status'],
    severity: comment.severity,
    engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
    documentVersionId: doc?.documentVersionId ?? '',
    engineeringDocumentId: doc?.engineeringDocumentId ?? '',
    documentTitle: doc?.documentTitle ?? 'Document',
    revisionLabel: doc?.revisionLabel ?? '-',
    projectId,
    projectName: '',
    taskDisciplineId,
    disciplineName: '',
    disciplineIndex: null,
    overseasTaskNumber: null,
    taskIdCode: null,
    subtaskId: null,
    packageCode: null,
    designPackageId,
    designPackageName: packageName,
    reviewSessionId,
    authorName: comment.authorName,
    assigneeId: comment.assignedToUserId,
    assigneeFirstName: comment.assigneeName,
    assigneeLastName: '',
    createdBy: comment.createdBy,
    createdAt: comment.createdAt,
    commentInboxStatus:
      comment.status === 'VERIFIED' ||
      comment.status === 'CLOSED' ||
      comment.status === 'RESOLVED'
        ? 'COMPLETED'
        : 'PENDING',
    resolutionNote: comment.resolutionNote ?? null,
    verifiedAt: comment.verifiedAt ?? null,
    responseDocumentVersionId: null,
    responseDocumentTitle: null,
    isDirectedToMe: comment.assignedToUserId !== comment.createdBy,
  };
}

/**
 * Package-level review comments - actionable for assigned designers via packageLens.
 */
export default function DesignPackageCommentsSection({
  projectId,
  taskDisciplineId,
  packageId,
  packageName,
  reviewSessionId,
  comments,
  onChanged,
  canActOnAssignedComments = false,
  canOpenReviewMode = false,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  packageName: string;
  reviewSessionId: string;
  comments: readonly ReviewModeComment[];
  onChanged: () => void;
  /** Designer: Acknowledge / Start / Revise on comments assigned to them. */
  canActOnAssignedComments?: boolean;
  /** Reviewer-tier: link into review mode. */
  canOpenReviewMode?: boolean;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const transitionComment = useTransitionReviewComment();
  const [selectedComment, setSelectedComment] = useState<ReviewModeComment | null>(
    null,
  );
  const [revisionComment, setRevisionComment] = useState<MyCommentItem | null>(null);
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null);

  async function handleTransition(
    comment: ReviewModeComment,
    targetStatus: MyCommentItem['status'],
    successMessage: string,
  ): Promise<boolean> {
    setPendingCommentId(comment.id);
    try {
      await transitionComment.mutateAsync({
        commentId: comment.id,
        body: { targetStatus },
      });
      messageApi.success(successMessage);
      onChanged();
      return true;
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
      return false;
    } finally {
      setPendingCommentId(null);
    }
  }

  async function openRevisionWorkspace(comment: ReviewModeComment): Promise<void> {
    const item = toMyCommentItem(
      comment,
      projectId,
      taskDisciplineId,
      packageName,
      packageId,
      reviewSessionId,
    );
    if (comment.status === 'ACKNOWLEDGED') {
      const started = await handleTransition(comment, 'IN_PROGRESS', 'Marked in progress');
      if (!started) {
        return;
      }
      setRevisionComment({ ...item, status: 'IN_PROGRESS' });
      return;
    }
    setRevisionComment(item);
  }

  if (comments.length === 0) {
    return (
      <FormLayout title="Review comments" description="Comments raised during the active review session.">
        <TableEmptyState
          icon={<MessageSquare />}
          title="No comments on this subtask yet"
          description={`Review comments for ${packageName} will appear here during the active session`}
        />
      </FormLayout>
    );
  }

  return (
    <>
      <FormLayout
        title="Review comments"
        description={
          canActOnAssignedComments
            ? 'Comments assigned to you can be acknowledged, started, and revised here. Resolved comments stay visible until the reviewer verifies them.'
            : 'All session comments remain visible with their current status.'
        }
        extra={
          canActOnAssignedComments ? (
            <Link href={`/projects/${projectId}/my-comments`}>
              <Button size="small">Open My Comments</Button>
            </Link>
          ) : canOpenReviewMode ? (
            <Link
              href={`/design-packages/${packageId}/review?projectId=${projectId}&disciplineId=${taskDisciplineId}`}
            >
              <Button size="small" type="primary">
                Open review mode
              </Button>
            </Link>
          ) : undefined
        }
      >
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {comments.map((comment) => {
            const isAssignee = comment.assignedToUserId === currentUserId;
            const canAct = canActOnAssignedComments && isAssignee;

            return (
              <li key={comment.id} className="p-4 text-sm">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <CommentSeverityTag severity={comment.severity} />
                    <ReviewTierBadge tier={comment.reviewTier} />
                    <StatusBadge
                      label={comment.status.replace(/_/g, ' ')}
                      variant={commentStatusVariant(comment.status)}
                    />
                  </div>
                  <Space size="small" wrap>
                    <Button
                      type="link"
                      size="small"
                      className="!px-1"
                      onClick={() => setSelectedComment(comment)}
                    >
                      View
                    </Button>
                    {canAct && comment.status === 'OPEN' && (
                      <Button
                        type="link"
                        size="small"
                        className="!px-1"
                        loading={pendingCommentId === comment.id}
                        onClick={() =>
                          void handleTransition(comment, 'ACKNOWLEDGED', 'Comment acknowledged')
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                    {canAct && comment.status === 'ACKNOWLEDGED' && (
                      <Button
                        type="link"
                        size="small"
                        className="!px-1"
                        loading={pendingCommentId === comment.id}
                        onClick={() =>
                          void handleTransition(comment, 'IN_PROGRESS', 'Marked in progress')
                        }
                      >
                        Start
                      </Button>
                    )}
                    {canAct &&
                      (comment.status === 'IN_PROGRESS' ||
                        comment.status === 'ACKNOWLEDGED') && (
                        <Button
                          type="link"
                          size="small"
                          className="!px-1"
                          onClick={() => void openRevisionWorkspace(comment)}
                        >
                          Revise
                        </Button>
                      )}
                    {canAct && comment.status === 'RESOLVED' && (
                      <span className="text-xs text-slate-500">Awaiting reviewer</span>
                    )}
                    {canAct && comment.status === 'VERIFIED' && (
                      <span className="text-xs text-emerald-700">Verified by reviewer</span>
                    )}
                  </Space>
                </div>
                <p className="mb-1 text-slate-800">{comment.body ?? '(File attachment)'}</p>
                {comment.responseRevision && (
                  <p className="mb-1 text-xs text-emerald-700">
                    {comment.status === 'RESOLVED' || comment.status === 'VERIFIED'
                      ? `Revised to Rev ${comment.responseRevision.revisionLabel}`
                      : `Draft revision Rev ${comment.responseRevision.revisionLabel} uploaded`}
                    {comment.resolutionNote?.trim()
                      ? ` - ${comment.resolutionNote.trim()}`
                      : ''}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {comment.commentedOn
                    ? `${comment.commentedOn.documentTitle} · Rev ${comment.commentedOn.revisionLabel}`
                    : 'Document'}{' '}
                  · {comment.authorName}
                  {comment.assigneeName ? ` → ${comment.assigneeName}` : ''} ·{' '}
                  {formatProjectDate(comment.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      </FormLayout>

      <ReviewCommentDetailDrawer
        open={Boolean(selectedComment)}
        commentId={selectedComment?.id ?? null}
        fallbackComment={selectedComment}
        documentLabel={
          selectedComment?.commentedOn
            ? `${selectedComment.commentedOn.documentTitle} · Rev ${selectedComment.commentedOn.revisionLabel}`
            : undefined
        }
        canEdit={false}
        canDelete={false}
        onClose={() => setSelectedComment(null)}
      />

      <RevisionWorkspace
        open={Boolean(revisionComment)}
        comment={revisionComment}
        onClose={() => setRevisionComment(null)}
        onResolved={() => {
          setRevisionComment(null);
          onChanged();
        }}
      />
    </>
  );
}
