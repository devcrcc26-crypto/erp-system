// UI polish pass - styles only, no logic changes

'use client';

import { Alert, Button, Empty, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type { DocumentRecord } from '@/lib/api/documents.types';
import {
  useFolderDocuments,
  useUploadDocumentToFolder,
} from '@/lib/query/documents';
import { ApiRequestError } from '@/lib/api/errors';
import { apiGet } from '@/lib/api/client';
import { layout } from '@/lib/theme/layout';

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
      <FormLayout
        title={title}
        description={description}
        className="erp-drawer-attachment"
      >
        <Alert
          type="info"
          showIcon
          title="Save this record first to enable file attachments."
        />
      </FormLayout>
    );
  }

  if (documentsQuery.isLoading) {
    return (
      <FormLayout
        title={title}
        description={description}
        className="erp-drawer-attachment"
      >
        <div className="flex flex-col gap-2 py-2">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-10 w-full rounded" />
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
      <FormLayout
        title={title}
        description={description}
        className="erp-drawer-attachment"
      >
        <Alert
          type={status === 403 ? 'warning' : 'error'}
          showIcon
          title={
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
      className="erp-drawer-attachment"
      extra={
        !readOnly ? (
          <Upload
            multiple
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
              Upload files
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
        <ul className="erp-drawer-file-list">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
                  {document.name}
                </p>
                <p className={layout.drawerMutedText}>
                  {document.fileType} · {formatFileSize(document.fileSizeBytes)} ·
                  v{document.version}
                </p>
              </div>
              <Button
                type="link"
                icon={<DownloadOutlined />}
                onClick={() => void downloadDocument(document)}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </FormLayout>
  );
}
