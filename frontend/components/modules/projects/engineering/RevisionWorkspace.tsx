'use client';

import Link from 'next/link';
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

  function handleClose(): void {
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
        values.resolutionNote.trim()
          ? 'Comment marked resolved'
          : 'Comment marked resolved',
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
      title="Upload revision"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={520}
      destroyOnHidden
    >
      {comment && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {comment.documentTitle} · Rev {comment.revisionLabel}
          </p>

          <Alert
            type="info"
            showIcon
            title={comment.designPackageName}
            description={comment.body}
          />

          <div className="flex flex-wrap items-center gap-2">
            <EdvFileActions
              compact
              documentVersionId={comment.documentVersionId}
              fileName={comment.documentTitle}
            />
            <Link
              href={`/projects/${comment.projectId}/disciplines/${comment.taskDisciplineId}`}
              className="text-sm text-orange-600 hover:underline"
            >
              Open discipline
            </Link>
          </div>

          <Upload
            maxCount={1}
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
          >
            <Button icon={<UploadOutlined />}>Select revised file</Button>
          </Upload>

          <Button
            type="default"
            block
            loading={uploadDocument.isPending || uploadEdvVersion.isPending}
            disabled={!pendingFile}
            onClick={() => void handleUploadRevision()}
          >
            Upload new revision
          </Button>

          <Form
            form={form}
            layout="vertical"
            onFinish={(values: { resolutionNote: string }) => void handleResolve(values)}
          >
            <Form.Item name="resolutionNote" label="Resolution note">
              <Input.TextArea rows={3} placeholder="Summarize changes made" />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                type="primary"
                loading={transitionComment.isPending}
                onClick={() => form.submit()}
              >
                Mark resolved
              </Button>
            </div>
          </Form>
        </div>
      )}
    </Modal>
  );
}
