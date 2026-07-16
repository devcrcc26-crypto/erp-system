'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Form, Input, Select, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import type { CommentSeverity, ReviewModeComment } from '@/lib/api/epc.types';
import { useUpdateReviewComment } from '@/lib/query/review-comments';
import { useDisciplineUploadFolder } from '@/lib/query/engineering-documents';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { standardDetailDrawerProps } from '@/lib/theme/layout';

interface EditCommentFormValues {
  engineeringDocumentVersionId: string;
  body: string;
  severity: CommentSeverity;
}

export default function ReviewCommentEditDrawer({
  open,
  comment,
  edvOptions,
  projectId,
  taskDisciplineId,
  onClose,
  onSaved,
}: {
  open: boolean;
  comment: ReviewModeComment | null;
  edvOptions: readonly { value: string; label: string }[];
  projectId: string;
  taskDisciplineId: string;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<EditCommentFormValues>();
  const updateComment = useUpdateReviewComment();
  const uploadDocument = useUploadDocumentToFolder();
  const uploadFolderQuery = useDisciplineUploadFolder(
    projectId,
    taskDisciplineId,
    open && Boolean(projectId) && Boolean(taskDisciplineId),
  );
  const messageApi = useAppMessage();
  const [commentFileVersionId, setCommentFileVersionId] = useState<string | null>(
    null,
  );
  const [commentFileName, setCommentFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !comment) {
      return;
    }
    form.setFieldsValue({
      engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
      body: comment.body ?? '',
      severity: comment.severity as CommentSeverity,
    });
    setCommentFileVersionId(null);
    setCommentFileName(null);
  }, [comment, form, open]);

  const documentContext = useMemo((): string | null => {
    if (!comment) {
      return null;
    }
    if (comment.commentedOn) {
      return `${comment.commentedOn.documentTitle} · Rev ${comment.commentedOn.revisionLabel}`;
    }
    const option = edvOptions.find(
      (item) => item.value === comment.engineeringDocumentVersionId,
    );
    return option?.label ?? null;
  }, [comment, edvOptions]);

  const drawerTitle = documentContext
    ? `Edit comment - ${documentContext}`
    : 'Edit comment';

  const existingAttachment = comment?.attachment ?? null;
  const effectiveFileName = commentFileName ?? existingAttachment?.name ?? null;

  async function handleSubmit(values: EditCommentFormValues): Promise<void> {
    if (!comment) {
      return;
    }
    const bodyText = values.body.trim();
    const nextFileVersionId =
      commentFileVersionId ??
      (!bodyText ? comment.attachment?.documentVersionId : undefined);
    if (!bodyText && !nextFileVersionId) {
      messageApi.error('Add comment text or attach a markup file');
      return;
    }
    try {
      await updateComment.mutateAsync({
        commentId: comment.id,
        body: {
          engineeringDocumentVersionId: values.engineeringDocumentVersionId,
          body: bodyText,
          severity: values.severity,
          assignedToUserId: comment.assignedToUserId,
          ...(nextFileVersionId
            ? { commentDocumentVersionId: nextFileVersionId }
            : {}),
        },
      });
      messageApi.success('Comment updated');
      onClose();
      onSaved();
    } catch (error) {
      notifyApiError(error, 'Failed to update comment', messageApi);
    }
  }

  return (
    <Drawer
      {...standardDetailDrawerProps}
      title={drawerTitle}
      open={open}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={updateComment.isPending}
            onClick={() => form.submit()}
          >
            Save changes
          </Button>
        </div>
      }
    >
      <Form<EditCommentFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values: EditCommentFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          name="engineeringDocumentVersionId"
          label="Document version"
          rules={[{ required: true }]}
        >
          <Select options={[...edvOptions]} placeholder="Select document" />
        </Form.Item>
        <Form.Item label="Attached file">
          <div className="space-y-2">
            {effectiveFileName ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-700">{effectiveFileName}</span>
                {existingAttachment && !commentFileVersionId ? (
                  <EdvFileActions
                    documentVersionId={existingAttachment.documentVersionId}
                    fileName={existingAttachment.name}
                  />
                ) : null}
                {commentFileVersionId ? (
                  <Button
                    type="link"
                    className="!px-0"
                    onClick={() => {
                      setCommentFileVersionId(null);
                      setCommentFileName(null);
                    }}
                  >
                    Undo new file
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No file attached</p>
            )}
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
                      messageApi.success('Comment file ready to save');
                    } else {
                      messageApi.error('Upload did not return a file version');
                    }
                  })
                  .catch((error: unknown) => {
                    notifyApiError(error, 'Failed to upload comment file', messageApi);
                  });
                return false;
              }}
            >
              <Button icon={<UploadOutlined />} loading={uploadDocument.isPending}>
                {effectiveFileName ? 'Replace file' : 'Attach markup file'}
              </Button>
            </Upload>
          </div>
        </Form.Item>
        <Form.Item
          name="body"
          label="Comment"
          rules={[
            {
              validator: async (_, value: string | undefined) => {
                if (value?.trim() || effectiveFileName) {
                  return;
                }
                throw new Error('Add comment text or attach a markup file');
              },
            },
          ]}
        >
          <Input.TextArea rows={4} />
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
        <Form.Item label="Assigned to">
          <span className="text-sm text-slate-700">
            {comment?.assigneeName ?? 'Not assigned'}
          </span>
        </Form.Item>
      </Form>
    </Drawer>
  );
}
