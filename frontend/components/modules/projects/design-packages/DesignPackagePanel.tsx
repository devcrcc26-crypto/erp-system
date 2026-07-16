'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Modal,
  Select,
  Space,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Package } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import DataTable from '@/components/ui/DataTable/DataTable';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  DesignPackage,
  DesignPackageDependency,
  DesignPackageItem,
  EngineeringDocument,
} from '@/lib/api/epc.types';
import {
  useAddDesignPackageDependency,
  useAddDesignPackageItem,
  useDesignPackages,
  useRemoveDesignPackageDependency,
  useRemoveDesignPackageItem,
  useSubmitPackageForReview,
} from '@/lib/query/design-packages';
import { useEngineeringDocuments } from '@/lib/query/engineering-documents';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useCanViewMyWork, useEpcCapabilities, usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import PackageStatusBadge from '@/components/ui/EdvStatusBadge/PackageStatusBadge';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getPackageSubmitEligibility } from '@/lib/utils/package-workflow';
import { resolvePackageRoles } from '@/lib/utils/subtask-role-resolver';
import { reviewModeHref, scheduleSubtaskWorkspaceHref } from '@/lib/utils/schedule-subtasks';
import { canManageSubtaskAsDisciplineLeader } from '@/lib/utils/subtask-permissions';
import { getLatestEngineeringDocumentVersion } from '@/lib/utils/engineering-document-versions';

const REVIEWER_TIER_ROLES = new Set([
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
  'INSTITUTE_CHIEF',
]);

function groupPackagesByStatus(
  packages: DesignPackage[],
): Record<string, DesignPackage[]> {
  const groups: Record<string, DesignPackage[]> = {};
  for (const pkg of packages) {
    const key = pkg.projectedStatus;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(pkg);
  }
  return groups;
}

