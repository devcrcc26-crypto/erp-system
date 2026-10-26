'use client';

import { useState } from 'react';
import { Button, Spin, Tooltip, Upload } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { FilePlus2 } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { DocumentPreview } from '@/components/shared/preview';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useDeleteUserDocument,
  useUploadUserDocuments,
  useUserDocuments,
} from '@/lib/query/users';
import {
  myProfileDocumentDownloadPath,
  useMyProfileDocuments,
} from '@/lib/query/profile';
import type { UserProfileDocument } from '@/lib/api/types';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface EmployeeProfileDocumentsProps {
  userId: string;
  canDelete?: boolean;
  /** Hide the inner title when already wrapped by a section/card header. */
  embedded?: boolean;
  /** View-only: hides the upload and delete controls (downloads stay). */
  readOnly?: boolean;
  /**
   * `self` reads the signed-in user's own documents via /auth/me (no HR
   * permission needed). Defaults to `user` (HR access via /users/:id).
   */
  source?: 'user' | 'self';
  /** Replaces the default empty-state text. */
  emptyMessage?: string;
}

/** Label saved with an uploaded file: its name without the extension. */
function defaultDocumentLabel(file: File): string {
  return file.name.replace(/\.[^.]+$/, '') || file.name;
}

function SavedDocumentCard({
  document,
  downloadPath,
  canDelete,
  isDeleting,
  onDelete,
  deleteLabel,
}: {
  document: UserProfileDocument;
  /** Endpoint returning the document's signed URL (self or HR scope). */
  downloadPath: string;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  deleteLabel: string;
}): React.ReactNode {
  return (
    <DocumentPreview
      documentId={document.id}
      fileName={document.name}
      fileType={document.fileType}
      fileSizeBytes={document.fileSizeBytes}
      urlPath={downloadPath}
      metaExtra={new Date(document.createdAt).toLocaleDateString()}
      extraActions={
        canDelete ? (
          <Tooltip title={deleteLabel}>
            <Button
              type="text"
              danger
              size="small"
              className="erp-profile-doc-card-action"
              icon={<DeleteOutlined />}
              loading={isDeleting}
              onClick={onDelete}
              aria-label={deleteLabel}
            />
          </Tooltip>
        ) : null
      }
    />
  );
}

/**
 * Employee profile documents. Selecting one or more files uploads them
 * straight away (labelled with their file names); saved files can be
 * downloaded and, for HR, deleted.
 */
export default function EmployeeProfileDocuments({
  userId,
  canDelete = true,
  embedded = false,
  readOnly = false,
  source = 'user',
  emptyMessage,
}: EmployeeProfileDocumentsProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const isSelf = source === 'self';
  const userDocumentsQuery = useUserDocuments(userId, !isSelf);
  const myDocumentsQuery = useMyProfileDocuments(isSelf);
  const documentsQuery = isSelf ? myDocumentsQuery : userDocumentsQuery;
  const uploadMutation = useUploadUserDocuments();
  const deleteMutation = useDeleteUserDocument();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const documentPendingDelete =
    documentsQuery.data?.find((doc) => doc.id === confirmDeleteId) ?? null;

  async function uploadFiles(files: File[]): Promise<void> {
    try {
      await uploadMutation.mutateAsync({
        userId,
        files,
        labels: files.map(defaultDocumentLabel),
      });
      messageApi.success(t('users.documentsUploaded'));
    } catch (error: unknown) {
      notifyApiError(error, t('users.documentsUploadError'), messageApi);
    }
  }

  /**
   * Upload calls this once per selected file in the same tick; send the whole
   * selection as one upload when the last file of the batch arrives.
   */
  function handleSelectFiles(file: File, batch: File[]): false {
    if (file === batch[batch.length - 1]) {
      void uploadFiles(batch);
    }
    return false;
  }

  function documentDownloadPath(documentId: string): string {
    return isSelf
      ? myProfileDocumentDownloadPath(documentId)
      : `/users/${userId}/documents/${documentId}/download-url`;
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!confirmDeleteId) {
      return;
    }
    const documentId = confirmDeleteId;
    setDeletingId(documentId);
    try {
      await deleteMutation.mutateAsync({ userId, documentId });
      messageApi.success(t('users.documentDeleted'));
      setConfirmDeleteId(null);
    } catch (error: unknown) {
      notifyApiError(error, t('users.documentDeleteError'), messageApi);
    } finally {
      setDeletingId(null);
    }
  }

  const documents = documentsQuery.data ?? [];
  const hasDocuments = documents.length > 0;

  return (
    <div className={`erp-profile-docs ${embedded ? 'erp-profile-docs--embedded' : ''}`.trim()}>
      {!embedded ? (
        <div className="erp-profile-docs-header">
          <div>
            <h3 className="erp-profile-docs-title">{t('users.form.profileDocuments')}</h3>
            <p className="m-0 mt-1 text-xs text-slate-500">{t('users.form.documentsHelp')}</p>
          </div>
        </div>
      ) : null}

      {readOnly ? null : (
        <div className="erp-profile-docs-toolbar">
          <Upload
            multiple
            beforeUpload={handleSelectFiles}
            showUploadList={false}
            disabled={uploadMutation.isPending}
          >
            <Button icon={<UploadOutlined />} loading={uploadMutation.isPending}>
              {t('users.form.uploadDocuments')}
            </Button>
          </Upload>
        </div>
      )}

      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={Boolean(confirmDeleteId)}
        title={t('users.deleteDocumentTitle')}
        description={t('users.deleteDocumentDescription', {
          name: documentPendingDelete?.name ?? '',
        })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        confirmLoading={deletingId === confirmDeleteId && deleteMutation.isPending}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setConfirmDeleteId(null);
          }
        }}
      />

      <Spin spinning={documentsQuery.isLoading}>
        {hasDocuments ? (
          <div className="erp-profile-docs-grid">
            {documents.map((document) => (
              <SavedDocumentCard
                key={document.id}
                document={document}
                downloadPath={documentDownloadPath(document.id)}
                canDelete={canDelete && !readOnly}
                isDeleting={deletingId === document.id}
                deleteLabel={t('common.delete')}
                onDelete={() => setConfirmDeleteId(document.id)}
              />
            ))}
          </div>
        ) : !documentsQuery.isLoading ? (
          <div className="erp-profile-docs-empty">
            <div className="erp-profile-docs-empty-icon" aria-hidden>
              <FilePlus2 size={22} strokeWidth={1.6} />
            </div>
            <p className="erp-profile-docs-empty-title">
              {emptyMessage ?? t('users.noDocuments')}
            </p>
          </div>
        ) : null}
      </Spin>
    </div>
  );
}
