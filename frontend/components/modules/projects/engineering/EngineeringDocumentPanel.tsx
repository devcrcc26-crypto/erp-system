// UI polish pass - styles only, no logic changes

'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Space,
  Spin,
  Upload,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { RcFile } from 'antd/es/upload';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EngineeringDocument,
  EngineeringDocumentType,
} from '@/lib/api/epc.types';
import { apiGet } from '@/lib/api/client';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import {
  useDisciplineUploadFolder,
  useEngineeringDocuments,
  useRegisterEngineeringDocument,
} from '@/lib/query/engineering-documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import EdvMetadataForm, {
  type EdvMetadataFormValues,
  buildMetadataFromForm,
} from '@/components/modules/projects/engineering/EdvMetadataForm';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import {
  buildEngineeringDocumentDetailHref,
  parseRevisionTriggerParams,
} from '@/lib/utils/revision-trigger-url';
import { getLatestEngineeringDocumentVersion } from '@/lib/utils/engineering-document-versions';

interface DocumentWithVersions {
  id: string;
  versions?: { id: string; versionNumber: number }[];
}

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

export default function EngineeringDocumentPanel({
  projectId,
  taskDisciplineId,
}: {
  projectId: string;
  taskDisciplineId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const searchParams = useSearchParams();
  const revisionTriggerContext = parseRevisionTriggerParams(searchParams);
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canRegister =
    lens.canCreateEngineering ||
    lens.canEditEngineering ||
    lens.canUploadEngineeringDocuments;
  const [registerOpen, setRegisterOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form] = Form.useForm<EdvMetadataFormValues>();

  const { params, bindMeta } = useTablePagination();
  const documentsQuery = useEngineeringDocuments(
    projectId,
    taskDisciplineId,
    params,
    !permLoading && lens.canViewEngineering,
  );
  const uploadFolderQuery = useDisciplineUploadFolder(
    projectId,
    taskDisciplineId,
    !permLoading &&
      lens.canViewEngineering &&
      (canRegister || registerOpen),
  );

  const uploadDocument = useUploadDocumentToFolder();
  const registerDocument = useRegisterEngineeringDocument();

  const uploadFolderId = uploadFolderQuery.data?.id;
  const uploadFolderPath = uploadFolderQuery.data?.path;

  const documents = documentsQuery.data?.data ?? [];
  const apiUnavailable =
    documentsQuery.isError &&
    documentsQuery.error instanceof ApiRequestError &&
    (documentsQuery.error.status === 404 || documentsQuery.error.status === 0);

  const columns: ColumnsType<EngineeringDocument> = [
    {
      title: 'Number',
      dataIndex: 'documentNumber',
      key: 'documentNumber',
      render: (value: string | null) => value ?? '-',
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Type',
      dataIndex: 'documentType',
      key: 'documentType',
    },
    {
      title: 'Latest status',
      key: 'status',
      render: (_value, record) => {
        const latest = getLatestEngineeringDocumentVersion(record.versions);
        return latest ? <EdvStatusBadge status={latest.status} /> : '-';
      },
    },
    {
      title: 'Revision',
      key: 'revision',
      align: 'right',
      render: (_value, record) => {
        const latest = getLatestEngineeringDocumentVersion(record.versions);
        return latest?.revisionLabel ?? '-';
      },
    },
    {
      title: 'File ver.',
      key: 'fileVersion',
      align: 'right',
      width: 90,
      render: (_value, record) => {
        const latest = getLatestEngineeringDocumentVersion(record.versions);
        return latest?.fileVersionNumber != null
          ? latest.fileVersionNumber
          : '-';
      },
    },
    {
      title: 'Versions',
      key: 'versionCount',
      align: 'right',
      width: 90,
      render: (_value, record) => record.versions?.length ?? 0,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_value, record) => (
        <Link
          href={buildEngineeringDocumentDetailHref(projectId, record.id, {
            taskDisciplineId,
            revisionTrigger: revisionTriggerContext,
          })}
        >
          Open
        </Link>
      ),
    },
  ];

  async function handleRegister(values: EdvMetadataFormValues): Promise<void> {
    if (!pendingFile) {
      messageApi.error('Select a file to upload');
      return;
    }

    try {
      let folderId = uploadFolderId;
      if (!folderId) {
        const folder = await uploadFolderQuery.refetch();
        folderId = folder.data?.id;
      }
      if (!folderId) {
        messageApi.error('Document folder could not be prepared for upload');
        return;
      }

      const uploaded = await uploadDocument.mutateAsync({
        folderId,
        file: pendingFile,
      });
      const documentVersionId = await resolveLatestDocumentVersionId(uploaded.id);

      await registerDocument.mutateAsync({
        projectId,
        taskDisciplineId,
        body: {
          documentVersionId,
          documentType: values.documentType,
          title: values.title.trim(),
          documentNumber: values.documentNumber?.trim() || undefined,
          metadata: buildMetadataFromForm(values.documentType, values),
        },
      });

      messageApi.success('Engineering document registered');
      setRegisterOpen(false);
      setPendingFile(null);
      form.resetFields();
      void documentsQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to register engineering document', messageApi);
    }
  }

  const documentType = Form.useWatch('documentType', form) as
    | EngineeringDocumentType
    | undefined;

  if (permLoading || documentsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewEngineering) {
    return null;
  }

  return (
    <FormLayout
      title="Engineering documents"
      description="Register uploaded files as engineering documents with type-specific metadata."
      extra={
        canRegister ? (
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({
                documentType: 'DRAWING',
              });
              setRegisterOpen(true);
              void uploadFolderQuery.refetch();
            }}
          >
            {t('actions.registerDocument')}
          </Button>
        ) : undefined
      }
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="Engineering documents API not available"
          description="Connect the backend EPC module to manage engineering documents."
        />
      )}

      <DataTable<EngineeringDocument>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={documents}
        loading={documentsQuery.isLoading}
        pagination={bindMeta(documentsQuery.data?.meta)}
        locale={{ emptyText: 'No engineering documents registered' }}
      />

      <Drawer
        {...wideDetailDrawerProps}
        title="Register engineering document"
        open={registerOpen}
        onClose={() => {
          setRegisterOpen(false);
          setPendingFile(null);
          form.resetFields();
        }}
        footer={
          <Space>
            <Button onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button
              type="primary"
              loading={
                uploadFolderQuery.isFetching ||
                uploadDocument.isPending ||
                registerDocument.isPending
              }
              disabled={uploadFolderQuery.isLoading && !uploadFolderId}
              onClick={() => form.submit()}
            >
              Register
            </Button>
          </Space>
        }
      >
        <div className={layout.drawerStack}>
          <Upload
            beforeUpload={(file: RcFile) => {
              setPendingFile(file);
              return false;
            }}
            maxCount={1}
            onRemove={() => setPendingFile(null)}
          >
            <Button icon={<UploadOutlined />}>Select file</Button>
          </Upload>

          {uploadFolderQuery.isLoading && <Spin />}
          {uploadFolderPath && (
            <p className={layout.drawerMutedText}>
              Files upload to: <span className="font-mono">{uploadFolderPath}</span>
            </p>
          )}

          <Form<EdvMetadataFormValues>
            form={form}
            layout="vertical"
            className="erp-drawer-form"
            initialValues={{ documentType: 'DRAWING' as EngineeringDocumentType }}
            onFinish={(values: EdvMetadataFormValues) => void handleRegister(values)}
          >
            <EdvMetadataForm documentType={documentType ?? 'DRAWING'} />
          </Form>
        </div>
      </Drawer>
    </FormLayout>
  );
}
