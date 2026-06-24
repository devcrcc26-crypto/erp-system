'use client';

import { useState } from 'react';
import { Button, Form, Input, Select, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { MessageSquare } from 'lucide-react';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import ReviewCommentEditDrawer from '@/components/modules/projects/review/ReviewCommentEditDrawer';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import type { CommentSeverity, ReviewModeComment, ReviewModeView } from '@/lib/api/epc.types';
import {
  useAddReviewComment,
  useDeleteReviewComment,
  useVerifyReviewComment,
} from '@/lib/query/review-comments';
import { useDisciplineUploadFolder } from '@/lib/query/engineering-documents';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useAuthStore } from '@/stores/auth.store';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { formatProjectDate } from '@/lib/utils/project-display';

interface CommentFormValues {
  engineeringDocumentVersionId: string;
  body?: string;
  severity: CommentSeverity;
  assignedToUserId: string;
}

function canMutateOwnOpenComment(
  comment: ReviewModeComment,
  currentUserId: string | undefined,
): boolean {
  return comment.createdBy === currentUserId && comment.status === 'OPEN';
}

export default function ReviewCommentPanel({
  reviewMode,
  edvOptions,
  projectId,
  taskDisciplineId,
  onCommentAdded,
}: {
  reviewMode: ReviewModeView | null | undefined;
  edvOptions: readonly { value: string; label: string }[];
  projectId: string;
  taskDisciplineId: string;
  onCommentAdded: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<CommentFormValues>();
  const addComment = useAddReviewComment();
  const verifyComment = useVerifyReviewComment();
  const deleteComment = useDeleteReviewComment();
  const uploadDocument = useUploadDocumentToFolder();
  const uploadFolderQuery = useDisciplineUploadFolder(projectId, taskDisciplineId);
  const [commentFileVersionId, setCommentFileVersionId] = useState<string | null>(
    null,
  );
  const [commentFileName, setCommentFileName] = useState<string | null>(null);
  const lens = useRoleLens();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [selectedComment, setSelectedComment] = useState<ReviewModeComment | null>(
    null,
  );
  const [editTarget, setEditTarget] = useState<ReviewModeComment | null>(null);
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
      const body = values.body?.trim();
      if (!body && !commentFileVersionId) {
        messageApi.error('Add comment text or attach a markup file');
        return;
      }

      await addComment.mutateAsync({
        reviewSessionId: reviewMode.reviewSessionId,
        engineeringDocumentVersionId: values.engineeringDocumentVersionId,
        body: body || undefined,
        commentDocumentVersionId: commentFileVersionId ?? undefined,
        severity: values.severity,
        assignedToUserId: values.assignedToUserId,
      });
      messageApi.success('Comment added');
      form.resetFields();
      setCommentFileVersionId(null);
      setCommentFileName(null);
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

  function openEdit(comment: ReviewModeComment): void {
    setSelectedComment(null);
    setEditTarget(comment);
  }

  return (
    <>
      {lens.canApproveReview ? (
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
            <Form.Item name="body" label="Comment summary">
              <Input.TextArea rows={3} placeholder="Optional when a markup file is attached" />
            </Form.Item>
            <Form.Item label="Comment file">
              <Upload
                maxCount={1}
                showUploadList={false}
                disabled={!uploadFolderQuery.data?.id || uploadDocument.isPending}
                beforeUpload={(file: File) => {
                  const folderId = uploadFolderQuery.data?.id;
                  if (!folderId) {
                    messageApi.error('Upload folder is not ready');
                    return Upload.LIST_IGNORE;
                  }
                  void uploadDocument
                    .mutateAsync({ folderId, file })
                    .then((record) => {
                      if (record.currentVersionId) {
                        setCommentFileVersionId(record.currentVersionId);
                        setCommentFileName(file.name);
                        messageApi.success('Comment file attached');
                      } else {
                        messageApi.error('Upload did not return a file version');
                      }
                    })
                    .catch((error) => {
                      notifyApiError(error, 'Failed to upload comment file', messageApi);
                    });
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={uploadDocument.isPending}>
                  Attach markup file
                </Button>
              </Upload>
              {commentFileName ? (
                <p className="mt-2 text-sm text-slate-600">Attached: {commentFileName}</p>
              ) : null}
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
        </FormLayout>
      ) : null}

      <FormLayout
        title="Session comments"
        description="All comments remain visible with their status until verified and closed."
      >
        <div className="space-y-3">
          {(reviewMode?.comments ?? []).length === 0 ? (
            <TableEmptyState
              icon={<MessageSquare />}
              title="No comments yet"
              description="Comments from reviewers will appear here once added"
            />
          ) : (
            reviewMode?.comments.map((comment) => {
              const canMutate = canMutateOwnOpenComment(comment, currentUserId);
              return (
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
                      {canMutate && (
                        <Button
                          type="link"
                          size="small"
                          className="!px-1"
                          onClick={() => openEdit(comment)}
                        >
                          Edit
                        </Button>
                      )}
                      {canMutate && (
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
                  {!comment.responseRevision &&
                    (comment.status === 'RESOLVED' || comment.status === 'VERIFIED') && (
                    <p className="mb-1 text-xs text-emerald-700">
                      Resolved
                      {comment.resolutionNote?.trim()
                        ? ` - ${comment.resolutionNote.trim()}`
                        : ''}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    {comment.commentedOn
                      ? `${comment.commentedOn.documentTitle} · Rev ${comment.commentedOn.revisionLabel}`
                      : edvLabelById.get(comment.engineeringDocumentVersionId) ??
                        'Document'}{' '}
                    · {comment.authorName} · {formatProjectDate(comment.createdAt)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </FormLayout>

      <ReviewCommentDetailDrawer
        open={Boolean(selectedComment)}
        commentId={selectedComment?.id ?? null}
        fallbackComment={selectedComment}
        documentLabel={
          selectedComment
            ? selectedComment.commentedOn
              ? `${selectedComment.commentedOn.documentTitle} · Rev ${selectedComment.commentedOn.revisionLabel}`
              : edvLabelById.get(selectedComment.engineeringDocumentVersionId)
            : undefined
        }
        canEdit={
          selectedComment
            ? canMutateOwnOpenComment(selectedComment, currentUserId)
            : false
        }
        canDelete={
          selectedComment
            ? canMutateOwnOpenComment(selectedComment, currentUserId)
            : false
        }
        deleteLoading={deleteComment.isPending}
        onClose={() => setSelectedComment(null)}
        onEdit={() => {
          if (selectedComment) {
            openEdit(selectedComment);
          }
        }}
        onDelete={() => {
          if (selectedComment) {
            setDeleteTarget(selectedComment);
          }
        }}
      />

      <ReviewCommentEditDrawer
        open={Boolean(editTarget)}
        comment={editTarget}
        edvOptions={edvSelectOptions}
        onClose={() => setEditTarget(null)}
        onSaved={onCommentAdded}
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
