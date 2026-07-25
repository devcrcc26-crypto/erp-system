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
import { useQuery } from '@tanstack/react-query';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import type {
  DesignPackage,
  DesignPackageProjectedStatus,
} from '@/lib/api/epc.types';
import type { SubmittalPurpose } from '@/lib/api/project-management.types';
import { apiGet } from '@/lib/api/client';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { designPackageKeys } from '@/lib/query/design-packages';
import { useCreateDesignSubmittal } from '@/lib/query/epc-submittals';
import { useAllProjects } from '@/lib/query/projects';
import { submittalDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCapabilitiesReady } from '@/hooks/use-pm-capabilities';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import { formatExternalReleasePurpose } from '@/lib/utils/external-release-purpose';
import { isProjectStageBlockedError } from '@/lib/api/errors';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface SubmittalPackageFormValues {
  projectId?: string;
  title: string;
  description?: string;
  recipientName?: string;
  submittalPurpose: SubmittalPurpose;
  taskDisciplineId: string;
  designPackageIds: string[];
}

const EXTERNAL_RELEASE_PURPOSES: {
  value: SubmittalPurpose;
  label: string;
}[] = [
  {
    value: 'DISCIPLINE_SITE',
    label: formatExternalReleasePurpose('DISCIPLINE_SITE'),
  },
  {
    value: 'DISCIPLINE_CONSULTANT',
    label: formatExternalReleasePurpose('DISCIPLINE_CONSULTANT'),
  },
];

/** Subtasks eligible for external release — Approved or Locked only. */
const RELEASABLE_STATUSES: DesignPackageProjectedStatus[] = [
  'APPROVED',
  'LOCKED',
];

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
  // Prefer /projects (access-scoped) over My Work — My Work omits projects without assignments.
  const projectsQuery = useAllProjects(
    {},
    open && showProjectSelector && capabilitiesReady,
  );

  const disciplinesQuery = useProjectDisciplines(
    effectiveProjectId,
    open && Boolean(effectiveProjectId),
  );
  const createSubmittal = useCreateDesignSubmittal();
  const messageApi = useAppMessage();
  const [stageBlocked, setStageBlocked] = useState(false);
  const taskDisciplineId = Form.useWatch('taskDisciplineId', form) as
    | string
    | undefined;
  const disciplines = disciplinesQuery.data ?? [];

  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.projectCode} — ${project.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const packagesQuery = useQuery({
    queryKey: designPackageKeys.lists(
      effectiveProjectId,
      taskDisciplineId ?? '__none__',
    ),
    queryFn: () =>
      apiGet<DesignPackage[]>(
        designPackagesPath(effectiveProjectId, taskDisciplineId!),
      ),
    enabled: Boolean(effectiveProjectId) && Boolean(taskDisciplineId),
    staleTime: 30_000,
  });

  const lockablePackages = useMemo(
    () =>
      (packagesQuery.data ?? []).filter((pkg) =>
        RELEASABLE_STATUSES.includes(pkg.projectedStatus),
      ),
    [packagesQuery.data],
  );

  const isLoadingPackages = packagesQuery.isLoading;
  const hasSelectedProject = Boolean(effectiveProjectId);
  const hasSelectedDiscipline = Boolean(taskDisciplineId);

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
      title="New external release"
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
            Create release
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
          description="External releases cannot be created while the project is in Tender stage. The project must be moved to an active design stage (Concept Design or later) before releases can be raised."
        />
      ) : (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="Select the discipline and approved subtasks to include in this release package."
        />
      )}

      <SubmittalPackageForm
        form={form}
        showProjectSelector={showProjectSelector}
        projectOptions={projectOptions}
        projectOptionsLoading={projectsQuery.isLoading}
        onProjectChange={handleProjectChange}
        hasSelectedProject={hasSelectedProject}
        disciplines={disciplines}
        disciplinesLoading={disciplinesQuery.isLoading}
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
                title: values.title.trim(),
                designPackageIds: values.designPackageIds,
                recipientName: values.recipientName?.trim() || undefined,
                description: values.description?.trim() || undefined,
                submittalPurpose: values.submittalPurpose,
                preparedByRole: 'DISCIPLINE_LEAD',
                taskDisciplineId: values.taskDisciplineId,
              },
            });
            messageApi.success('External release created');
            form.resetFields();
            onCreated(result.id);
            onClose();
          } catch (error) {
            if (isProjectStageBlockedError(error)) {
              setStageBlocked(true);
              return;
            }
            notifyApiError(error, 'Failed to create external release', messageApi);
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
  lockablePackages: DesignPackage[];
  isLoadingPackages: boolean;
  hasSelectedDiscipline: boolean;
  onSubmit: (values: SubmittalPackageFormValues) => Promise<void>;
}): React.ReactNode {
  const purpose = Form.useWatch('submittalPurpose', form) as
    | SubmittalPurpose
    | undefined;

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
        label="Release purpose"
        rules={[{ required: true }]}
      >
        <Select options={EXTERNAL_RELEASE_PURPOSES} />
      </Form.Item>

      {purpose === 'DISCIPLINE_SITE' && (
        <Form.Item name="recipientName" label="Site recipient">
          <Input placeholder="e.g. Site Manager, Foreman, Site office" />
        </Form.Item>
      )}

      {purpose === 'DISCIPLINE_CONSULTANT' && (
        <Form.Item name="recipientName" label="Consultant recipient">
          <Input placeholder="e.g. Consultant name, company, contact person" />
        </Form.Item>
      )}

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

      <Form.Item name="title" label="Title" rules={[{ required: true }]}>
        <Input />
      </Form.Item>

      <Form.Item name="description" label="Description">
        <Input.TextArea
          rows={3}
          placeholder="Add notes about this release package (optional)"
        />
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
              description="This discipline has no subtasks ready for external release. Subtasks must be Approved or Locked before they can be packaged and sent externally."
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
