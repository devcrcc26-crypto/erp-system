'use client';

import { useState } from 'react';
import { Button, Input, Spin, Tooltip, Upload } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { FilePlus2 } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { apiGet } from '@/lib/api/client';
import {
  useDeleteUserDocument,
  useUploadUserDocuments,
  useUserDocuments,
} from '@/lib/query/users';
import type { UserProfileDocument } from '@/lib/api/types';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PendingUpload {
  uid: string;
  file: File;
  label: string;
}

interface EmployeeProfileDocumentsProps {
  userId: string;
  canDelete?: boolean;
  /** Hide the inner title when already wrapped by a section/card header. */
  embedded?: boolean;
}

function PendingDocumentCard({
  fileName,
  fileType,
  fileSizeBytes,
  label,
  onLabelChange,
  onRemove,
  labelPlaceholder,
}: {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  label: string;
  onLabelChange: (value: string) => void;
  onRemove: () => void;
  labelPlaceholder: string;
}): React.ReactNode {
  return (
    <article className="erp-profile-doc-card erp-profile-doc-card--pending">
      <div className="erp-profile-doc-card-top">
        <ProfileFileTypeIcon name={fileName} fileType={fileType} />
        <Tooltip title={labelPlaceholder}>
          <Button
            type="text"
            danger
            size="small"
            className="erp-profile-doc-card-action"
            icon={<DeleteOutlined />}
            onClick={onRemove}
            aria-label="Remove"
          />
        </Tooltip>
      </div>
      <div className="erp-profile-doc-card-body">
        <p className="erp-profile-doc-card-name" title={fileName}>
          {fileName}
        </p>
        <p className="erp-profile-doc-card-meta">
          {profileFileMetaLine(fileName, fileType, fileSizeBytes)}
        </p>
        <Input
          size="small"
          className="erp-profile-doc-card-label"
          placeholder={labelPlaceholder}
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </div>
    </article>
  );
}

function SavedDocumentCard({
  document,
  canDelete,
  isDeleting,
  isDownloading,
  onDownload,
  onDelete,
  downloadLabel,
  deleteLabel,
}: {
  document: UserProfileDocument;
  canDelete: boolean;
  isDeleting: boolean;
  isDownloading: boolean;
  onDownload: () => void;
  onDelete: () => void;
  downloadLabel: string;
  deleteLabel: string;
}): React.ReactNode {
  const dateLabel = new Date(document.createdAt).toLocaleDateString();

  return (
    <article className="erp-profile-doc-card">
      <div className="erp-profile-doc-card-top">
        <ProfileFileTypeIcon name={document.name} fileType={document.fileType} />
        <div className="erp-profile-doc-card-actions">
          <Tooltip title={downloadLabel}>
            <Button
              type="text"
              size="small"
              className="erp-profile-doc-card-action"
              icon={<DownloadOutlined />}
              loading={isDownloading}
              onClick={onDownload}
              aria-label={downloadLabel}
            />
          </Tooltip>
          {canDelete ? (
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
          ) : null}
        </div>
      </div>
      <div className="erp-profile-doc-card-body">
        <p className="erp-profile-doc-card-name" title={document.name}>
          {document.name}
        </p>
        <p className="erp-profile-doc-card-meta">
          {profileFileMetaLine(
            document.name,
            document.fileType,
            document.fileSizeBytes,
            dateLabel,
          )}
        </p>
      </div>
    </article>
  );
}

/**
 * Upload, download, and delete employee profile documents.
 */
export default function EmployeeProfileDocuments({
  userId,
  canDelete = true,
  embedded = false,
}: EmployeeProfileDocumentsProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const documentsQuery = useUserDocuments(userId);
  const uploadMutation = useUploadUserDocuments();
  const deleteMutation = useDeleteUserDocument();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const documentPendingDelete =
    documentsQuery.data?.find((doc) => doc.id === confirmDeleteId) ?? null;

  function handleSelectFiles(file: File): false {
    setPending((current) => [
      ...current,
      {
        uid: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        label: file.name.replace(/\.[^.]+$/, ''),
      },
    ]);
    return false;
  }

  function updateLabel(uid: string, label: string): void {
    setPending((current) =>
      current.map((item) => (item.uid === uid ? { ...item, label } : item)),
    );
  }

  function removePending(uid: string): void {
    setPending((current) => current.filter((item) => item.uid !== uid));
  }

  async function handleUpload(): Promise<void> {
    if (pending.length === 0) {
      return;
    }
    try {
      await uploadMutation.mutateAsync({
        userId,
        files: pending.map((item) => item.file),
        labels: pending.map((item) => item.label.trim() || item.file.name),
      });
      setPending([]);
      messageApi.success(t('users.documentsUploaded'));
    } catch (error: unknown) {
      notifyApiError(error, t('users.documentsUploadError'), messageApi);
    }
  }

  async function handleDownload(document: UserProfileDocument): Promise<void> {
    setDownloadingId(document.id);
    try {
      const { url } = await apiGet<{ url: string; expiresIn: number }>(
        `/users/${userId}/documents/${document.id}/download-url`,
      );
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.download = document.name;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error: unknown) {
      notifyApiError(error, t('users.documentDownloadError'), messageApi);
    } finally {
      setDownloadingId(null);
    }
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
  const hasPending = pending.length > 0;
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

      <div className="erp-profile-docs-toolbar">
        <Upload beforeUpload={handleSelectFiles} showUploadList={false}>
          <Button icon={<PlusOutlined />}>{t('users.form.selectDocuments')}</Button>
        </Upload>
        {hasPending ? (
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={uploadMutation.isPending}
            onClick={() => void handleUpload()}
          >
            {t('users.form.uploadDocuments')}
          </Button>
        ) : null}
      </div>

      {hasPending ? (
        <div className="erp-profile-docs-grid">
          {pending.map((item) => (
            <PendingDocumentCard
              key={item.uid}
              fileName={item.file.name}
              fileType={item.file.type}
              fileSizeBytes={item.file.size}
              label={item.label}
              labelPlaceholder={t('users.form.documentLabel')}
              onLabelChange={(value) => updateLabel(item.uid, value)}
              onRemove={() => removePending(item.uid)}
            />
          ))}
        </div>
      ) : null}

      <ConfirmDialog
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
                canDelete={canDelete}
                isDeleting={deletingId === document.id}
                isDownloading={downloadingId === document.id}
                downloadLabel={t('common.download')}
                deleteLabel={t('common.delete')}
                onDownload={() => void handleDownload(document)}
                onDelete={() => setConfirmDeleteId(document.id)}
              />
            ))}
          </div>
        ) : !documentsQuery.isLoading && !hasPending ? (
          <div className="erp-profile-docs-empty">
            <div className="erp-profile-docs-empty-icon" aria-hidden>
              <FilePlus2 size={22} strokeWidth={1.6} />
            </div>
            <p className="erp-profile-docs-empty-title">{t('users.noDocuments')}</p>
          </div>
        ) : null}
      </Spin>
    </div>
  );
}
