// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Collapse, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { CommentSeverity, MyCommentItem, ReviewModeComment } from '@/lib/api/epc.types';
import { useMyComments } from '@/lib/query/epc-workspace';
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
  const [activeTab, setActiveTab] = useState<'directed' | 'raised'>('directed');
  const { t } = useEpcTranslation();

  const raisedByMe = useMemo(
    () => (commentsQuery.data ?? []).filter((c) => c.createdBy === currentUserId),
    [commentsQuery.data, currentUserId],
  );
  const directedToMe = useMemo(
    () =>
      (commentsQuery.data ?? []).filter((c) =>
        c.isDirectedToMe === true
          ? true
          : c.assigneeId === currentUserId && c.createdBy !== currentUserId,
      ),
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

  function buildColumns(identityKind: 'assigned' | 'raised'): ColumnsType<MyCommentItem> {
    return [
      {
        title: 'Task',
        key: 'task',
        width: 140,
        ellipsis: { showTitle: true },
        render: (_value, record) => record.overseasTaskNumber ?? record.taskIdCode ?? '-',
      },
      {
        title: 'Subtask',
        key: 'subtask',
        width: 160,
        ellipsis: { showTitle: true },
        render: (_value, record) => record.subtaskId ?? record.packageCode ?? '-',
      },
      {
        title: 'Discipline',
        key: 'discipline',
        width: 140,
        render: (_value, record) => (
          <div className="min-w-0">
            <p className="truncate">
              {record.overseasTaskNumber ?? record.taskIdCode ?? '-'}-
              {formatDisciplineNumber(record.disciplineIndex)}
            </p>
            <p className="truncate text-xs text-slate-500">{record.disciplineName}</p>
          </div>
        ),
      },
      {
        title: 'Severity',
        dataIndex: 'severity',
        key: 'severity',
        width: 90,
        render: (severity: CommentSeverity | string) => (
          <CommentSeverityTag severity={severity as CommentSeverity} />
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: string) => (
          <StatusBadge label={status.replace(/_/g, ' ')} variant="info" />
        ),
      },
      identityKind === 'assigned'
        ? {
            title: 'Assigned to',
            key: 'assignee',
            width: 130,
            ellipsis: { showTitle: true },
            render: (_value, record) =>
              record.assigneeId === currentUserId
                ? 'You'
                : `${record.assigneeFirstName} ${record.assigneeLastName}`.trim() || '-',
          }
        : {
            title: 'Raised by',
            dataIndex: 'authorName',
            key: 'authorName',
            width: 130,
            ellipsis: { showTitle: true },
          },
      {
        title: '',
        key: 'view',
        width: 70,
        fixed: 'right',
        render: (_value, record) => (
          <Button type="link" className="!px-0" onClick={() => setSelectedComment(record)}>
            View
          </Button>
        ),
      },
    ];
  }

  const raisedColumns = buildColumns('assigned');
  const directedColumns = buildColumns('raised');

  function renderTabContent(
    pendingTitle: string,
    pendingItems: MyCommentItem[],
    completedItems: MyCommentItem[],
    columns: ColumnsType<MyCommentItem>,
  ): React.ReactNode {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{pendingTitle}</h3>
          <DataTable<MyCommentItem>
            rowKey="commentId"
            size="middle"
            columns={columns}
            dataSource={pendingItems}
            locale={{ emptyText: 'No pending comments' }}
          />
        </div>
        <Collapse
          bordered={false}
          className="bg-transparent"
          items={[
            {
              key: 'completed',
              label: `No action required (${completedItems.length})`,
              children: (
                <DataTable<MyCommentItem>
                  rowKey="commentId"
                  size="middle"
                  columns={columns}
                  dataSource={completedItems}
                  locale={{ emptyText: 'No resolved comments' }}
                />
              ),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <>
      <FormLayout
        title={t('pages.myComments.title')}
        description="Comments you have raised or received on subtask reviews."
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'directed' | 'raised')}
          items={[
            {
              key: 'directed',
              label: 'Directed to me',
              children: renderTabContent(
                'Action needed',
                directedPending,
                directedCompleted,
                directedColumns,
              ),
            },
            {
              key: 'raised',
              label: 'Raised by me',
              children: renderTabContent(
                'Pending verification',
                raisedPending,
                raisedCompleted,
                raisedColumns,
              ),
            },
          ]}
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
