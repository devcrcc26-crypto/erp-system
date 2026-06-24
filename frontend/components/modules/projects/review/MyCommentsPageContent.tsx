// UI polish pass — styles only, no logic changes

'use client';

import { useState } from 'react';
import { Alert, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import RevisionWorkspace from '@/components/modules/projects/engineering/RevisionWorkspace';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { CommentSeverity, MyCommentItem, ReviewModeComment } from '@/lib/api/epc.types';
import { useMyComments } from '@/lib/query/epc-workspace';
import { useTransitionReviewComment } from '@/lib/query/review-comments';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyComments,
  useCapabilitiesReady,
} from '@/hooks/use-pm-capabilities';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

function toReviewModeComment(comment: MyCommentItem): ReviewModeComment {
  return {
    id: comment.commentId,
    body: comment.body,
    status: comment.status,
    severity: comment.severity,
    engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
    createdBy: '',
    createdAt: comment.createdAt,
    assignedToUserId: '',
    authorName: comment.authorName,
    assigneeName: 'You',
  };
}

export default function MyCommentsPageContent({
  projectId,
}: {
  projectId?: string;
} = {}): React.ReactNode {
  const commentsQuery = useMyComments(projectId);
  const transitionComment = useTransitionReviewComment();
  const [selectedComment, setSelectedComment] = useState<MyCommentItem | null>(null);
  const [revisionComment, setRevisionComment] = useState<MyCommentItem | null>(null);
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canViewMyComments = useCanViewMyComments();
  const capabilitiesReady = useCapabilitiesReady();

  if (!capabilitiesReady) {
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

  const columns: ColumnsType<MyCommentItem> = [
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
    {
      title: '',
      key: 'actions',
      width: 280,
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
              loading={transitionComment.isPending}
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
              loading={transitionComment.isPending}
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
          {record.status === 'RESOLVED' && (
            <span className="text-xs text-slate-500">Awaiting reviewer</span>
          )}
          {record.status === 'VERIFIED' && (
            <span className="text-xs text-emerald-700">Verified by reviewer</span>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <FormLayout
        title={t('pages.myComments.title')}
        description="Review comments assigned to you. Acknowledge, upload a revised document, then mark resolved."
      >
        <DataTable<MyCommentItem>
          rowKey="commentId"
          size="middle"
          columns={columns}
          dataSource={commentsQuery.data ?? []}
          loading={commentsQuery.isLoading}
          scroll={{ x: 960 }}
          locale={{ emptyText: t('empty.noComments') }}
        />
      </FormLayout>

      <ReviewCommentDetailDrawer
        open={Boolean(selectedComment)}
        commentId={selectedComment?.commentId ?? null}
        fallbackComment={
          selectedComment ? toReviewModeComment(selectedComment) : null
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
