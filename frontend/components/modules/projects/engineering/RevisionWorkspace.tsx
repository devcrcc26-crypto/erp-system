'use client';

import { Alert, Button, Form, Input, Modal, Tag, Upload } from 'antd';
import { CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
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

type PendingFile = {
  uid: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  documentVersionId?: string;
  /** True when this file created (or is creating) the primary engineering revision. */
  createdEdv?: boolean;
};

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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const uploadFolderQuery = useDisciplineUploadFolder(
    comment?.projectId ?? '',
    comment?.taskDisciplineId ?? '',
    open && Boolean(comment),
  );

  const uploading = pendingFiles.some((f) => f.status === 'uploading');
  const resolving = transitionComment.isPending;
  const allUploaded =
    pendingFiles.length > 0 && pendingFiles.every((f) => f.status === 'done');
  const hasPrimaryEdv = pendingFiles.some((f) => f.status === 'done' && f.createdEdv);
  const canResolve = allUploaded && hasPrimaryEdv && !uploading && !resolving;

  function updateFile(uid: string, patch: Partial<PendingFile>): void {
    setPendingFiles((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f)),
    );
  }

  function removeFile(uid: string): void {
    setPendingFiles((prev) => prev.filter((f) => f.uid !== uid));
  }

  function handleClose(): void {
    if (uploading || resolving) {
      return;
    }
    setPendingFiles([]);
    form.resetFields();
    onClose();
  }

  async function handleUploadRevision(
    pending: PendingFile,
    createEdv: boolean,
  ): Promise<void> {
    if (!comment) {
      return;
    }

    updateFile(pending.uid, { status: 'uploading' });

    try {
      let folderId = uploadFolderQuery.data?.id;
      if (!folderId) {
        const folder = await uploadFolderQuery.refetch();
        folderId = folder.data?.id;
      }
      if (!folderId) {
        throw new Error('Document folder could not be prepared for upload');
      }

      const uploaded = await uploadDocument.mutateAsync({
        folderId,
        file: pending.file,
      });
      const documentVersionId = await resolveLatestDocumentVersionId(uploaded.id);

      if (createEdv) {
        await uploadEdvVersion.mutateAsync({
          projectId: comment.projectId,
          taskDisciplineId: comment.taskDisciplineId,
          engineeringDocumentId: comment.engineeringDocumentId,
          body: { documentVersionId },
        });
      }

      updateFile(pending.uid, {
        status: 'done',
        documentVersionId,
        createdEdv: createEdv,
      });
      messageApi.success(
        createEdv ? 'Revised file uploaded' : 'Additional file uploaded',
      );
    } catch (error) {
      updateFile(pending.uid, { status: 'error', createdEdv: false });
      notifyApiError(error, 'Failed to upload revision', messageApi);
    }
  }

  function handleAddFile(file: RcFile): boolean {
    const uid = crypto.randomUUID();

    setPendingFiles((prev) => {
      const hasPrimaryEdv = prev.some(
        (f) =>
          f.createdEdv === true &&
          (f.status === 'done' || f.status === 'uploading' || f.status === 'pending'),
      );
      const createEdv = !hasPrimaryEdv;
      const pending: PendingFile = {
        uid,
        file,
        status: 'pending',
        createdEdv: createEdv,
      };
      void handleUploadRevision(pending, createEdv);
      return [...prev, pending];
    });

    return false;
  }

  async function handleResolve(values: { resolutionNote: string }): Promise<void> {
    if (!comment) {
      return;
    }
    if (comment.status !== 'IN_PROGRESS') {
      messageApi.warning('Start the comment before marking it resolved.');
      return;
    }
    if (!allUploaded) {
      messageApi.error('Upload all revised files before resolving');
      return;
    }
    if (!hasPrimaryEdv) {
      messageApi.error(
        'Upload a primary revised file for this document before resolving',
      );
      return;
    }

    try {
      const primaryVersionId = pendingFiles.find(
        (f) => f.status === 'done' && f.createdEdv && Boolean(f.documentVersionId),
      )?.documentVersionId;

      const additionalIds = pendingFiles
        .filter(
          (f) =>
            f.status === 'done' &&
            !f.createdEdv &&
            Boolean(f.documentVersionId),
        )
        .map((f) => f.documentVersionId as string);

      await transitionComment.mutateAsync({
        commentId: comment.commentId,
        body: {
          targetStatus: 'RESOLVED',
          resolutionNote: values.resolutionNote.trim() || undefined,
          responseDocumentVersionId: primaryVersionId,
          additionalResponseDocumentVersionIds: additionalIds,
        },
      });

      messageApi.success(
        'Comment marked resolved. When all comments are resolved, the subtask returns to the reviewer inbox.',
      );
      form.resetFields();
      setPendingFiles([]);
      onResolved();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  function statusLabel(status: PendingFile['status']): string {
    switch (status) {
      case 'uploading':
        return 'Uploading…';
      case 'done':
        return 'Done';
      case 'error':
        return 'Failed';
      default:
        return 'Pending';
    }
  }

  return (
    <Modal
      title="Revise document"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={560}
      className="erp-responsive-modal"
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
              1. Upload revised file(s)
            </p>
            <p className="text-xs text-slate-500">
              Attach one or more updated drawings or documents. The first file
              becomes the primary revision; additional files are stored with the
              response. Upload starts automatically on select.
            </p>
            <Upload
              multiple
              showUploadList={false}
              disabled={resolving}
              beforeUpload={(file: RcFile) => handleAddFile(file)}
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.dwg"
            >
              <Button icon={<UploadOutlined />} disabled={resolving}>
                + Add revised file
              </Button>
            </Upload>
            {pendingFiles.length > 0 && (
              <ul className="mt-2 space-y-2">
                {pendingFiles.map((f) => (
                  <li
                    key={f.uid}
                    className="flex items-center justify-between gap-2 text-sm text-slate-700"
                  >
                    <span className="min-w-0 truncate">{f.file.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Tag
                        color={
                          f.status === 'done'
                            ? 'success'
                            : f.status === 'error'
                              ? 'error'
                              : f.status === 'uploading'
                                ? 'processing'
                                : 'default'
                        }
                      >
                        {statusLabel(f.status)}
                      </Tag>
                      {(f.status === 'pending' || f.status === 'error') && (
                        <CloseCircleOutlined
                          className="cursor-pointer text-slate-400 hover:text-red-500"
                          onClick={() => removeFile(f.uid)}
                        />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message:
                      'Resolution note is required. Please describe what was changed before resolving.',
                  },
                ]}
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
                  disabled={!canResolve}
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
