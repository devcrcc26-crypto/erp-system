'use client';

import { Alert, Button, Empty, List, Spin, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type { DocumentRecord } from '@/lib/api/documents.types';
import {
  useFolderDocuments,
  useUploadDocumentToFolder,
} from '@/lib/query/documents';
import { ApiRequestError } from '@/lib/api/errors';
import { apiGet } from '@/lib/api/client';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadDocument(document: DocumentRecord): Promise<void> {
  const { url } = await apiGet<{ url: string; expiresIn: number }>(
    `/documents/${document.id}/download-url`,
  );
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Upload and list documents in a Core Foundation document folder.
 */
export default function DocumentAttachmentPanel({
  folderId,
  readOnly = false,
  title = 'Attachments',
  description = 'Upload supporting files for this record.',
}: {
  folderId?: string;
  readOnly?: boolean;
  title?: string;
  description?: string;
}): React.ReactNode {
  const documentsQuery = useFolderDocuments(
    folderId ?? '',
    { page: 1, limit: 20 },
    Boolean(folderId),
  );
  const uploadDocument = useUploadDocumentToFolder();

  if (!folderId) {
    return (
      <FormLayout title={title} description={description}>
        <Alert
          type="info"
          showIcon
          message="Save this record first to enable file attachments."
        />
      </FormLayout>
    );
  }

  if (documentsQuery.isLoading) {
    return (
      <FormLayout title={title} description={description}>
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      </FormLayout>
    );
  }

  if (documentsQuery.isError) {
    const status =
      documentsQuery.error instanceof ApiRequestError
        ? documentsQuery.error.status
        : 0;

    return (
      <FormLayout title={title} description={description}>
        <Alert
          type={status === 403 ? 'warning' : 'error'}
          showIcon
          message={
            status === 403
              ? 'You do not have permission to view documents in this folder.'
              : 'Unable to load attachments.'
          }
        />
      </FormLayout>
    );
  }

  const documents = documentsQuery.data?.data ?? [];

  return (
    <FormLayout
      title={title}
      description={description}
      extra={
        !readOnly ? (
          <Upload
            showUploadList={false}
            beforeUpload={(file: File) => {
              uploadDocument.mutate({ folderId, file });
              return false;
            }}
            disabled={uploadDocument.isPending}
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploadDocument.isPending}
            >
              Upload file
            </Button>
          </Upload>
        ) : undefined
      }
    >
      {documents.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No files attached yet."
        />
      ) : (
        <List
          dataSource={documents}
          renderItem={(document) => (
            <List.Item
              actions={[
                <Button
                  key="download"
                  type="link"
                  icon={<DownloadOutlined />}
                  onClick={() => void downloadDocument(document)}
                >
                  Download
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={document.name}
                description={`${document.fileType} · ${formatFileSize(document.fileSizeBytes)} · v${document.version}`}
              />
            </List.Item>
          )}
        />
      )}
    </FormLayout>
  );
}
