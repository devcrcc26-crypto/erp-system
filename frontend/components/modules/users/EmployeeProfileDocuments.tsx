'use client';

import { useState } from 'react';
import { Button, Input, Spin, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
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
}

function PendingDocumentRow({
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
    <div className="erp-profile-doc-row flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <ProfileFileTypeIcon name={fileName} fileType={fileType} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900" title={fileName}>
              {fileName}
            </div>
            <div className="text-xs text-slate-500">
              {profileFileMetaLine(fileName, fileType, fileSizeBytes)}
            </div>
          </div>
          <Input
            size="small"
            className="sm:max-w-[220px]"
            placeholder={labelPlaceholder}
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </div>
      </div>
      <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove} />
    </div>
  );
}

function SavedDocumentRow({
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
    <div className="erp-profile-doc-row flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ProfileFileTypeIcon name={document.name} fileType={document.fileType} />
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-medium text-slate-900"
            title={document.name}
          >
            {document.name}
          </div>
          <div className="text-xs text-slate-500">
            {profileFileMetaLine(
              document.name,
              document.fileType,
              document.fileSizeBytes,
              dateLabel,
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1 ps-14 sm:ps-0">
        <Button
          type="link"
          icon={<DownloadOutlined />}
          loading={isDownloading}
          onClick={onDownload}
        >
          {downloadLabel}
        </Button>
        {canDelete ? (
          <Button type="link" danger loading={isDeleting} onClick={onDelete}>
            {deleteLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Upload, download, and delete employee profile documents.
 */
export default function EmployeeProfileDocuments({
  userId,
  canDelete = true,
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

  return (
    <div className="mt-4 space-y-4">
      <div className="text-sm font-semibold text-slate-700">
        {t('users.form.profileDocuments')}
      </div>

      <Upload multiple beforeUpload={handleSelectFiles} showUploadList={false}>
        <Button icon={<UploadOutlined />}>{t('users.form.selectDocuments')}</Button>
      </Upload>

      {pending.length > 0 ? (
        <div className="erp-profile-doc-list divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {pending.map((item) => (
            <PendingDocumentRow
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

      {pending.length > 0 ? (
        <Button
          type="primary"
          loading={uploadMutation.isPending}
          onClick={() => void handleUpload()}
        >
          {t('users.form.uploadDocuments')}
        </Button>
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
        {documents.length > 0 ? (
          <div className="erp-profile-doc-list divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {documents.map((document) => (
              <SavedDocumentRow
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
        ) : !documentsQuery.isLoading ? (
          <p className="text-sm text-slate-400">{t('users.noDocuments')}</p>
        ) : null}
      </Spin>
    </div>
  );
}
