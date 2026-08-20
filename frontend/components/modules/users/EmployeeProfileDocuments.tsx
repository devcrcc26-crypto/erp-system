'use client';

import { useState } from 'react';
import { Button, Input, List, Upload } from 'antd';
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
        {t('hr.labels.profileDocuments')}
      </div>

      <Upload multiple beforeUpload={handleSelectFiles} showUploadList={false}>
        <Button icon={<UploadOutlined />}>{t('users.selectDocuments')}</Button>
      </Upload>

      {pending.length > 0 ? (
        <List
          size="small"
          dataSource={pending}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="remove"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removePending(item.uid)}
                />,
              ]}
            >
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
                <Input
                  size="small"
                  placeholder={t('hr.labels.documentLabel')}
                  value={item.label}
                  onChange={(event) => updateLabel(item.uid, event.target.value)}
                />
              </div>
            </List.Item>
          )}
        />
      ) : null}

      {pending.length > 0 ? (
        <Button
          type="primary"
          loading={uploadMutation.isPending}
          onClick={() => void handleUpload()}
        >
          {t('hr.labels.uploadDocuments')}
        </Button>
      ) : null}

      <List
        loading={documentsQuery.isLoading}
        locale={{ emptyText: t('users.noDocuments') }}
        dataSource={documents}
        renderItem={(document) => (
          <List.Item
            actions={[
              <Button
                key="download"
                type="link"
                icon={<DownloadOutlined />}
                onClick={() => void handleDownload(document)}
              >
                {t('common.download')}
              </Button>,
              canDelete ? (
                <Button
                  key="delete"
                  type="link"
                  danger
                  loading={deleteMutation.isPending}
                  onClick={() => void handleDelete(document.id)}
                >
                  {t('common.delete')}
                </Button>
              ) : null,
            ].filter(Boolean)}
          >
            <List.Item.Meta
              title={document.name}
              description={new Date(document.createdAt).toLocaleDateString()}
            />
          </List.Item>
        )}
      />
    </div>
  );
}
