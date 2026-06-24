// UI polish pass — styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Space,
  Upload,
} from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { FileText } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type { ProjectDocumentRecord } from '@/lib/api/documents.types';
import { apiGet } from '@/lib/api/client';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useProjectDocumentFolder,
  useProjectDocuments,
  useUploadDocumentToFolder,
} from '@/lib/query/documents';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatContextLabel(contextType: string): string {
  return contextType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) =>
    c.toUpperCase(),
  );
}

async function downloadDocument(document: ProjectDocumentRecord): Promise<void> {
  const { url } = await apiGet<{ url: string; expiresIn: number }>(
    `/documents/${document.id}/download-url`,
  );
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ProjectDocumentsPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const messageApi = useAppMessage();

  const foldersQuery = useProjectDocumentFolder(projectId);
  const projectFolder = foldersQuery.data?.data[0];
  const folderId = projectFolder?.id;

  const documentsQuery = useProjectDocuments(projectId, {
    ...params,
    search: search.trim() || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const uploadDocument = useUploadDocumentToFolder();

  const columns: ColumnsType<ProjectDocumentRecord> = useMemo(
    () => [
      {
        title: 'File name',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
      },
      {
        title: 'Folder',
        key: 'folder',
        ellipsis: true,
        render: (_: unknown, record) => (
          <div className="min-w-0">
            <p
              className="truncate text-[12px]"
              style={{ color: tokens.colorTextPrimary }}
            >
              {record.folderName}
            </p>
            <p
              className="truncate text-[12px]"
              style={{ color: tokens.colorTextSecondary }}
            >
              {formatContextLabel(record.folderContextType)} · {record.folderPath}
            </p>
          </div>
        ),
      },
      {
        title: 'Type',
        dataIndex: 'fileType',
        key: 'fileType',
        width: 140,
        render: (value: string) => value.split('/').pop() ?? value,
      },
      {
        title: 'Size',
        dataIndex: 'fileSizeBytes',
        key: 'fileSizeBytes',
        width: 100,
        render: (value: number) => formatFileSize(value),
      },
      {
        title: 'Uploaded',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_: unknown, record) => (
          <Button
            type="link"
            icon={<DownloadOutlined />}
            className="!px-0"
            onClick={() => void downloadDocument(record)}
          >
            Download
          </Button>
        ),
      },
    ],
    [],
  );

  if (foldersQuery.isLoading || documentsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (foldersQuery.isError) {
    const status =
      foldersQuery.error instanceof ApiRequestError
        ? foldersQuery.error.status
        : 0;

    return (
      <Alert
        type={status === 403 ? 'warning' : 'error'}
        showIcon
        title={
          status === 403
            ? 'You do not have permission to view project documents.'
            : 'Unable to load project document folders.'
        }
        description={
          status === 403
            ? 'Ask your administrator for documents view access.'
            : foldersQuery.error instanceof ApiRequestError
              ? foldersQuery.error.message
              : undefined
        }
      />
    );
  }

  const documents = documentsQuery.data?.data ?? [];
  const meta = documentsQuery.data?.meta;

  return (
    <div className={layout.pageStack}>
      <FormLayout
        title="Project documents"
        description="All files uploaded across this project — daily logs, meetings, RFIs, punch items, and the project repository."
        extra={
          folderId ? (
            <Upload
              showUploadList={false}
              beforeUpload={(file: File) => {
                void uploadDocument
                  .mutateAsync({ folderId, file })
                  .then(() => {
                    messageApi.success('File uploaded');
                    void documentsQuery.refetch();
                  })
                  .catch((error: unknown) =>
                    notifyApiError(error, 'Upload failed', messageApi),
                  );
                return false;
              }}
              disabled={uploadDocument.isPending}
            >
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={uploadDocument.isPending}
              >
                Upload to project folder
              </Button>
            </Upload>
          ) : undefined
        }
      >
        {!folderId && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="No project document folder yet"
            description="Files attached to project records will appear here once folders are created. Upload a file to provision the project repository."
          />
        )}

        {documentsQuery.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load project documents"
            description={
              documentsQuery.error instanceof ApiRequestError
                ? documentsQuery.error.message
                : 'Please try again.'
            }
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search file names"
            className={layout.filterControl}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
          />
        </Space>

        <DataTable<ProjectDocumentRecord>
          rowKey="id"
          columns={columns}
          dataSource={documents}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<FileText />}
                title="No documents yet"
                description="Files from meetings, daily logs, correspondence, and other project records will appear here"
              />
            ),
          }}
        />
      </FormLayout>
    </div>
  );
}
