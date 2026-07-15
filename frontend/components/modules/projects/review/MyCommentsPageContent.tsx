// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Collapse, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import RevisionWorkspace from '@/components/modules/projects/engineering/RevisionWorkspace';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { CommentSeverity, MyCommentItem, ReviewModeComment } from '@/lib/api/epc.types';
import { useMyComments } from '@/lib/query/epc-workspace';
import { useTransitionReviewComment, useVerifyReviewComment } from '@/lib/query/review-comments';
import { formatProjectDate } from '@/lib/utils/project-display';
import { reviewModeHref } from '@/lib/utils/schedule-subtasks';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyComments,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';
import { formatDisciplineNumber } from '@/lib/utils/discipline-display';

function toReviewModeComment(
  comment: MyCommentItem,
  currentUserId?: string,
): ReviewModeComment {
  return {
    id: comment.commentId,
    body: comment.body,
    status: comment.status,
    severity: comment.severity,
    reviewTier: null,
    engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
    createdBy: comment.createdBy,
    createdAt: comment.createdAt,
    assignedToUserId: comment.assigneeId,
    authorName: comment.authorName,
    assigneeName:
      comment.assigneeId === currentUserId
        ? 'You'
        : `${comment.assigneeFirstName} ${comment.assigneeLastName}`.trim(),
    responseAttachment: comment.responseDocumentVersionId
      ? {
          documentVersionId: comment.responseDocumentVersionId,
          name: comment.responseDocumentTitle ?? 'Response file',
        }
      : null,
  };
}

