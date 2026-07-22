// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueries } from '@tanstack/react-query';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import type {
  DesignPackage,
  DesignPackageProjectedStatus,
} from '@/lib/api/epc.types';
import type {
  SubmittalPreparedByRole,
  SubmittalPurpose,
} from '@/lib/api/project-management.types';
import { apiGet } from '@/lib/api/client';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { designPackageKeys } from '@/lib/query/design-packages';
import { useCreateDesignSubmittal } from '@/lib/query/epc-submittals';
import { useMyWork } from '@/lib/query/epc-workspace';
import { submittalDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewMyWork, useCapabilitiesReady } from '@/hooks/use-pm-capabilities';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import { isProjectStageBlockedError } from '@/lib/api/errors';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface SubmittalPackageFormValues {
  projectId?: string;
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

/** Subtasks eligible for external release — Approved or Locked only. */
const RELEASABLE_STATUSES: DesignPackageProjectedStatus[] = [
  'APPROVED',
  'LOCKED',
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
  projectId: projectIdProp,
  showProjectSelector = false,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId?: string;
  showProjectSelector?: boolean;
  onClose: () => void;
  onCreated: (submittalId: string) => void;
}): React.ReactNode {
  const [form] = Form.useForm<SubmittalPackageFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? '';

  const capabilitiesReady = useCapabilitiesReady();
  const canViewMyWork = useCanViewMyWork();
  const myWorkQuery = useMyWork(
    undefined,
    open && showProjectSelector && capabilitiesReady && canViewMyWork,
  );

  const disciplinesQuery = useProjectDisciplines(
    effectiveProjectId,
    open && Boolean(effectiveProjectId),
  );
  const createSubmittal = useCreateDesignSubmittal();
  const messageApi = useAppMessage();
  const [stageBlocked, setStageBlocked] = useState(false);
  const purpose = Form.useWatch('submittalPurpose', form) as
    | SubmittalPurpose
    | undefined;
  const taskDisciplineId = Form.useWatch('taskDisciplineId', form) as
    | string
    | undefined;
  const preparedByRole = purpose ? purposeToRole(purpose) : undefined;
  const isDeputy = preparedByRole === 'DEPUTY_CHIEF';
  const disciplines = disciplinesQuery.data ?? [];

  const projectOptions = useMemo(() => {
    const myWorkItems = myWorkQuery.data ?? [];
    return Array.from(
      new Map(
        myWorkItems.map((item) => [
          item.projectId,
          {
            value: item.projectId,
            label: `${item.projectNumber ?? ''} ${item.projectName ?? ''}`.trim(),
          },
        ]),
      ).values(),
    );
  }, [myWorkQuery.data]);

  const packageQueries = useQueries({
    queries: disciplines.map((discipline) => ({
      queryKey: designPackageKeys.lists(effectiveProjectId, discipline.id),
      queryFn: () =>
        apiGet<DesignPackage[]>(
          designPackagesPath(effectiveProjectId, discipline.id),
        ),
      enabled: Boolean(effectiveProjectId) && isDeputy,
      staleTime: 30_000,
    })),
  });

  const singleDisciplinePackagesQuery = useQueries({
    queries: [
      {
        queryKey: designPackageKeys.lists(
          effectiveProjectId,
          taskDisciplineId ?? '__none__',
        ),
        queryFn: () =>
          apiGet<DesignPackage[]>(
            designPackagesPath(effectiveProjectId, taskDisciplineId!),
          ),
        enabled:
          Boolean(effectiveProjectId) && Boolean(taskDisciplineId) && !isDeputy,
        staleTime: 30_000,
      },
    ],
  });

  const lockablePackages = useMemo(() => {
    const source = isDeputy
      ? packageQueries.flatMap((query) => query.data ?? [])
      : (singleDisciplinePackagesQuery[0]?.data ?? []);
    return source.filter((pkg) =>
      RELEASABLE_STATUSES.includes(pkg.projectedStatus),
    );
  }, [isDeputy, packageQueries, singleDisciplinePackagesQuery]);

  const isLoadingPackages = isDeputy
    ? packageQueries.some((query) => query.isLoading)
    : (singleDisciplinePackagesQuery[0]?.isLoading ?? false);

  const hasSelectedProject = Boolean(effectiveProjectId);
  const hasSelectedDiscipline = isDeputy
    ? hasSelectedProject
    : Boolean(taskDisciplineId);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedProjectId(projectIdProp ?? null);
    if (projectIdProp) {
      form.setFieldsValue({ projectId: projectIdProp });
    }
  }, [open, projectIdProp, form]);

  function handleProjectChange(nextProjectId: string): void {
    setSelectedProjectId(nextProjectId);
    setStageBlocked(false);
    form.setFieldsValue({
      projectId: nextProjectId,
      taskDisciplineId: undefined,
      designPackageIds: undefined,
    });
  }

  function handleClose(): void {
    setSelectedProjectId(projectIdProp ?? null);
    setStageBlocked(false);
    form.resetFields();
    onClose();
  }

  return (
    <Drawer
      {...submittalDrawerProps}
      title="Create design submittal"
      open={open}
      onClose={handleClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            type="primary"
            loading={createSubmittal.isPending}
            disabled={
              stageBlocked ||
              !hasSelectedProject ||
              !hasSelectedDiscipline ||
              isLoadingPackages ||
              lockablePackages.length === 0
            }
            onClick={() => form.submit()}
          >
            Create submittal
          </Button>
        </Space>
      }
    >
      {stageBlocked ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title="Project is in Tender stage"
          description="Submittals and external releases cannot be created while the project is in Tender stage. The project must be moved to an active design stage (Concept Design or later) before submittals can be raised."
        />
      ) : (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="Select approved subtasks"
          description={
            isDeputy
              ? 'Deputy chief submittals may bundle locked-ready subtasks across disciplines.'
              : 'Discipline lead submittals must use subtasks from a single assigned discipline.'
          }
        />
      )}

      <SubmittalPackageForm
        form={form}
        showProjectSelector={showProjectSelector}
        projectOptions={projectOptions}
        projectOptionsLoading={myWorkQuery.isLoading}
        onProjectChange={handleProjectChange}
        hasSelectedProject={hasSelectedProject}
        disciplines={disciplines}
        disciplinesLoading={disciplinesQuery.isLoading}
        isDeputy={isDeputy}
        lockablePackages={lockablePackages}
        isLoadingPackages={isLoadingPackages}
        hasSelectedDiscipline={hasSelectedDiscipline}
        onSubmit={async (values) => {
          const projectId = selectedProjectId ?? values.projectId ?? projectIdProp;
          if (!projectId) {
            messageApi.error('Select a project');
            return;
          }
          try {
            setStageBlocked(false);
            const result = await createSubmittal.mutateAsync({
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
            onCreated(result.id);
            onClose();
          } catch (error) {
            if (isProjectStageBlockedError(error)) {
              setStageBlocked(true);
              return;
            }
            notifyApiError(error, 'Failed to create design submittal', messageApi);
          }
        }}
      />
    </Drawer>
  );
}

