'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Modal,
  Select,
  Space,
  Table,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
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
  useDesignPackageDependencies,
  useDesignPackages,
  useRemoveDesignPackageDependency,
  useRemoveDesignPackageItem,
} from '@/lib/query/design-packages';
import { useEngineeringDocuments } from '@/lib/query/engineering-documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';

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
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<DesignPackage | null>(null);
  const [addItemPackageId, setAddItemPackageId] = useState<string | null>(null);
  const [addDepPackageId, setAddDepPackageId] = useState<string | null>(null);
  const [itemForm] = Form.useForm<{ engineeringDocumentVersionId: string }>();
  const [depForm] = Form.useForm<{
    dependsOnPackageId: string;
    dependencyType: 'FINISH_TO_START' | 'COORDINATION_ONLY';
  }>();

  const packagesQuery = useDesignPackages(
    projectId,
    taskDisciplineId,
    lens.canViewEngineering,
  );
  const documentsQuery = useEngineeringDocuments(
    projectId,
    taskDisciplineId,
    { page: 1, limit: 100 },
    lens.canViewEngineering,
  );

  const addItem = useAddDesignPackageItem();
  const removeItem = useRemoveDesignPackageItem();
  const addDependency = useAddDesignPackageDependency();
  const removeDependency = useRemoveDesignPackageDependency();

  const packages = packagesQuery.data ?? [];
  const grouped = useMemo(() => groupPackagesByStatus(packages), [packages]);

  const edvOptions = useMemo(() => {
    const docs = documentsQuery.data?.data ?? [];
    const options: { value: string; label: string }[] = [];
    for (const doc of docs) {
      for (const version of doc.versions ?? []) {
        options.push({
          value: version.id,
          label: `${doc.title} — Rev ${version.revisionLabel} (${version.status})`,
        });
      }
    }
    return options;
  }, [documentsQuery.data]);

  const apiUnavailable =
    packagesQuery.isError &&
    packagesQuery.error instanceof ApiRequestError &&
    (packagesQuery.error.status === 404 || packagesQuery.error.status === 0);

  if (!lens.canViewEngineering) {
    return null;
  }

  const packageColumns: ColumnsType<DesignPackage> = [
    {
      title: 'Package',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Link
          href={`/projects/${projectId}/disciplines/${taskDisciplineId}/packages/${record.id}`}
        >
          {name}
        </Link>
      ),
    },
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
    {
      title: 'Submitted',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      render: (value: string | null) =>
        value ? new Date(value).toLocaleDateString() : '—',
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_value, record) => (
        <Space size="small">
          <Button
            type="link"
            className="!px-0"
            onClick={() => {
              setEditing(record);
              setBuilderOpen(true);
            }}
            disabled={!lens.canEditEngineering}
          >
            Edit
          </Button>
          <Button
            type="link"
            className="!px-0"
            onClick={() => setAddItemPackageId(record.id)}
            disabled={!lens.canEditEngineering}
          >
            Add EDV
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <FormLayout
      title={compact ? undefined : 'Design packages'}
      description={
        compact
          ? undefined
          : 'Packages grouped by projected workflow status — not folder hierarchy.'
      }
      extra={
        lens.canCreateEngineering ? (
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setBuilderOpen(true);
            }}
          >
            New package
          </Button>
        ) : undefined
      }
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="Design packages API not available"
        />
      )}

      {Object.entries(grouped).map(([status, statusPackages]) => (
        <div key={status} className="mb-6">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {status.replace(/_/g, ' ')}
          </h4>
          <Table<DesignPackage>
            rowKey="id"
            size="small"
            columns={packageColumns}
            dataSource={statusPackages}
            pagination={false}
          />
        </div>
      ))}

      {packages.length === 0 && !packagesQuery.isLoading && (
        <p className="text-sm text-slate-500">No design packages yet.</p>
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
              await addItem.mutateAsync({
                projectId,
                taskDisciplineId,
                packageId: addItemPackageId,
                body: { engineeringDocumentVersionId: values.engineeringDocumentVersionId },
              });
              message.success('Document version added to package');
              itemForm.resetFields();
              setAddItemPackageId(null);
              void packagesQuery.refetch();
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
    </FormLayout>
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
      { doc: EngineeringDocument; revisionLabel: string; status: string }
    >();
    for (const doc of documents) {
      for (const version of doc.versions ?? []) {
        map.set(version.id, {
          doc,
          revisionLabel: version.revisionLabel,
          status: version.status,
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
      render: (_value, record) =>
        edvMap.get(record.engineeringDocumentVersionId)?.revisionLabel ?? '—',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value, record) => {
        const status = edvMap.get(record.engineeringDocumentVersionId)?.status;
        return status ? <EdvStatusBadge status={status} /> : '—';
      },
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
        ) : null,
    },
  ];

  return (
    <Table<DesignPackageItem>
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={items}
      pagination={false}
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
      render: (id: string) => nameById.get(id) ?? id,
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
    <Table<DesignPackageDependency>
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dependencies}
      pagination={false}
      locale={{ emptyText: 'No dependencies' }}
    />
  );
}
