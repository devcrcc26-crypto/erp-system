// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Upload,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import type { DesignPackage } from '@/lib/api/epc.types';
import { apiGet } from '@/lib/api/client';
import { SUBMITTAL_CATEGORIES } from '@/lib/constants/submittal';
import { designPackageKeys } from '@/lib/query/design-packages';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useCreateConstructionSubmittal } from '@/lib/query/submittals';
import { useAppMessage } from '@/hooks/use-app-message';
import { useQuery } from '@tanstack/react-query';
import { submittalDrawerProps } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatDisciplineNumber } from '@/lib/utils/discipline-display';

interface ConstructionSubmittalFormValues {
  taskDisciplineId: string;
  category: string;
  title: string;
  contractor?: string;
  supplier?: string;
  specReference?: string;
  revisionNumber?: number;
  dueDate?: Dayjs;
  designPackageIds?: string[];
}

function designPackagesPath(
  projectId: string,
  taskDisciplineId: string,
): string {
  return `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages`;
}

function formatDisciplineOptionNumber(
  overseasTaskNumber: string | null | undefined,
  disciplineIndex: number | null | undefined,
): string {
  const indexLabel = formatDisciplineNumber(disciplineIndex);
  if (overseasTaskNumber) {
    return `${overseasTaskNumber}-${indexLabel}`;
  }
  return indexLabel;
}

