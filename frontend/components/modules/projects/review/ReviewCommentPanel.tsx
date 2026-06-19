'use client';

import { useState } from 'react';
import { Button, Form, Input, Select } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import type { CommentSeverity, ReviewModeComment, ReviewModeView } from '@/lib/api/epc.types';
import {
  useAddReviewComment,
  useDeleteReviewComment,
  useVerifyReviewComment,
} from '@/lib/query/review-comments';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useAuthStore } from '@/stores/auth.store';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { formatProjectDate } from '@/lib/utils/project-display';

interface CommentFormValues {
  engineeringDocumentVersionId: string;
  body: string;
  severity: CommentSeverity;
  assignedToUserId: string;
}

export default function ReviewCommentPanel({
  reviewMode,
  edvOptions,
  onCommentAdded,
}: {
  reviewMode: ReviewModeView | null | undefined;
  edvOptions: readonly { value: string; label: string }[];
  onCommentAdded: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<CommentFormValues>();
  const addComment = useAddReviewComment();
  const verifyComment = useVerifyReviewComment();
  const deleteComment = useDeleteReviewComment();
  const lens = useRoleLens();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [selectedComment, setSelectedComment] = useState<ReviewModeComment | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<ReviewModeComment | null>(null);

  const edvLabelById = new Map(edvOptions.map((option) => [option.value, option.label]));

  const edvSelectOptions = edvOptions.length > 0
    ? [...edvOptions]
    : (reviewMode?.packageEdvIds ?? []).map((id) => ({
        value: id,
        label: id.slice(0, 8) + '…',
      }));

  async function handleSubmit(values: CommentFormValues): Promise<void> {
    if (!reviewMode?.reviewSessionId) {
      messageApi.error('No active review session');
      return;
    }

    try {
      await addComment.mutateAsync({
        reviewSessionId: reviewMode.reviewSessionId,
        engineeringDocumentVersionId: values.engineeringDocumentVersionId,
        body: values.body.trim(),
        severity: values.severity,
        assignedToUserId: values.assignedToUserId,
      });
      messageApi.success('Comment added');
      form.resetFields();
      onCommentAdded();
    } catch (error) {
      notifyApiError(error, 'Failed to add comment', messageApi);
    }
  }

  async function handleDeleteComment(): Promise<void> {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteComment.mutateAsync(deleteTarget.id);
      messageApi.success('Comment removed');
      setDeleteTarget(null);
      setSelectedComment(null);
      onCommentAdded();
    } catch (error) {
      notifyApiError(error, 'Failed to remove comment', messageApi);
    }
  }

  function canDeleteComment(comment: ReviewModeComment): boolean {
    return (
      comment.createdBy === currentUserId &&
      comment.status === 'OPEN'
    );
  }

  return (
    <>
      <FormLayout title="Add comment" description="Severity drives review routing.">
        <Form<CommentFormValues>
          form={form}
          layout="vertical"
          initialValues={{ severity: 'MODERATE' as CommentSeverity }}
          onFinish={(values: CommentFormValues) => void handleSubmit(values)}
        >
          <Form.Item
            name="engineeringDocumentVersionId"
            label="Document version"
            rules={[{ required: true }]}
          >
            <Select options={edvSelectOptions} placeholder="Select document" />
          </Form.Item>
          <Form.Item name="body" label="Comment" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="severity" label="Severity" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'MINOR', label: 'Minor' },
                { value: 'MODERATE', label: 'Moderate' },
                { value: 'MAJOR', label: 'Major' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="assignedToUserId"
            label="Assign to designer"
            rules={[{ required: true }]}
          >
            <UserSelect />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={addComment.isPending}>
            Add comment
          </Button>
        </Form>

        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">Session comments</h4>
          {(reviewMode?.comments ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No comments yet.</p>
          ) : (
            reviewMode?.comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded border border-slate-200 bg-white p-3 text-sm"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <CommentSeverityTag severity={comment.severity} />
                    <span className="text-xs text-slate-500">
                      {comment.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button
                      type="link"
                      size="small"
                      className="!px-1"
                      onClick={() => setSelectedComment(comment)}
                    >
                      View
                    </Button>
                    {canDeleteComment(comment) && (
                      <Button
                        type="link"
                        size="small"
                        danger
                        className="!px-1"
                        onClick={() => setDeleteTarget(comment)}
                      >
                        Remove
                      </Button>
                    )}
                    {lens.canApproveReview && comment.status === 'RESOLVED' && (
                      <Button
                        type="link"
                        size="small"
                        className="!px-1"
                        loading={verifyComment.isPending}
                        onClick={() => {
                          void verifyComment
                            .mutateAsync({ commentId: comment.id })
                            .then(() => {
                              messageApi.success('Comment verified');
                              onCommentAdded();
                            })
                            .catch((error: unknown) => {
                              notifyApiError(error, 'Request failed', messageApi);
                            });
                        }}
                      >
                        Verify
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mb-1 line-clamp-2 text-slate-800">{comment.body}</p>
                <p className="text-xs text-slate-500">
                  {edvLabelById.get(comment.engineeringDocumentVersionId) ??
                    'Document'}{' '}
                  · {comment.authorName} · {formatProjectDate(comment.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </FormLayout>

      <ReviewCommentDetailDrawer
        open={Boolean(selectedComment)}
        commentId={selectedComment?.id ?? null}
        fallbackComment={selectedComment}
        documentLabel={
          selectedComment
            ? edvLabelById.get(selectedComment.engineeringDocumentVersionId)
            : undefined
        }
        canDelete={selectedComment ? canDeleteComment(selectedComment) : false}
        deleteLoading={deleteComment.isPending}
        onClose={() => setSelectedComment(null)}
        onDelete={() => {
          if (selectedComment) {
            setDeleteTarget(selectedComment);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove comment?"
        description="This open comment will be permanently removed from the review session."
        confirmLabel="Remove"
        danger
        confirmLoading={deleteComment.isPending}
        onConfirm={() => void handleDeleteComment()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
