'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import type { DesignPackage } from '@/lib/api/epc.types';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useDesignPackages } from '@/lib/query/design-packages';
import { useCreateDesignSubmittal } from '@/lib/query/epc-submittals';
import { useAppMessage } from '@/hooks/use-app-message';

interface SubmittalPackageFormValues {
  category: string;
  title: string;
  contractor?: string;
  supplier?: string;
  specReference?: string;
  designPackageIds: string[];
}

export default function SubmittalPackageDrawer({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<SubmittalPackageFormValues>();
  const disciplinesQuery = useProjectDisciplines(projectId, open);
  const createSubmittal = useCreateDesignSubmittal();
  const messageApi = useAppMessage();

  return (
    <Drawer
      title="Create design submittal"
      open={open}
      size={560}
      onClose={onClose}
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
        title="Select locked design packages"
        description="Only approved (locked-ready) packages can be issued. Validation runs on submit."
      />

      <SubmittalPackageForm
        form={form}
        projectId={projectId}
        disciplines={disciplinesQuery.data ?? []}
        onSubmit={async (values) => {
          await createSubmittal.mutateAsync({
            projectId,
            body: {
              category: values.category.trim(),
              title: values.title.trim(),
              designPackageIds: values.designPackageIds,
              contractor: values.contractor?.trim() || undefined,
              supplier: values.supplier?.trim() || undefined,
              specReference: values.specReference?.trim() || undefined,
            },
          });
          messageApi.success('Design submittal created');
          form.resetFields();
          onCreated();
          onClose();
        }}
      />
    </Drawer>
  );
}

function SubmittalPackageForm({
  form,
  projectId,
  disciplines,
  onSubmit,
}: {
  form: ReturnType<typeof Form.useForm<SubmittalPackageFormValues>>[0];
  projectId: string;
  disciplines: { id: string; disciplineName: string }[];
  onSubmit: (values: SubmittalPackageFormValues) => Promise<void>;
}): React.ReactNode {
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string | null>(null);
  const packagesQuery = useDesignPackages(
    projectId,
    selectedDisciplineId ?? '',
    Boolean(selectedDisciplineId),
  );

  const lockablePackages = (packagesQuery.data ?? []).filter(
    (pkg) => pkg.projectedStatus === 'APPROVED',
  );

  const packageColumns: ColumnsType<DesignPackage> = [
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
  ];

  return (
    <Form<SubmittalPackageFormValues>
      form={form}
      layout="vertical"
      onFinish={(values: SubmittalPackageFormValues) => void onSubmit(values)}
    >
      <Form.Item
        name="category"
        label="Category"
        rules={[{ required: true }]}
      >
        <Input placeholder="e.g. Shop drawings" />
      </Form.Item>
      <Form.Item name="title" label="Title" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <div className="grid gap-4 md:grid-cols-2">
        <Form.Item name="contractor" label="Contractor">
          <Input />
        </Form.Item>
        <Form.Item name="supplier" label="Supplier">
          <Input />
        </Form.Item>
      </div>
      <Form.Item name="specReference" label="Spec reference">
        <Input />
      </Form.Item>

      <Form.Item label="Filter packages by discipline">
        <Select
          allowClear
          placeholder="Select discipline"
          options={disciplines.map((d) => ({
            value: d.id,
            label: d.disciplineName,
          }))}
          onChange={(value: string | undefined) => setSelectedDisciplineId(value ?? null)}
        />
      </Form.Item>

      {selectedDisciplineId && (
        <FormLayout title="Approved packages" className="mb-4">
          <Table<DesignPackage>
            rowKey="id"
            size="small"
            columns={packageColumns}
            dataSource={lockablePackages}
            pagination={false}
            locale={{ emptyText: 'No approved packages in this discipline' }}
          />
        </FormLayout>
      )}

      <Form.Item
        name="designPackageIds"
        label="Design packages"
        rules={[{ required: true, message: 'Select at least one package' }]}
      >
        <Select
          mode="multiple"
          placeholder="Select approved packages"
          options={lockablePackages.map((pkg) => ({
            value: pkg.id,
            label: pkg.name,
          }))}
        />
      </Form.Item>
    </Form>
  );
}
