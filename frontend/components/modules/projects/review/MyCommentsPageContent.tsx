// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Collapse } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { CommentSeverity, MyCommentItem, ReviewModeComment } from '@/lib/api/epc.types';
import { useMyComments } from '@/lib/query/epc-workspace';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyComments,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
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
  const [selectedComment, setSelectedComment] = useState<MyCommentItem | null>(null);
  const { t } = useEpcTranslation();

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
      width: 130,
      render: (_value, record) => (
        <div>
          <p>
            {record.overseasTaskNumber ?? record.taskIdCode ?? '-'}-
            {formatDisciplineNumber(record.disciplineIndex)}
          </p>
          <p className="text-xs text-slate-500">{record.disciplineName}</p>
        </div>
      ),
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

  const assignedToColumn: ColumnsType<MyCommentItem>[number] = {
    title: 'Assigned to',
    key: 'assignee',
    width: 160,
    ellipsis: true,
    render: (_value, record) =>
      record.assigneeId === currentUserId
        ? 'You'
        : `${record.assigneeFirstName} ${record.assigneeLastName}`.trim() || '-',
  };

  const raisedByColumn: ColumnsType<MyCommentItem>[number] = {
    title: 'Raised by',
    dataIndex: 'authorName',
    key: 'authorName',
    width: 160,
    ellipsis: true,
  };

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

  const viewActionColumn: ColumnsType<MyCommentItem>[number] = {
    title: '',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render: (_value, record) => (
      <Button type="link" className="!px-0" onClick={() => setSelectedComment(record)}>
        View
      </Button>
    ),
  };

  const directedPendingColumns: ColumnsType<MyCommentItem> = [
    ...baseColumns,
    raisedByColumn,
    viewActionColumn,
  ];

  const raisedPendingColumns: ColumnsType<MyCommentItem> = [
    ...baseColumns,
    assignedToColumn,
    viewActionColumn,
  ];

  const raisedCompletedColumns: ColumnsType<MyCommentItem> = [
    ...baseColumns,
    assignedToColumn,
    ...completedExtraColumns,
    viewActionColumn,
  ];

  const directedCompletedColumns: ColumnsType<MyCommentItem> = [
    ...baseColumns,
    raisedByColumn,
    ...completedExtraColumns,
    viewActionColumn,
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
          columns={raisedCompletedColumns}
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
          columns={directedCompletedColumns}
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
        mode={
          selectedComment
            ? selectedComment.createdBy === currentUserId
              ? 'raised-by-me'
              : 'directed-to-me'
            : undefined
        }
        myCommentItem={selectedComment}
        onChanged={() => void commentsQuery.refetch()}
      />
    </>
  );
}
