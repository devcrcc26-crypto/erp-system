'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Space,
  Spin,
  Table,
  Upload,
  message,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { RcFile } from 'antd/es/upload';
import Link from 'next/link';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EngineeringDocument,
  EngineeringDocumentType,
} from '@/lib/api/epc.types';
import { apiGet } from '@/lib/api/client';
import {
  useDocumentFolders,
  useProjectDocumentFolder,
  useUploadDocumentToFolder,
} from '@/lib/query/documents';
import {
  useEngineeringDocuments,
  useRegisterEngineeringDocument,
} from '@/lib/query/engineering-documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import EdvMetadataForm, {
  type EdvMetadataFormValues,
  buildMetadataFromForm,
} from '@/components/modules/projects/engineering/EdvMetadataForm';

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
  const [registerOpen, setRegisterOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form] = Form.useForm<EdvMetadataFormValues>();

  const documentsQuery = useEngineeringDocuments(
    projectId,
    taskDisciplineId,
    { page: 1, limit: 50 },
    lens.canViewEngineering,
  );
  const disciplineFolderQuery = useDocumentFolders(
    {
      page: 1,
      limit: 5,
      contextType: 'TASK_DISCIPLINE',
      contextId: taskDisciplineId,
    },
    lens.canViewEngineering,
  );
  const projectFolderQuery = useProjectDocumentFolder(
    projectId,
    lens.canViewEngineering && !disciplineFolderQuery.data?.data.length,
  );

  const uploadDocument = useUploadDocumentToFolder();
  const registerDocument = useRegisterEngineeringDocument();

  const uploadFolderId = useMemo(() => {
    const disciplineFolder = disciplineFolderQuery.data?.data[0];
    if (disciplineFolder) {
      return disciplineFolder.id;
    }
    return projectFolderQuery.data?.data[0]?.id;
  }, [disciplineFolderQuery.data, projectFolderQuery.data]);

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
      render: (value: string | null) => value ?? '—',
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
        const latest = record.versions?.[record.versions.length - 1];
        return latest ? <EdvStatusBadge status={latest.status} /> : '—';
      },
    },
    {
      title: 'Revision',
      key: 'revision',
      render: (_value, record) => {
        const latest = record.versions?.[record.versions.length - 1];
        return latest?.revisionLabel ?? '—';
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_value, record) => (
        <Link href={`/projects/${projectId}/engineering-documents/${record.id}`}>
          Open
        </Link>
      ),
    },
  ];

  async function handleRegister(values: EdvMetadataFormValues): Promise<void> {
    if (!pendingFile) {
      message.error('Select a file to upload');
      return;
    }
    if (!uploadFolderId) {
      message.error('No document folder available for upload');
      return;
    }

    const uploaded = await uploadDocument.mutateAsync({
      folderId: uploadFolderId,
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

    message.success('Engineering document registered');
    setRegisterOpen(false);
    setPendingFile(null);
    form.resetFields();
    void documentsQuery.refetch();
  }

  const documentType = Form.useWatch('documentType', form) as
    | EngineeringDocumentType
    | undefined;

  if (!lens.canViewEngineering) {
    return null;
  }

  return (
    <FormLayout
      title="Engineering documents"
      description="Register uploaded files as engineering documents with type-specific metadata."
      extra={
        lens.canCreateEngineering ? (
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({
                documentType: 'DRAWING',
              });
              setRegisterOpen(true);
            }}
          >
            Register document
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

      <Table<EngineeringDocument>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={documents}
        loading={documentsQuery.isLoading}
        pagination={false}
        locale={{ emptyText: 'No engineering documents registered' }}
      />

      <Drawer
        title="Register engineering document"
        open={registerOpen}
        size={560}
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
              loading={uploadDocument.isPending || registerDocument.isPending}
              onClick={() => form.submit()}
            >
              Register
            </Button>
          </Space>
        }
      >
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

        {!uploadFolderId && (
          <Spin className="mt-4 block" />
        )}

        <Form<EdvMetadataFormValues>
          form={form}
          layout="vertical"
          className="mt-4"
          initialValues={{ documentType: 'DRAWING' as EngineeringDocumentType }}
          onFinish={(values: EdvMetadataFormValues) => void handleRegister(values)}
        >
          <EdvMetadataForm
            documentType={documentType ?? 'DRAWING'}
          />
        </Form>
      </Drawer>
    </FormLayout>
  );
}
