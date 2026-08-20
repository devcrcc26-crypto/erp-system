'use client';

import { useState } from 'react';
import { Button, Input, Spin, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
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
  label,
  onLabelChange,
  onRemove,
  labelPlaceholder,
}: {
  fileName: string;
  label: string;
  onLabelChange: (value: string) => void;
  onRemove: () => void;
  labelPlaceholder: string;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <span className="min-w-0 flex-1 truncate text-sm">{fileName}</span>
        <Input
          size="small"
          placeholder={labelPlaceholder}
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </div>
      <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove} />
    </div>
  );
}

function SavedDocumentRow({
  document,
  canDelete,
  isDeleting,
  onDownload,
  onDelete,
  downloadLabel,
  deleteLabel,
}: {
  document: UserProfileDocument;
  canDelete: boolean;
  isDeleting: boolean;
  onDownload: () => void;
  onDelete: () => void;
  downloadLabel: string;
  deleteLabel: string;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900">{document.name}</div>
        <div className="text-xs text-slate-500">
          {new Date(document.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button type="link" icon={<DownloadOutlined />} onClick={onDownload}>
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
    try {
      const result = await apiGet<{ url: string }>(
        `/documents/${document.id}/download-url`,
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error: unknown) {
      notifyApiError(error, t('users.documentDownloadError'), messageApi);
    }
  }

  async function handleDelete(documentId: string): Promise<void> {
    try {
      await deleteMutation.mutateAsync({ userId, documentId });
      messageApi.success(t('users.documentDeleted'));
    } catch (error: unknown) {
      notifyApiError(error, t('users.documentDeleteError'), messageApi);
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
        <div className="divide-y divide-slate-200 rounded border border-slate-200">
          {pending.map((item) => (
            <PendingDocumentRow
              key={item.uid}
              fileName={item.file.name}
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

      <Spin spinning={documentsQuery.isLoading}>
        {documents.length > 0 ? (
          <div className="divide-y divide-slate-200 rounded border border-slate-200">
            {documents.map((document) => (
              <SavedDocumentRow
                key={document.id}
                document={document}
                canDelete={canDelete}
                isDeleting={deleteMutation.isPending}
                downloadLabel={t('common.download')}
                deleteLabel={t('common.delete')}
                onDownload={() => void handleDownload(document)}
                onDelete={() => void handleDelete(document.id)}
              />
            ))}
          </div>
        ) : (
          !documentsQuery.isLoading ? (
            <p className="text-sm text-slate-400">{t('users.noDocuments')}</p>
          ) : null
        )}
      </Spin>
    </div>
  );
}