function SubmittalPackageForm({
  form,
  showProjectSelector,
  projectOptions,
  projectOptionsLoading,
  onProjectChange,
  hasSelectedProject,
  disciplines,
  disciplinesLoading,
  isDeputy,
  lockablePackages,
  isLoadingPackages,
  hasSelectedDiscipline,
  onSubmit,
}: {
  form: ReturnType<typeof Form.useForm<SubmittalPackageFormValues>>[0];
  showProjectSelector: boolean;
  projectOptions: { value: string; label: string }[];
  projectOptionsLoading: boolean;
  onProjectChange: (projectId: string) => void;
  hasSelectedProject: boolean;
  disciplines: {
    id: string;
    disciplineIndex?: number | null;
    disciplineNumber?: string | null;
    disciplineName?: string | null;
    overseasTaskNumber?: string | null;
  }[];
  disciplinesLoading: boolean;
  isDeputy: boolean;
  lockablePackages: DesignPackage[];
  isLoadingPackages: boolean;
  hasSelectedDiscipline: boolean;
  onSubmit: (values: SubmittalPackageFormValues) => Promise<void>;
}): React.ReactNode {
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
  ];

  return (
    <Form<SubmittalPackageFormValues>
      form={form}
      layout="vertical"
      className="erp-drawer-form"
      initialValues={{ submittalPurpose: 'DISCIPLINE_SITE' as SubmittalPurpose }}
      onFinish={(values: SubmittalPackageFormValues) => void onSubmit(values)}
    >
      {showProjectSelector && (
        <Form.Item
          name="projectId"
          label="Project"
          rules={[{ required: true, message: 'Select a project' }]}
        >
          <Select
            showSearch
            placeholder="Select project"
            options={projectOptions}
            loading={projectOptionsLoading}
            optionFilterProp="label"
            onChange={onProjectChange}
          />
        </Form.Item>
      )}

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
            loading={disciplinesLoading}
            disabled={showProjectSelector && !hasSelectedProject}
            options={disciplines.map((d) => ({
              value: d.id,
              label: d.disciplineNumber
                ? `${d.disciplineNumber} — ${d.disciplineName ?? ''}`
                : (d.disciplineName ?? formatDisciplineLabel(d.disciplineIndex)),
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

      {!hasSelectedDiscipline && (
        <Form.Item>
          <Alert
            type="info"
            showIcon
            title={
              showProjectSelector && !hasSelectedProject
                ? 'Select a project and discipline to see available subtasks'
                : 'Select a discipline to see available subtasks'
            }
          />
        </Form.Item>
      )}

      {hasSelectedDiscipline && isLoadingPackages && (
        <Form.Item>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spin size="small" />
            Loading subtasks...
          </div>
        </Form.Item>
      )}

      {hasSelectedDiscipline &&
        !isLoadingPackages &&
        lockablePackages.length === 0 && (
          <Form.Item>
            <Alert
              type="info"
              showIcon
              title="No subtasks ready for release"
              description="This discipline has no subtasks ready for external release. Subtasks must be submitted for review (Pending Lead, Approved, or Locked status) before they can be packaged and sent externally."
            />
          </Form.Item>
        )}

      {hasSelectedDiscipline &&
        !isLoadingPackages &&
        lockablePackages.length > 0 && (
          <>
            <FormLayout title="Approved subtasks" className="mb-4">
              <DataTable<DesignPackage>
                rowKey="id"
                size="small"
                columns={packageColumns}
                dataSource={lockablePackages}
                locale={{ emptyText: 'No approved subtasks available' }}
              />
            </FormLayout>

            <Form.Item
              name="designPackageIds"
              label="Subtasks"
              rules={[{ required: true, message: 'Select at least one subtask' }]}
            >
              <Select
                mode="multiple"
                placeholder="Select approved subtasks"
                options={lockablePackages.map((pkg) => ({
                  value: pkg.id,
                  label: pkg.name,
                }))}
              />
            </Form.Item>
          </>
        )}
    </Form>
  );
}
