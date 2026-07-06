// UI polish pass - styles only, no logic changes

'use client';

import { useMemo } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueries } from '@tanstack/react-query';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import type { DesignPackage } from '@/lib/api/epc.types';
import type {
  SubmittalPreparedByRole,
  SubmittalPurpose,
} from '@/lib/api/project-management.types';
import { apiGet } from '@/lib/api/client';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { designPackageKeys } from '@/lib/query/design-packages';
import { useCreateDesignSubmittal } from '@/lib/query/epc-submittals';
import { submittalDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';

interface SubmittalPackageFormValues {
  category: string;
  title: string;
  contractor?: string;
  supplier?: string;
  specReference?: string;
  submittalPurpose: SubmittalPurpose;
  taskDisciplineId?: string;
  designPackageIds: string[];
}

const DISCIPLINE_LEAD_PURPOSES: SubmittalPurpose[] = [
  'DISCIPLINE_SITE',
  'DISCIPLINE_CONSULTANT',
];

const DEPUTY_PURPOSES: SubmittalPurpose[] = [
  'DEPUTY_BID',
  'DEPUTY_INTERIM',
  'DEPUTY_FINAL',
];

function purposeToRole(purpose: SubmittalPurpose): SubmittalPreparedByRole {
  return DISCIPLINE_LEAD_PURPOSES.includes(purpose)
    ? 'DISCIPLINE_LEAD'
    : 'DEPUTY_CHIEF';
}

function designPackagesPath(
  projectId: string,
  taskDisciplineId: string,
): string {
  return `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages`;
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
  const purpose = Form.useWatch('submittalPurpose', form) as
    | SubmittalPurpose
    | undefined;
  const preparedByRole = purpose ? purposeToRole(purpose) : undefined;
  const isDeputy = preparedByRole === 'DEPUTY_CHIEF';

  return (
    <Drawer
      {...submittalDrawerProps}
      title="Create design submittal"
      open={open}
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
        title="Select approved subtasks"
        description={
          isDeputy
            ? 'Deputy chief submittals may bundle locked-ready packages across disciplines.'
            : 'Discipline lead submittals must use packages from a single assigned discipline.'
        }
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
              submittalPurpose: values.submittalPurpose,
              preparedByRole: purposeToRole(values.submittalPurpose),
              taskDisciplineId: values.taskDisciplineId,
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
  const purpose = Form.useWatch('submittalPurpose', form) as
    | SubmittalPurpose
    | undefined;
  const taskDisciplineId = Form.useWatch('taskDisciplineId', form) as
    | string
    | undefined;
  const preparedByRole = purpose ? purposeToRole(purpose) : undefined;
  const isDeputy = preparedByRole === 'DEPUTY_CHIEF';

  const packageQueries = useQueries({
    queries: disciplines.map((discipline) => ({
      queryKey: designPackageKeys.lists(projectId, discipline.id),
      queryFn: () =>
        apiGet<DesignPackage[]>(designPackagesPath(projectId, discipline.id)),
      enabled: Boolean(projectId) && isDeputy,
      staleTime: 30_000,
    })),
  });

  const singleDisciplinePackagesQuery = useQueries({
    queries: [
      {
        queryKey: designPackageKeys.lists(
          projectId,
          taskDisciplineId ?? '__none__',
        ),
        queryFn: () =>
          apiGet<DesignPackage[]>(
            designPackagesPath(projectId, taskDisciplineId!),
          ),
        enabled: Boolean(projectId) && Boolean(taskDisciplineId) && !isDeputy,
        staleTime: 30_000,
      },
    ],
  });

  const lockablePackages = useMemo(() => {
    const source = isDeputy
      ? packageQueries.flatMap((query) => query.data ?? [])
      : (singleDisciplinePackagesQuery[0]?.data ?? []);
    return source.filter((pkg) => pkg.projectedStatus === 'APPROVED');
  }, [isDeputy, packageQueries, singleDisciplinePackagesQuery]);

  const purposeOptions = useMemo(() => {
    const options = [
      ...DISCIPLINE_LEAD_PURPOSES.map((value) => ({
        value,
        label:
          value === 'DISCIPLINE_SITE'
            ? 'Discipline - site issue'
            : 'Discipline - consultant issue',
      })),
      ...DEPUTY_PURPOSES.map((value) => ({
        value,
        label:
          value === 'DEPUTY_BID'
            ? 'Deputy - bid package'
            : value === 'DEPUTY_INTERIM'
              ? 'Deputy - interim package'
              : 'Deputy - final package',
      })),
    ];
    return options;
  }, []);

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
      className="erp-drawer-form"
      initialValues={{ submittalPurpose: 'DISCIPLINE_SITE' as SubmittalPurpose }}
      onFinish={(values: SubmittalPackageFormValues) => void onSubmit(values)}
    >
      <Form.Item
        name="submittalPurpose"
        label="Submittal purpose"
        rules={[{ required: true }]}
      >
        <Select options={purposeOptions} />
      </Form.Item>

      {!isDeputy && (
        <Form.Item
          name="taskDisciplineId"
          label="Discipline"
          rules={[{ required: true, message: 'Select a discipline' }]}
        >
          <Select
            placeholder="Select discipline"
            options={disciplines.map((d) => ({
              value: d.id,
              label: d.disciplineName,
            }))}
          />
        </Form.Item>
      )}

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

      {(isDeputy || taskDisciplineId) && (
        <FormLayout title="Approved packages" className="mb-4">
          <DataTable<DesignPackage>
            rowKey="id"
            size="small"
            columns={packageColumns}
            dataSource={lockablePackages}
            locale={{ emptyText: 'No approved packages available' }}
          />
        </FormLayout>
      )}

      <Form.Item
        name="designPackageIds"
        label="Subtasks"
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
