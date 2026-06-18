'use client';

import { useState } from 'react';
import { Button, Space, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { CommentSeverity, MyCommentItem } from '@/lib/api/epc.types';
import { useMyComments } from '@/lib/query/epc-workspace';
import {
  useTransitionReviewComment,
  useVerifyReviewComment,
} from '@/lib/query/review-comments';
import RevisionWorkspace from '@/components/modules/projects/engineering/RevisionWorkspace';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function MyCommentsPageContent(): React.ReactNode {
  const commentsQuery = useMyComments();
  const transitionComment = useTransitionReviewComment();
  const verifyComment = useVerifyReviewComment();
  const [revisionComment, setRevisionComment] = useState<MyCommentItem | null>(null);

  const columns: ColumnsType<MyCommentItem> = [
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
      render: (severity: CommentSeverity | string) => (
        <CommentSeverityTag severity={severity as CommentSeverity} />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <StatusBadge label={status.replace(/_/g, ' ')} variant="info" />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: '',
      key: 'actions',
      width: 220,
      render: (_value, record) => (
        <Space size="small" wrap>
          {record.status === 'OPEN' && (
            <Button
              type="link"
              className="!px-0"
              loading={transitionComment.isPending}
              onClick={() => {
                void transitionComment
                  .mutateAsync({
                    commentId: record.commentId,
                    body: { targetStatus: 'IN_PROGRESS' },
                  })
                  .then(() => {
                    message.success('Marked in progress');
                    void commentsQuery.refetch();
                  });
              }}
            >
              Start
            </Button>
          )}
          {['OPEN', 'IN_PROGRESS', 'ACKNOWLEDGED'].includes(record.status) && (
            <Button
              type="link"
              className="!px-0"
              onClick={() => setRevisionComment(record)}
            >
              Revise
            </Button>
          )}
          {record.status === 'RESOLVED' && (
            <Button
              type="link"
              className="!px-0"
              loading={verifyComment.isPending}
              onClick={() => {
                void verifyComment
                  .mutateAsync({ commentId: record.commentId })
                  .then(() => {
                    message.success('Comment verified');
                    void commentsQuery.refetch();
                  });
              }}
            >
              Verify
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <FormLayout
      title="My Comments"
      description="Designer queue — resolve reviewer comments and upload revisions."
    >
      <Table<MyCommentItem>
        rowKey="commentId"
        size="middle"
        columns={columns}
        dataSource={commentsQuery.data ?? []}
        loading={commentsQuery.isLoading}
        pagination={false}
        locale={{ emptyText: 'No comments assigned to you' }}
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
    </FormLayout>
  );
}