export default function MyCommentsPageContent({
  projectId,
}: {
  projectId?: string;
} = {}): React.ReactNode {
  const permLoading = usePermissionsLoading();
  const canViewMyComments = useCanViewMyComments();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const commentsQuery = useMyComments(projectId);
  const transitionComment = useTransitionReviewComment();
  const verifyComment = useVerifyReviewComment();
  const [selectedComment, setSelectedComment] = useState<MyCommentItem | null>(null);
  const [revisionComment, setRevisionComment] = useState<MyCommentItem | null>(null);
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null);
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();

  const raisedByMe = useMemo(
    () => (commentsQuery.data ?? []).filter((c) => c.createdBy === currentUserId),
    [commentsQuery.data, currentUserId],
  );
  const directedToMe = useMemo(
    () => (commentsQuery.data ?? []).filter((c) => c.assigneeId === currentUserId),
    [commentsQuery.data, currentUserId],
  );
  const raisedPending = useMemo(
    () => raisedByMe.filter((c) => c.commentInboxStatus === 'PENDING'),
    [raisedByMe],
  );
  const raisedCompleted = useMemo(
    () => raisedByMe.filter((c) => c.commentInboxStatus === 'COMPLETED'),
    [raisedByMe],
  );
  const directedPending = useMemo(
    () => directedToMe.filter((c) => c.commentInboxStatus === 'PENDING'),
    [directedToMe],
  );
  const directedCompleted = useMemo(
    () => directedToMe.filter((c) => c.commentInboxStatus === 'COMPLETED'),
    [directedToMe],
  );

  if (permLoading || commentsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewMyComments) {
    return (
      <Alert type="warning" showIcon title="You do not have access to the designer comment queue." />
    );
  }

  async function handleTransition(
    comment: MyCommentItem,
    targetStatus: MyCommentItem['status'],
    successMessage: string,
  ): Promise<boolean> {
    setPendingCommentId(comment.commentId);
    try {
      await transitionComment.mutateAsync({
        commentId: comment.commentId,
        body: { targetStatus },
      });
      messageApi.success(successMessage);
      void commentsQuery.refetch();
      return true;
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
      return false;
    } finally {
      setPendingCommentId(null);
    }
  }

  async function handleVerify(comment: MyCommentItem): Promise<void> {
    setPendingCommentId(comment.commentId);
    try {
      await verifyComment.mutateAsync({ commentId: comment.commentId });
      messageApi.success('Comment verified');
      void commentsQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    } finally {
      setPendingCommentId(null);
    }
  }

  async function openRevisionWorkspace(comment: MyCommentItem): Promise<void> {
    if (comment.status === 'ACKNOWLEDGED') {
      const started = await handleTransition(comment, 'IN_PROGRESS', 'Marked in progress');
      if (!started) {
        return;
      }
      setRevisionComment({ ...comment, status: 'IN_PROGRESS' });
      return;
    }
    setRevisionComment(comment);
  }

  function viewInReviewModeLink(record: MyCommentItem): React.ReactNode {
    return (
      <Link
        href={reviewModeHref(
          record.projectId,
          record.taskDisciplineId,
          record.designPackageId,
          record.reviewSessionId,
          { readOnly: true },
        )}
      >
        View in review mode
      </Link>
    );
  }

  const baseColumns: ColumnsType<MyCommentItem> = [
    {
      title: 'Task',
      key: 'task',
      width: 120,
      ellipsis: true,
      render: (_value, record) =>
        record.overseasTaskNumber ?? record.taskIdCode ?? '-',
    },
    {
      title: 'Subtask',
      key: 'subtask',
      width: 140,
      ellipsis: true,
      render: (_value, record) => record.subtaskId ?? record.packageCode ?? '-',
    },
    {
      title: 'Discipline',
      key: 'discipline',
      width: 100,
      render: (_value, record) => formatDisciplineNumber(record.disciplineIndex),
    },
    {
      title: 'Document',
      key: 'document',
      ellipsis: true,
      render: (_value, record) => (
        <div>
          <p className="font-medium text-slate-900">{record.documentTitle}</p>
          <p className="text-xs text-slate-500">
            Rev {record.revisionLabel} · {record.designPackageName}
          </p>
        </div>
      ),
    },
    {
      title: 'Comment',
      dataIndex: 'body',
      key: 'body',
      ellipsis: true,
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 110,
      render: (severity: CommentSeverity | string) => (
        <CommentSeverityTag severity={severity as CommentSeverity} />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <StatusBadge label={status.replace(/_/g, ' ')} variant="info" />
      ),
    },
    ...(projectId
      ? []
      : [
          {
            title: 'Project',
            key: 'project',
            ellipsis: true,
            render: (_value: unknown, record: MyCommentItem) => record.projectName,
          } as const,
        ]),
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (value: string) => formatProjectDate(value),
    },
  ];

  const completedExtraColumns: ColumnsType<MyCommentItem> = [
    {
      title: 'Resolution note',
      dataIndex: 'resolutionNote',
      key: 'resolutionNote',
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: 'Verified',
      dataIndex: 'verifiedAt',
      key: 'verifiedAt',
      width: 120,
      render: (value: string | null) => (value ? formatProjectDate(value) : '-'),
    },
  ];

  // "Directed to me" pending: assignee-side workflow actions (Acknowledge/Start/Revise).
  const directedPendingColumns: ColumnsType<MyCommentItem> = [
    ...baseColumns,
    {
      title: '',
      key: 'actions',
      width: 360,
      fixed: 'right',
      render: (_value, record) => (
        <Space size="small" wrap>
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedComment(record)}
          >
            View
          </Button>
          {record.status === 'OPEN' && (
            <Button
              type="link"
              className="!px-0"
              loading={pendingCommentId === record.commentId}
              onClick={() =>
                void handleTransition(record, 'ACKNOWLEDGED', 'Comment acknowledged')
              }
            >
              Acknowledge
            </Button>
          )}
          {record.status === 'ACKNOWLEDGED' && (
            <Button
              type="link"
              className="!px-0"
              loading={pendingCommentId === record.commentId}
              onClick={() =>
                void handleTransition(record, 'IN_PROGRESS', 'Marked in progress')
              }
            >
              Start
            </Button>
          )}
          {(record.status === 'IN_PROGRESS' || record.status === 'ACKNOWLEDGED') && (
            <Button
              type="link"
              className="!px-0"
              onClick={() => void openRevisionWorkspace(record)}
            >
              Revise
            </Button>
          )}
          {viewInReviewModeLink(record)}
        </Space>
      ),
    },
  ];

  // "I raised" pending: raiser-side workflow action (Verify a RESOLVED comment).
  const raisedPendingColumns: ColumnsType<MyCommentItem> = [
    ...baseColumns,
    {
      title: '',
      key: 'actions',
      width: 280,
      fixed: 'right',
      render: (_value, record) => (
        <Space size="small" wrap>
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedComment(record)}
          >
            View
          </Button>
          {record.status === 'RESOLVED' && (
            <Button
              type="link"
              className="!px-0"
              loading={pendingCommentId === record.commentId}
              onClick={() => void handleVerify(record)}
            >
              Verify
            </Button>
          )}
          {viewInReviewModeLink(record)}
        </Space>
      ),
    },
  ];

  const completedColumns: ColumnsType<MyCommentItem> = [
    ...baseColumns,
    ...completedExtraColumns,
    {
      title: '',
      key: 'actions',
      width: 280,
      fixed: 'right',
      render: (_value, record) => (
        <Space size="small" wrap>
          <Button type="link" className="!px-0" onClick={() => setSelectedComment(record)}>
            View
          </Button>
          {viewInReviewModeLink(record)}
        </Space>
      ),
    },
  ];

  const emptyText = 'No comments in this section';

  const collapseItems = [
    {
      key: 'raised-pending',
      label: (
        <span className="inline-flex items-center gap-2">
          Comments I raised — Awaiting verification
          <Badge count={raisedPending.length} size="small" />
        </span>
      ),
      children: (
        <DataTable<MyCommentItem>
          rowKey="commentId"
          size="middle"
          columns={raisedPendingColumns}
          dataSource={raisedPending}
          scroll={{ x: 960 }}
          locale={{ emptyText }}
        />
      ),
    },
    {
      key: 'raised-completed',
      label: (
        <span className="inline-flex items-center gap-2">
          Comments I raised — Completed
          <Badge count={raisedCompleted.length} size="small" />
        </span>
      ),
      children: (
        <DataTable<MyCommentItem>
          rowKey="commentId"
          size="middle"
          columns={completedColumns}
          dataSource={raisedCompleted}
          scroll={{ x: 960 }}
          locale={{ emptyText }}
        />
      ),
    },
    {
      key: 'directed-pending',
      label: (
        <span className="inline-flex items-center gap-2">
          Comments directed to me — Action needed
          <Badge count={directedPending.length} size="small" />
        </span>
      ),
      children: (
        <DataTable<MyCommentItem>
          rowKey="commentId"
          size="middle"
          columns={directedPendingColumns}
          dataSource={directedPending}
          scroll={{ x: 960 }}
          locale={{ emptyText }}
        />
      ),
    },
    {
      key: 'directed-completed',
      label: (
        <span className="inline-flex items-center gap-2">
          Comments directed to me — Resolved
          <Badge count={directedCompleted.length} size="small" />
        </span>
      ),
      children: (
        <DataTable<MyCommentItem>
          rowKey="commentId"
          size="middle"
          columns={completedColumns}
          dataSource={directedCompleted}
          scroll={{ x: 960 }}
          locale={{ emptyText }}
        />
      ),
    },
  ];

  return (
    <>
      <FormLayout
        title={t('pages.myComments.title')}
        description="Review comments assigned to you. Acknowledge, upload a revised document, then mark resolved."
      >
        <Collapse
          bordered={false}
          className="bg-transparent"
          defaultActiveKey={['raised-pending', 'directed-pending']}
          items={collapseItems}
        />
      </FormLayout>

      <ReviewCommentDetailDrawer
        open={Boolean(selectedComment)}
        commentId={selectedComment?.commentId ?? null}
        fallbackComment={
          selectedComment
            ? toReviewModeComment(selectedComment, currentUserId)
            : null
        }
        documentLabel={
          selectedComment
            ? `${selectedComment.documentTitle} · Rev ${selectedComment.revisionLabel}`
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
          void commentsQuery.refetch();
        }}
      />
    </>
  );
}
