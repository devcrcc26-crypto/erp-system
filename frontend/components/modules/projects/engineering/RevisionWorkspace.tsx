'use client';

import { Alert, Button, Form, Input, Modal, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import type { MyCommentItem } from '@/lib/api/epc.types';
import { apiGet } from '@/lib/api/client';
import {
  useDisciplineUploadFolder,
  useUploadEngineeringDocumentVersion,
} from '@/lib/query/engineering-documents';
import { useTransitionReviewComment } from '@/lib/query/review-comments';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { tokens } from '@/lib/theme/tokens';
import { useState } from 'react';

interface DocumentWithVersions {
  id: string;
  versions?: { id: string; versionNumber: number }[];
}

async function resolveLatestDocumentVersionId(
  documentId: string,
): Promise<string> {
  const document = await apiGet<DocumentWithVersions>(`/documents/${documentId}`);
  const version = document.versions?.[0];
  if (!version?.id) {
    throw new Error('Uploaded file version not found');
  }
  return version.id;
}

export default function RevisionWorkspace({
  open,
  comment,
  onClose,
  onResolved,
}: {
  open: boolean;
  comment: MyCommentItem | null;
  onClose: () => void;
  onResolved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<{ resolutionNote: string }>();
  const transitionComment = useTransitionReviewComment();
  const uploadDocument = useUploadDocumentToFolder();
  const uploadEdvVersion = useUploadEngineeringDocumentVersion();
  const messageApi = useAppMessage();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const uploadFolderQuery = useDisciplineUploadFolder(
    comment?.projectId ?? '',
    comment?.taskDisciplineId ?? '',
    open && Boolean(comment),
  );

  const uploading = uploadDocument.isPending || uploadEdvVersion.isPending;
  const resolving = transitionComment.isPending;

  function handleClose(): void {
    if (uploading || resolving) {
      return;
    }
    setPendingFile(null);
    form.resetFields();
    onClose();
  }

  async function handleUploadRevision(): Promise<void> {
    if (!comment || !pendingFile) {
      messageApi.error('Select a file to upload');
      return;
    }

    try {
      let folderId = uploadFolderQuery.data?.id;
      if (!folderId) {
        const folder = await uploadFolderQuery.refetch();
        folderId = folder.data?.id;
      }
      if (!folderId) {
        messageApi.error('Document folder could not be prepared for upload');
        return;
      }

      const uploaded = await uploadDocument.mutateAsync({
        folderId,
        file: pendingFile,
      });
      const documentVersionId = await resolveLatestDocumentVersionId(uploaded.id);

      await uploadEdvVersion.mutateAsync({
        projectId: comment.projectId,
        taskDisciplineId: comment.taskDisciplineId,
        engineeringDocumentId: comment.engineeringDocumentId,
        body: { documentVersionId },
      });

      messageApi.success('New revision uploaded');
      setPendingFile(null);
    } catch (error) {
      notifyApiError(error, 'Failed to upload revision', messageApi);
    }
  }

  async function handleResolve(values: { resolutionNote: string }): Promise<void> {
    if (!comment) {
      return;
    }
    if (comment.status !== 'IN_PROGRESS') {
      messageApi.warning('Start the comment before marking it resolved.');
      return;
    }

    try {
      await transitionComment.mutateAsync({
        commentId: comment.commentId,
        body: {
          targetStatus: 'RESOLVED',
          resolutionNote: values.resolutionNote.trim() || undefined,
        },
      });

      messageApi.success(
        'Comment marked resolved. When all comments are resolved, the package returns to the reviewer inbox.',
      );
      form.resetFields();
      setPendingFile(null);
      onResolved();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  return (
    <Modal
      title="Revise document"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={560}
      destroyOnHidden
    >
      {comment && (
        <div className="flex flex-col gap-5">
          <div
            className="rounded-lg border px-4 py-3"
            style={{
              borderColor: tokens.colorBorder,
              background: tokens.colorSurfaceSecondary,
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Review comment
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {comment.designPackageName}
            </p>
            <p className="mt-1 text-sm text-slate-700">{comment.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500">
                {comment.documentTitle} · Rev {comment.revisionLabel}
              </span>
              <EdvFileActions
                compact
                documentVersionId={comment.documentVersionId}
                fileName={comment.documentTitle}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-slate-900">
              1. Upload revised file
            </p>
            <p className="text-xs text-slate-500">
              Attach the updated drawing or document, then upload it as a new
              revision before marking the comment resolved.
            </p>
            <Upload
              maxCount={1}
              disabled={uploading || resolving}
              beforeUpload={(file: RcFile) => {
                setPendingFile(file);
                return false;
              }}
              onRemove={() => setPendingFile(null)}
              fileList={
                pendingFile
                  ? [{ uid: 'revision', name: pendingFile.name, status: 'done' }]
                  : []
              }
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.dwg"
            >
              <Button icon={<UploadOutlined />} disabled={uploading || resolving}>
                Select revised file
              </Button>
            </Upload>
            <Button
              type="default"
              loading={uploading}
              disabled={!pendingFile || resolving}
              onClick={() => void handleUploadRevision()}
            >
              Upload new revision
            </Button>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
            <p className="text-[13px] font-medium text-slate-900">
              2. Resolve comment
            </p>
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              onFinish={(values: { resolutionNote: string }) =>
                void handleResolve(values)
              }
            >
              <Form.Item
                name="resolutionNote"
                label="Resolution note"
                className="!mb-3"
              >
                <Input.TextArea
                  rows={3}
                  placeholder="Summarize what changed in this revision"
                  disabled={uploading || resolving}
                />
              </Form.Item>
              <div className="flex justify-end gap-2">
                <Button onClick={handleClose} disabled={uploading || resolving}>
                  Cancel
                </Button>
                <Button
                  type="primary"
                  loading={resolving}
                  disabled={uploading}
                  onClick={() => form.submit()}
                >
                  Mark resolved
                </Button>
              </div>
            </Form>
          </div>

          {comment.status !== 'IN_PROGRESS' && (
            <Alert
              type="warning"
              showIcon
              title="Start the comment before marking it resolved."
            />
          )}
        </div>
      )}
    </Modal>
  );
}
