'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Select, Tag, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { MessageSquare } from 'lucide-react';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import StatusBadge, {
  type StatusBadgeVariant,
} from '@/components/ui/StatusBadge/StatusBadge';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import ReviewCommentDetailDrawer from '@/components/modules/projects/review/ReviewCommentDetailDrawer';
import ReviewCommentEditDrawer from '@/components/modules/projects/review/ReviewCommentEditDrawer';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import type {
  CommentSeverity,
  CommentStatus,
  ReviewModeComment,
  ReviewModeView,
} from '@/lib/api/epc.types';
import {
  useAddReviewComment,
  useDeleteReviewComment,
  useVerifyReviewComment,
} from '@/lib/query/review-comments';
import { useDesignPackage } from '@/lib/query/design-packages';
import { useDisciplineUploadFolder } from '@/lib/query/engineering-documents';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useAuthStore } from '@/stores/auth.store';
import { resolveDefaultCommentAssignee } from '@/lib/utils/comment-workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { formatProjectDate } from '@/lib/utils/project-display';
import { resolveEdvDisplayLabel } from '@/lib/utils/edv-display';

interface CommentFormValues {
  engineeringDocumentVersionId: string;
  body?: string;
  severity: CommentSeverity;
  assignedToUserId: string;
}

function canMutateOwnOpenComment(
  comment: ReviewModeComment,
  currentUserId: string | undefined,
  sessionStatus: string | null | undefined,
): boolean {
  return (
    sessionStatus === 'ACTIVE' &&
    comment.createdBy === currentUserId &&
    comment.status === 'OPEN'
  );
}

function commentStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case 'ACKNOWLEDGED':
      return 'info';
    case 'IN_PROGRESS':
      return 'orange';
    case 'RESOLVED':
      return 'cyan';
    case 'VERIFIED':
      return 'success';
    case 'CLOSED':
    case 'OPEN':
    default:
      return 'default';
  }
}