export default function ConstructionSubmittalDrawer({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: (submittalId: string) => void;
}): React.ReactNode {
  const [form] = Form.useForm<ConstructionSubmittalFormValues>();
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    submittalId: string;
    folderId: string;
  } | null>(null);
  const disciplinesQuery = useProjectDisciplines(projectId, open);
  const createSubmittal = useCreateConstructionSubmittal();
  const uploadDocument = useUploadDocumentToFolder();
  const messageApi = useAppMessage();
  const taskDisciplineId = Form.useWatch('taskDisciplineId', form) as
    | string
    | undefined;

  const packagesQuery = useQuery({
    queryKey: designPackageKeys.lists(
      projectId,
      taskDisciplineId ?? '__none__',
    ),
    queryFn: () =>
      apiGet<DesignPackage[]>(
        designPackagesPath(projectId, taskDisciplineId!),
      ),
    enabled: Boolean(projectId) && Boolean(taskDisciplineId) && open,
    staleTime: 30_000,
  });

  const packages = packagesQuery.data ?? [];

  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((d) => ({
        value: d.id,
        label: formatDisciplineOptionNumber(
          d.overseasTaskNumber,
          d.disciplineIndex,
        ),
        disciplineName: d.disciplineName,
      })),
    [disciplinesQuery.data],
  );

  const packageColumns: ColumnsType<DesignPackage> = useMemo(
    () => [
      { title: 'Subtask', dataIndex: 'name', key: 'name' },
      {
        title: 'Status',
        key: 'status',
        render: (_value, record) => (
          <ProjectedStatusBadge
            status={record.projectedStatus}
            pending={record.projectionPending}
          />
        ),
      },
    ],
    [],
  );

  function handleClose(): void {
    setQueuedFiles([]);
    setUploading(false);
    setPendingUpload(null);
    form.resetFields();
    onClose();
  }

  async function uploadQueuedFiles(folderId: string): Promise<void> {
    setUploading(true);
    await Promise.all(
      queuedFiles.map((file) =>
        uploadDocument.mutateAsync({ folderId, file }),
      ),
    );
  }

  async function handleSubmit(
    values: ConstructionSubmittalFormValues,
  ): Promise<void> {
    try {
      if (pendingUpload) {
        if (queuedFiles.length === 0) {
          messageApi.success('Submittal created');
          form.resetFields();
          setPendingUpload(null);
          onCreated(pendingUpload.submittalId);
          onClose();
          return;
        }
        try {
          await uploadQueuedFiles(pendingUpload.folderId);
        } catch (uploadError) {
          notifyApiError(
            uploadError,
            'File upload failed. Retry or upload from the detail drawer.',
            messageApi,
          );
          return;
        }
        messageApi.success('Submittal created');
        form.resetFields();
        setQueuedFiles([]);
        setPendingUpload(null);
        onCreated(pendingUpload.submittalId);
        onClose();
        return;
      }

      const result = await createSubmittal.mutateAsync({
        projectId,
        body: {
          category: values.category.trim(),
          title: values.title.trim(),
          taskDisciplineId: values.taskDisciplineId,
          designPackageIds: values.designPackageIds,
          contractor: values.contractor?.trim() || undefined,
          supplier: values.supplier?.trim() || undefined,
          specReference: values.specReference?.trim() || undefined,
          revisionNumber: values.revisionNumber,
          dueDate: values.dueDate?.toISOString(),
        },
      });

      if (queuedFiles.length > 0 && result.attachmentFolderId) {
        try {
          await uploadQueuedFiles(result.attachmentFolderId);
        } catch (uploadError) {
          notifyApiError(
            uploadError,
            'Submittal created but file upload failed. Retry from this form or upload from the detail drawer.',
            messageApi,
          );
          setPendingUpload({
            submittalId: result.id,
            folderId: result.attachmentFolderId,
          });
          onCreated(result.id);
          return;
        }
      }

      messageApi.success('Submittal created');
      form.resetFields();
      setQueuedFiles([]);
      setPendingUpload(null);
      onCreated(result.id);
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create submittal', messageApi);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Drawer
      {...submittalDrawerProps}
      title="New construction submittal"
      open={open}
      onClose={handleClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            type="primary"
            loading={createSubmittal.isPending || uploading}
            onClick={() => form.submit()}
          >
            {pendingUpload ? 'Retry upload' : 'Create submittal'}
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="Submit to discipline leader"
        description="Attach subtasks from the system and upload your own shop drawings or product data. After creating, upload supporting documents and submit directly to the discipline leader for approval."
      />

      <Form<ConstructionSubmittalFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ revisionNumber: 1 }}
        onFinish={(values: ConstructionSubmittalFormValues) =>
          void handleSubmit(values)
        }
      >
        <Form.Item
          name="taskDisciplineId"
          label="Discipline"
          rules={[{ required: true, message: 'Select a discipline' }]}
        >
          <Select
            placeholder="Select discipline"
            loading={disciplinesQuery.isLoading}
            options={disciplineOptions}
            optionRender={(option) => (
              <div>
                <div className="text-sm font-medium">{option.data.label}</div>
                <div className="text-xs text-slate-400">
                  {option.data.disciplineName}
                </div>
              </div>
            )}
          />
        </Form.Item>

        <Form.Item
          name="category"
          label="Category"
          rules={[{ required: true, message: 'Category is required' }]}
        >
          <Select
            showSearch
            allowClear
            placeholder="e.g. Shop drawings, Product data"
            options={SUBMITTAL_CATEGORIES.map((c) => ({
              value: c,
              label: c,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Submittal title" />
        </Form.Item>

        <div className="grid gap-4 md:grid-cols-2">
          <Form.Item name="contractor" label="Contractor">
            <Input />
          </Form.Item>
          <Form.Item name="supplier" label="Supplier / manufacturer">
            <Input />
          </Form.Item>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Form.Item name="specReference" label="Spec reference">
            <Input placeholder="e.g. Section 03 30 00" />
          </Form.Item>
          <Form.Item name="revisionNumber" label="Revision">
            <InputNumber className="!w-full" min={1} />
          </Form.Item>
        </div>

        <Form.Item name="dueDate" label="Due date">
          <DatePicker className="w-full" />
        </Form.Item>

        <Form.Item
          label="Attachments"
          extra="Upload shop drawings, product data or supporting documents."
        >
          <Upload
            multiple
            accept=".pdf,.dwg,.doc,.docx,.xls,.xlsx,.jpg,.png"
            beforeUpload={(file: File) => {
              setQueuedFiles((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => {
              setQueuedFiles((prev) =>
                prev.filter((_, index) => String(index) !== file.uid),
              );
            }}
            fileList={queuedFiles.map((f, i) => ({
              uid: String(i),
              name: f.name,
              status: 'done' as const,
            }))}
          >
            <Button icon={<UploadOutlined />}>Attach files</Button>
          </Upload>
          <div className="mt-1 text-xs text-slate-400">
            PDF, DWG, DOC, XLS, JPG, PNG
          </div>
        </Form.Item>

        {taskDisciplineId && (
          <FormLayout title="Subtasks from system" className="mb-4">
            <DataTable<DesignPackage>
              rowKey="id"
              size="small"
              loading={packagesQuery.isLoading}
              columns={packageColumns}
              dataSource={packages}
              locale={{ emptyText: 'No subtasks in this discipline' }}
            />
          </FormLayout>
        )}

        <Form.Item
          name="designPackageIds"
          label="Attach subtasks (optional)"
          extra="Link existing subtasks from the discipline. You can also upload your own documents after creating."
        >
          <Select
            mode="multiple"
            allowClear
            placeholder="Select subtasks"
            loading={packagesQuery.isLoading}
            disabled={!taskDisciplineId}
            options={packages.map((pkg) => ({
              value: pkg.id,
              label: pkg.name,
            }))}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