export default function DesignPackagePanel({
  projectId,
  taskDisciplineId,
  compact = false,
}: {
  projectId: string;
  taskDisciplineId: string;
  compact?: boolean;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const canViewMyWork = useCanViewMyWork();
  const canAccessEngineering = lens.canViewEngineering || canViewMyWork;
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const epc = useEpcCapabilities();
  const hasElevatedAccess =
    useAuthStore((state) => state.capabilities.isSystemAdministrator) ||
    epc.navFullAccess;
  const disciplineQuery = useProjectDiscipline(
    projectId,
    taskDisciplineId,
    !permLoading && canAccessEngineering,
  );
  const canCreateSubtask = canManageSubtaskAsDisciplineLeader(
    disciplineQuery.data,
    currentUserId,
    hasElevatedAccess,
  );
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<DesignPackage | null>(null);
  const [addItemPackageId, setAddItemPackageId] = useState<string | null>(null);
  const [addDepPackageId, setAddDepPackageId] = useState<string | null>(null);
  const [submittingPackageId, setSubmittingPackageId] = useState<string | null>(
    null,
  );
  const [itemForm] = Form.useForm<{ engineeringDocumentVersionId: string }>();

  const packagesQuery = useDesignPackages(
    projectId,
    taskDisciplineId,
    !permLoading && canAccessEngineering,
  );
  const documentsQuery = useEngineeringDocuments(
    projectId,
    taskDisciplineId,
    { page: 1, limit: 100 },
    !permLoading && canAccessEngineering,
  );

  const addItem = useAddDesignPackageItem();
  const removeItem = useRemoveDesignPackageItem();
  const submitForReview = useSubmitPackageForReview();

  const packages = packagesQuery.data ?? [];
  const grouped = useMemo(() => groupPackagesByStatus(packages), [packages]);

  const addItemPackage = useMemo(
    () => packages.find((pkg) => pkg.id === addItemPackageId) ?? null,
    [packages, addItemPackageId],
  );

  const edvOptions = useMemo(() => {
    const assignedIds = new Set(
      addItemPackage?.items?.map((item) => item.engineeringDocumentVersionId) ??
        [],
    );
    const docs = documentsQuery.data?.data ?? [];
    const options: { value: string; label: string }[] = [];
    for (const doc of docs) {
      for (const version of doc.versions ?? []) {
        if (assignedIds.has(version.id) || version.status !== 'DRAFT') {
          continue;
        }
        options.push({
          value: version.id,
          label: `${doc.title} - Rev ${version.revisionLabel} (${version.status})`,
        });
      }
    }
    return options;
  }, [addItemPackage, documentsQuery.data]);

  const apiUnavailable =
    packagesQuery.isError &&
    packagesQuery.error instanceof ApiRequestError &&
    (packagesQuery.error.status === 404 || packagesQuery.error.status === 0);

  if (permLoading || packagesQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessEngineering) {
    return null;
  }

  function packageOpenHref(pkg: DesignPackage): string {
    const discipline = disciplineQuery.data;
    if (discipline && currentUserId) {
      const { primaryRole } = resolvePackageRoles(pkg, discipline, currentUserId);
      if (primaryRole && REVIEWER_TIER_ROLES.has(primaryRole)) {
        return reviewModeHref(projectId, taskDisciplineId, pkg.id);
      }
    }
    return scheduleSubtaskWorkspaceHref(projectId, taskDisciplineId, pkg.id);
  }

  const packageColumns: ColumnsType<DesignPackage> = [
    {
      title: 'Package',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Link href={packageOpenHref(record)}>{name}</Link>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value, record) => (
        <Space size="small" wrap>
          <ProjectedStatusBadge
            status={record.projectedStatus}
            pending={record.projectionPending}
          />
          <PackageStatusBadge status={record.packageStatus} />
        </Space>
      ),
    },
    {
      title: 'Submitted',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      render: (value: string | null) =>
        value ? new Date(value).toLocaleDateString() : '-',
    },
    {
      title: '',
      key: 'actions',
      width: 400,
      render: (_value, record) => {
        const discipline = disciplineQuery.data;
        const roles =
          discipline && currentUserId
            ? resolvePackageRoles(record, discipline, currentUserId)
            : null;
        const canUploadToPackage =
          roles?.primaryRole === 'DESIGNER' ||
          roles?.primaryRole === 'SUPPORTING_DESIGNER';
        const canEditSubtask = canManageSubtaskAsDisciplineLeader(
          disciplineQuery.data,
          currentUserId,
          hasElevatedAccess,
        );
        const canSubmitPackage = roles?.primaryRole === 'DESIGNER';
        const submitEligibility = getPackageSubmitEligibility(
          record,
          record.items,
          documentsQuery.data?.data ?? [],
        );

        return (
        <Space size="small" wrap>
          {canSubmitPackage && submitEligibility.submittable ? (
            <Button
              type="link"
              className="!px-0"
              loading={submittingPackageId === record.id}
              onClick={() => {
                setSubmittingPackageId(record.id);
                void submitForReview
                  .mutateAsync({
                    projectId,
                    taskDisciplineId,
                    packageId: record.id,
                  })
                  .then(() => {
                    messageApi.success('Package submitted for review');
                    void packagesQuery.refetch();
                  })
                  .catch((error) => {
                    notifyApiError(error, 'Failed to submit package', messageApi);
                  })
                  .finally(() => {
                    setSubmittingPackageId(null);
                  });
              }}
            >
              Submit for review
            </Button>
          ) : null}
          <Button
            type="link"
            className="!px-0"
            onClick={() => {
              setEditing(record);
              setBuilderOpen(true);
            }}
            disabled={!canEditSubtask}
          >
            Edit subtask
          </Button>
          <Button
            type="link"
            className="!px-0"
            onClick={() => setAddItemPackageId(record.id)}
            disabled={!canUploadToPackage}
          >
            Add EDV
          </Button>
          <Button
            type="link"
            className="!px-0"
            onClick={() => setAddDepPackageId(record.id)}
            disabled={!canEditSubtask}
          >
            Add dependency
          </Button>
        </Space>
        );
      },
    },
  ];

  return (
    <FormLayout
      title={compact ? undefined : 'Subtasks'}
      description={
        compact
          ? undefined
          : 'Packages grouped by projected workflow status - not folder hierarchy.'
      }
      extra={
        canCreateSubtask ? (
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setBuilderOpen(true);
            }}
          >
            New subtask
          </Button>
        ) : undefined
      }
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="Subtasks API not available"
        />
      )}

      {Object.entries(grouped).map(([status, statusPackages]) => (
        <div key={status} className="mb-6">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {status.replace(/_/g, ' ')}
          </h4>
          <DataTable<DesignPackage>
            rowKey="id"
            size="middle"
            columns={packageColumns}
            dataSource={statusPackages}
          />
        </div>
      ))}

      {packages.length === 0 && !packagesQuery.isLoading && (
        <TableEmptyState
          icon={<Package />}
          title="No subtasks"
          description="Create a package to begin the review workflow"
          action={
            canCreateSubtask
              ? {
                  label: 'New subtask',
                  onClick: () => {
                    setEditing(null);
                    setBuilderOpen(true);
                  },
                }
              : undefined
          }
        />
      )}

      <DesignPackageBuilder
        open={builderOpen}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        editing={editing}
        onClose={() => {
          setBuilderOpen(false);
          setEditing(null);
        }}
        onSaved={() => void packagesQuery.refetch()}
      />

      {addItemPackageId && (
        <Modal
          title="Add document version to package"
          open
          onCancel={() => setAddItemPackageId(null)}
          footer={null}
          destroyOnHidden
        >
          <Form
            form={itemForm}
            layout="vertical"
            onFinish={async (values: { engineeringDocumentVersionId: string }) => {
              try {
                await addItem.mutateAsync({
                  projectId,
                  taskDisciplineId,
                  packageId: addItemPackageId,
                  body: { engineeringDocumentVersionId: values.engineeringDocumentVersionId },
                });
                messageApi.success('Document version added to package');
                itemForm.resetFields();
                setAddItemPackageId(null);
                void packagesQuery.refetch();
              } catch (error) {
                notifyApiError(error, 'Failed to add document version', messageApi);
              }
            }}
          >
            <Form.Item
              label="Engineering document version"
              name="engineeringDocumentVersionId"
              rules={[{ required: true, message: 'Select a version' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={edvOptions}
                placeholder="Select EDV"
              />
            </Form.Item>
            <Space>
              <Button onClick={() => setAddItemPackageId(null)}>Cancel</Button>
              <Button type="primary" loading={addItem.isPending} htmlType="submit">
                Add
              </Button>
            </Space>
          </Form>
        </Modal>
      )}

      {addDepPackageId && (
        <DesignPackageAddDependencyModal
          open
          projectId={projectId}
          taskDisciplineId={taskDisciplineId}
          packageId={addDepPackageId}
          packages={packages}
          onClose={() => setAddDepPackageId(null)}
          onAdded={() => void packagesQuery.refetch()}
        />
      )}
    </FormLayout>
  );
}

const DEPENDENCY_TYPE_OPTIONS = [
  { value: 'FINISH_TO_START', label: 'Finish to start' },
  { value: 'COORDINATION_ONLY', label: 'Coordination only' },
] as const;

export function DesignPackageAddDependencyModal({
  open,
  projectId,
  taskDisciplineId,
  packageId,
  packages,
  existingDependencyPackageIds = [],
  onClose,
  onAdded,
}: {
  open: boolean;
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  packages: DesignPackage[];
  existingDependencyPackageIds?: string[];
  onClose: () => void;
  onAdded: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const [form] = Form.useForm<{
    dependsOnPackageId: string;
    dependencyType: 'FINISH_TO_START' | 'COORDINATION_ONLY';
  }>();
  const addDependency = useAddDesignPackageDependency();

  const packageOptions = useMemo(() => {
    const excluded = new Set([packageId, ...existingDependencyPackageIds]);
    return packages
      .filter((pkg) => !excluded.has(pkg.id))
      .map((pkg) => ({ value: pkg.id, label: pkg.name }));
  }, [packageId, packages, existingDependencyPackageIds]);

  return (
    <Modal
      title="Add package dependency"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      afterOpenChange={(visible: boolean) => {
        if (!visible) {
          form.resetFields();
        }
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ dependencyType: 'FINISH_TO_START' }}
        onFinish={async (values: {
          dependsOnPackageId: string;
          dependencyType: 'FINISH_TO_START' | 'COORDINATION_ONLY';
        }) => {
          try {
            await addDependency.mutateAsync({
              projectId,
              taskDisciplineId,
              packageId,
              body: {
                dependsOnPackageId: values.dependsOnPackageId,
                dependencyType: values.dependencyType,
              },
            });
            messageApi.success('Package dependency added');
            form.resetFields();
            onClose();
            onAdded();
          } catch (error) {
            notifyApiError(error, 'Failed to add package dependency', messageApi);
          }
        }}
      >
        <Form.Item
          label="Depends on package"
          name="dependsOnPackageId"
          rules={[{ required: true, message: 'Select a package' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={packageOptions}
            placeholder={
              packageOptions.length > 0
                ? 'Select prerequisite package'
                : 'No other packages available'
            }
            disabled={packageOptions.length === 0}
          />
        </Form.Item>
        <Form.Item
          label="Dependency type"
          name="dependencyType"
          rules={[{ required: true, message: 'Select dependency type' }]}
        >
          <Select options={[...DEPENDENCY_TYPE_OPTIONS]} />
        </Form.Item>
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={addDependency.isPending}
            disabled={packageOptions.length === 0}
          >
            Add dependency
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}

export function DesignPackageItemsTable({
  projectId,
  taskDisciplineId,
  packageId,
  items,
  documents,
  canEdit,
  onChanged,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  items: DesignPackageItem[];
  documents: EngineeringDocument[];
  canEdit: boolean;
  onChanged: () => void;
}): React.ReactNode {
  const removeItem = useRemoveDesignPackageItem();

  const edvMap = useMemo(() => {
    const map = new Map<
      string,
      {
        doc: EngineeringDocument;
        revisionLabel: string;
        status: string;
        documentVersionId: string;
        displayRevisionLabel: string;
        displayStatus: string;
        displayDocumentVersionId: string;
      }
    >();
    for (const doc of documents) {
      const current = getLatestEngineeringDocumentVersion(doc.versions);
      for (const version of doc.versions ?? []) {
        map.set(version.id, {
          doc,
          revisionLabel: version.revisionLabel,
          status: version.status,
          documentVersionId: version.documentVersionId,
          displayRevisionLabel: current?.revisionLabel ?? version.revisionLabel,
          displayStatus: current?.status ?? version.status,
          displayDocumentVersionId:
            current?.documentVersionId ?? version.documentVersionId,
        });
      }
    }
    return map;
  }, [documents]);

  const columns: ColumnsType<DesignPackageItem> = [
    {
      title: 'Document',
      key: 'title',
      render: (_value, record) => {
        const info = edvMap.get(record.engineeringDocumentVersionId);
        return info?.doc.title ?? record.engineeringDocumentVersionId;
      },
    },
    {
      title: 'Revision',
      key: 'revision',
      align: 'right',
      render: (_value, record) =>
        edvMap.get(record.engineeringDocumentVersionId)?.displayRevisionLabel ??
        '-',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value, record) => {
        const status = edvMap.get(record.engineeringDocumentVersionId)
          ?.displayStatus;
        return status ? <EdvStatusBadge status={status} /> : '-';
      },
    },
    {
      title: '',
      key: 'actions',
      width: canEdit ? 220 : 180,
      render: (_value, record) => {
        const info = edvMap.get(record.engineeringDocumentVersionId);
        return (
          <Space size={4} wrap>
            <EdvFileActions
              documentVersionId={info?.displayDocumentVersionId}
              fileName={info?.doc.title}
            />
            {canEdit ? (
              <Button
                type="link"
                danger
                className="!px-1"
                onClick={() => {
                  void removeItem
                    .mutateAsync({
                      projectId,
                      taskDisciplineId,
                      packageId,
                      itemId: record.id,
                    })
                    .then(onChanged);
                }}
              >
                Remove
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  return (
    <DataTable<DesignPackageItem>
      rowKey="id"
      size="middle"
      columns={columns}
      dataSource={items}
      locale={{ emptyText: 'No items in package' }}
    />
  );
}

export function DesignPackageDependenciesTable({
  projectId,
  taskDisciplineId,
  packageId,
  dependencies,
  packages,
  canEdit,
  onChanged,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  dependencies: DesignPackageDependency[];
  packages: DesignPackage[];
  canEdit: boolean;
  onChanged: () => void;
}): React.ReactNode {
  const removeDependency = useRemoveDesignPackageDependency();
  const nameById = useMemo(
    () => new Map(packages.map((p) => [p.id, p.name])),
    [packages],
  );

  const columns: ColumnsType<DesignPackageDependency> = [
    {
      title: 'Depends on',
      dataIndex: 'dependsOnPackageId',
      key: 'dependsOnPackageId',
      render: (_id: string, record: DesignPackageDependency) =>
        record.dependsOnPackageName ??
        nameById.get(record.dependsOnPackageId) ??
        'Upstream package',
    },
    {
      title: 'Type',
      dataIndex: 'dependencyType',
      key: 'dependencyType',
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_value, record) =>
        canEdit ? (
          <Button
            type="link"
            danger
            className="!px-0"
            onClick={() => {
              void removeDependency
                .mutateAsync({
                  projectId,
                  taskDisciplineId,
                  packageId,
                  dependencyId: record.id,
                })
                .then(onChanged);
            }}
          >
            Remove
          </Button>
        ) : null,
    },
  ];

  return (
    <DataTable<DesignPackageDependency>
      rowKey="id"
      size="middle"
      columns={columns}
      dataSource={dependencies}
      locale={{ emptyText: 'No dependencies' }}
    />
  );
}
