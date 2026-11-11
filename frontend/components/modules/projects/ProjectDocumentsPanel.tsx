'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  Select,
  Space,
  Upload,
} from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { FileText } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ProjectDocumentFileTypeFilter,
  ProjectDocumentFolderContextType,
  ProjectDocumentRecord,
} from '@/lib/api/documents.types';
import { apiGet } from '@/lib/api/client';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import {
  useProjectDocumentFolder,
  useProjectDocuments,
  useUploadDocumentToFolder,
} from '@/lib/query/documents';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import {
  PROJECT_DOCUMENT_CONTEXT_OPTIONS,
  PROJECT_DOCUMENT_FILE_TYPE_OPTIONS,
  resolveProjectDocumentEntityHref,
  resolveProjectDocumentSourceLabel,
} from '@/lib/utils/project-document-browser';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMimeLabel(fileType: string): string {
  const short = fileType.split('/').pop() ?? fileType;
  return short.toUpperCase();
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
  const [folderContextType, setFolderContextType] = useState<
    ProjectDocumentFolderContextType | undefined
  >(undefined);
  const [taskDisciplineId, setTaskDisciplineId] = useState<string | undefined>(
    undefined,
  );
  const [fileType, setFileType] = useState<
    ProjectDocumentFileTypeFilter | undefined
  >(undefined);
  const [uploadedRange, setUploadedRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const messageApi = useAppMessage();

  const foldersQuery = useProjectDocumentFolder(projectId);
  const disciplinesQuery = useProjectDisciplines(projectId);
  const projectFolder = foldersQuery.data?.data[0];
  const folderId = projectFolder?.id;

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      folderContextType,
      taskDisciplineId,
      fileType,
      uploadedFrom: uploadedRange?.[0]?.format('YYYY-MM-DD'),
      uploadedTo: uploadedRange?.[1]?.format('YYYY-MM-DD'),
      sortBy: 'createdAt',
      sortOrder: 'desc' as const,
    }),
    [
      params,
      search,
      folderContextType,
      taskDisciplineId,
      fileType,
      uploadedRange,
    ],
  );

  const documentsQuery = useProjectDocuments(projectId, listParams);
  const uploadDocument = useUploadDocumentToFolder();

  const columns: ColumnsType<ProjectDocumentRecord> = useMemo(
    () => [
      {
        title: 'Title',
        key: 'displayTitle',
        ellipsis: true,
        render: (_: unknown, record) => (
          <div className="min-w-0">
            <p
              className="truncate text-[13px] font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {record.displayTitle}
            </p>
            {record.engineeringDocumentNumber ? (
              <p
                className="truncate text-[12px]"
                style={{ color: tokens.colorTextSecondary }}
              >
                {record.engineeringDocumentNumber}
                {record.engineeringRevisionLabel
                  ? ` · Rev ${record.engineeringRevisionLabel}`
                  : ''}
              </p>
            ) : record.name !== record.displayTitle ? (
              <p
                className="truncate text-[12px]"
                style={{ color: tokens.colorTextSecondary }}
              >
                {record.name}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: 'Source',
        key: 'source',
        width: 200,
        ellipsis: true,
        render: (_: unknown, record) => {
          const href = resolveProjectDocumentEntityHref(projectId, record);
          const label = resolveProjectDocumentSourceLabel(record);
          if (href) {
            return (
              <Link
                href={href}
                className="truncate text-[12px] hover:underline"
                style={{ color: tokens.colorBlue400 }}
              >
                {label}
              </Link>
            );
          }
          return (
            <span
              className="truncate text-[12px]"
              style={{ color: tokens.colorTextSecondary }}
            >
              {label}
            </span>
          );
        },
      },
      {
        title: 'Discipline',
        key: 'discipline',
        width: 140,
        ellipsis: true,
        render: (_: unknown, record) => {
          if (record.disciplineIndex != null) {
            return formatDisciplineLabel(record.disciplineIndex);
          }
          return (
            record.disciplineName ?? (
              <span style={{ color: tokens.colorTextSecondary }}>-</span>
            )
          );
        },
      },
      {
        title: 'Type',
        dataIndex: 'fileType',
        key: 'fileType',
        width: 100,
        render: (value: string) => formatMimeLabel(value),
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
    [projectId],
  );

  function resetFilters(): void {
    resetPage();
    setSearch('');
    setFolderContextType(undefined);
    setTaskDisciplineId(undefined);
    setFileType(undefined);
    setUploadedRange(null);
  }

  if (foldersQuery.isLoading) {
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
  const disciplineOptions = (disciplinesQuery.data ?? []).map((row) => ({
    value: row.id,
    label: formatDisciplineLabel(row.disciplineIndex),
  }));

  return (
    <div className={layout.pageStack}>
      <FormLayout
        title="Document browser"
        description="Search every file attached to this project - RFIs, submittals, daily logs, discipline drawings, and the project repository - in one place."
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

        <Space wrap className="!mb-4" size="middle">
          <ListSearchInput
            placeholder='Search title, folder, "Level 8", waterproofing…'
            className="!w-[min(100%,320px)]"
            committedValue={search}
            onCommit={(value) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Source type"
            className={layout.filterControl}
            options={PROJECT_DOCUMENT_CONTEXT_OPTIONS}
            value={folderContextType}
            onChange={(value: ProjectDocumentFolderContextType | undefined) => {
              resetPage();
              setFolderContextType(value);
            }}
          />
          <Select
            allowClear
            showSearch
            placeholder="Discipline"
            className={layout.filterControl}
            optionFilterProp="label"
            options={disciplineOptions}
            value={taskDisciplineId}
            loading={disciplinesQuery.isLoading}
            onChange={(value: string | undefined) => {
              resetPage();
              setTaskDisciplineId(value);
            }}
          />
          <Select
            allowClear
            placeholder="File type"
            className={layout.filterControl}
            options={[...PROJECT_DOCUMENT_FILE_TYPE_OPTIONS]}
            value={fileType}
            onChange={(value: ProjectDocumentFileTypeFilter | undefined) => {
              resetPage();
              setFileType(value);
            }}
          />
          <DatePicker.RangePicker
            value={uploadedRange}
            onChange={(dates) => {
              resetPage();
              setUploadedRange(dates);
            }}
          />
          <Button onClick={resetFilters}>Clear filters</Button>
        </Space>

        <DataTable<ProjectDocumentRecord>
          rowKey="id"
          columns={columns}
          dataSource={documents}
          loading={documentsQuery.isLoading}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<FileText />}
                title="No documents match your search"
                description="Try a broader keyword, remove filters, or upload a file to the project repository"
              />
            ),
          }}
        />
      </FormLayout>
    </div>
  );
}