export default function ReviewCommentPanel({
  reviewMode,
  edvOptions,
  snapshotEdvLabels = [],
  projectId,
  taskDisciplineId,
  onCommentAdded,
}: {
  reviewMode: ReviewModeView | null | undefined;
  edvOptions: readonly { value: string; label: string }[];
  snapshotEdvLabels?: readonly { id: string; engineeringDocumentName: string; revisionLabel: string }[];
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
  const designPackageId = reviewMode?.designPackageId ?? '';
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    designPackageId,
    Boolean(projectId) && Boolean(taskDisciplineId) && Boolean(designPackageId),
  );
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
  const [verifyingCommentId, setVerifyingCommentId] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, CommentStatus>
  >({});

  const defaultAssignee = useMemo(
    () => resolveDefaultCommentAssignee(packageQuery.data, reviewMode?.currentTier),
    [packageQuery.data, reviewMode?.currentTier],
  );

  useEffect(() => {
    if (defaultAssignee) {
      form.setFieldValue('assignedToUserId', defaultAssignee);
    }
  }, [defaultAssignee, reviewMode?.reviewSessionId, form]);

  const edvLabelById = new Map(edvOptions.map((option) => [option.value, option.label]));

  const edvSelectOptions =
    edvOptions.length > 0
      ? [...edvOptions]
      : (reviewMode?.packageEdvIds ?? []).map((id) => ({
          value: id,
          label: resolveEdvDisplayLabel(id, [], snapshotEdvLabels),
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

  async function handleVerifyComment(comment: ReviewModeComment): Promise<void> {
    setVerifyingCommentId(comment.id);
    try {
      await verifyComment.mutateAsync({ commentId: comment.id });
      setStatusOverrides((prev) => ({ ...prev, [comment.id]: 'VERIFIED' }));
      messageApi.success('Comment verified');
      onCommentAdded();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    } finally {
      setVerifyingCommentId(null);
    }
  }

  return (
    <>
      {/* {lens.canApproveReview ? (
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
              label="Assign to"
              rules={[{ required: true }]}
            >
              <UserSelect />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={addComment.isPending}>
              Add comment
            </Button>
          </Form>
        </FormLayout>
      ) : null} */}

      <FormLayout
        title="Session comments"
        description="Comments from your review tier on this session."
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
              const displayStatus = statusOverrides[comment.id] ?? comment.status;
              const canMutate = canMutateOwnOpenComment(
                comment,
                currentUserId,
                reviewMode?.sessionStatus,
              );
              const canVerify =
                displayStatus === 'RESOLVED' &&
                (comment.createdBy === currentUserId || lens.canApproveReview);
              const additionalDocs = (comment.documents ?? []).filter(
                (d) =>
                  d.engineeringDocumentVersionId !== comment.engineeringDocumentVersionId,
              );
              const primaryAttachment = comment.attachment ?? null;
              const markupFiles = (comment.files ?? []).filter((f) => !f.isResponseFile);
              const responseFiles = (comment.files ?? []).filter((f) => f.isResponseFile);
              const primaryRevisedFile = comment.responseAttachment
                ? {
                    documentVersionId: comment.responseAttachment.documentVersionId,
                    name: comment.responseAttachment.name,
                  }
                : comment.responseRevision
                  ? {
                      documentVersionId: comment.responseRevision.documentVersionId,
                      name: `${comment.responseRevision.documentTitle} · Rev ${comment.responseRevision.revisionLabel}`,
                    }
                  : null;
              const hasDesignerResponse =
                Boolean(primaryRevisedFile) || responseFiles.length > 0;
              const hasCommentAttachment =
                Boolean(primaryAttachment) || markupFiles.length > 0;

              return (
                <div
                  key={comment.id}
                  className="rounded border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <CommentSeverityTag severity={comment.severity} />
                      <StatusBadge
                        label={displayStatus.replace(/_/g, ' ')}
                        variant={commentStatusVariant(displayStatus)}
                      />
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
                      {canVerify && (
                        <Button
                          type="link"
                          size="small"
                          className="!px-1"
                          loading={verifyingCommentId === comment.id}
                          onClick={() => void handleVerifyComment(comment)}
                        >
                          Verify
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mb-1 line-clamp-2 text-slate-800">{comment.body}</p>
                  {additionalDocs.length > 0 && (
                    <div className="mb-1 flex flex-wrap gap-1">
                      {additionalDocs.map((doc) => (
                        <Tag key={doc.engineeringDocumentVersionId} className="!m-0">
                          {doc.documentTitle} · Rev {doc.revisionLabel}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {hasCommentAttachment && (
                    <div className="mb-2 space-y-1 border-t border-slate-100 pt-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Comment attachment
                      </p>
                      {primaryAttachment && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <span className="min-w-0 truncate">{primaryAttachment.name}</span>
                          <EdvFileActions
                            compact
                            documentVersionId={primaryAttachment.documentVersionId}
                            fileName={primaryAttachment.name}
                          />
                        </div>
                      )}
                      {markupFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
                        >
                          <span className="min-w-0 truncate">{file.fileName}</span>
                          <EdvFileActions
                            compact
                            documentVersionId={file.documentVersionId}
                            fileName={file.fileName}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {hasDesignerResponse && (
                    <div className="mb-2 space-y-1 border-t border-slate-100 pt-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                        Designer response
                      </p>
                      {primaryRevisedFile && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <span className="min-w-0 truncate">
                            Revised file: {primaryRevisedFile.name}
                          </span>
                          <EdvFileActions
                            compact
                            documentVersionId={primaryRevisedFile.documentVersionId}
                            fileName={primaryRevisedFile.name}
                          />
                        </div>
                      )}
                      {responseFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
                        >
                          <span className="min-w-0 truncate">{file.fileName}</span>
                          <EdvFileActions
                            compact
                            documentVersionId={file.documentVersionId}
                            fileName={file.fileName}
                          />
                        </div>
                      ))}
                      {comment.resolutionNote?.trim() ? (
                        <p className="text-xs text-slate-500">
                          {comment.resolutionNote.trim()}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {!hasDesignerResponse &&
                    (displayStatus === 'RESOLVED' || displayStatus === 'VERIFIED') && (
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
                        resolveEdvDisplayLabel(
                          comment.engineeringDocumentVersionId,
                          [],
                          snapshotEdvLabels,
                        )}{' '}
                    · {comment.authorName}
                    {comment.assigneeName ? ` → ${comment.assigneeName}` : ''} ·{' '}
                    {formatProjectDate(comment.createdAt)}
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
            ? canMutateOwnOpenComment(
                selectedComment,
                currentUserId,
                reviewMode?.sessionStatus,
              )
            : false
        }
        canDelete={
          selectedComment
            ? canMutateOwnOpenComment(
                selectedComment,
                currentUserId,
                reviewMode?.sessionStatus,
              )
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
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
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
