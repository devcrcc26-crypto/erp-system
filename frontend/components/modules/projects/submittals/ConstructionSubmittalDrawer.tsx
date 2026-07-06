// UI polish pass - styles only, no logic changes

'use client';

import { useMemo } from 'react';
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
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import type { DesignPackage } from '@/lib/api/epc.types';
import { apiGet } from '@/lib/api/client';
import { designPackageKeys } from '@/lib/query/design-packages';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useCreateConstructionSubmittal } from '@/lib/query/submittals';
import { useAppMessage } from '@/hooks/use-app-message';
import { useQuery } from '@tanstack/react-query';
import { submittalDrawerProps } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';

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
  const disciplinesQuery = useProjectDisciplines(projectId, open);
  const createSubmittal = useCreateConstructionSubmittal();
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

  const packageColumns: ColumnsType<DesignPackage> = useMemo(
    () => [
      { title: 'Package', dataIndex: 'name', key: 'name' },
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

  async function handleSubmit(
    values: ConstructionSubmittalFormValues,
  ): Promise<void> {
    try {
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
      messageApi.success(
        'Submittal created - upload documents and submit to discipline leader',
      );
      form.resetFields();
      onCreated(result.id);
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create submittal', messageApi);
    }
  }

  return (
    <Drawer
      {...submittalDrawerProps}
      title="New construction submittal"
      open={open}
      onClose={onClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={createSubmittal.isPending}
            onClick={() => form.submit()}
          >
            Create submittal
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
            options={(disciplinesQuery.data ?? []).map((d) => ({
              value: d.id,
              label: d.disciplineName,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="category"
          label="Category"
          rules={[{ required: true, message: 'Category is required' }]}
        >
          <Input placeholder="e.g. Shop drawings, Product data" />
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
