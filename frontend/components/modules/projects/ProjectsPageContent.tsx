'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Input,
  Select,
  Space,
  Spin,
} from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Network } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import PlaceholderPage from '@/components/PlaceholderPage';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { Project, ProjectStatus } from '@/lib/api/project-management.types';
import { PROJECT_STATUS_WORKFLOW } from '@/lib/api/workflow';
import { useProjects } from '@/lib/query/projects';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAuthStore } from '@/stores/auth.store';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectStatus,
  formatProjectType,
  projectStatusVariant,
} from '@/lib/utils/project-display';
import ProjectFormDrawer from '@/components/modules/projects/ProjectFormDrawer';

export default function ProjectsPageContent(): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const canFetchProjects = authHydrated && isAuthenticated;

  const projectsQuery = useProjects(
    {
      ...params,
      search: search.trim() || undefined,
      status: statusFilter,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    canFetchProjects,
  );

  const columns: ColumnsType<Project> = useMemo(
    () => [
      {
        title: 'Code',
        dataIndex: 'projectCode',
        key: 'projectCode',
        render: (code: string, record) => (
          <Link
            href={`/projects/${record.id}`}
            className="font-medium text-orange-600 hover:text-orange-700"
          >
            {code}
          </Link>
        ),
      },
      {
        title: 'Name',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
      },
      {
        title: 'Type',
        dataIndex: 'projectType',
        key: 'projectType',
        render: (type: Project['projectType']) => formatProjectType(type),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: ProjectStatus) => (
          <StatusBadge
            label={formatProjectStatus(status)}
            variant={projectStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Planned finish',
        dataIndex: 'plannedFinishDate',
        key: 'plannedFinishDate',
        render: (value: string | null) => formatProjectDate(value),
      },
      {
        title: 'Budget',
        key: 'budget',
        align: 'right',
        render: (_value, record) =>
          formatProjectBudget(record.budget, record.currency),
      },
      {
        title: '',
        key: 'actions',
        width: 48,
        render: (_value, record) => (
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label="Edit project"
            onClick={() => {
              setEditingProject(record);
              setDrawerOpen(true);
            }}
          />
        ),
      },
    ],
    [],
  );

  if (!authHydrated) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <PlaceholderPage
        icon={Network}
        title="Projects"
        description="Sign in to view projects."
      />
    );
  }

  if (projectsQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  if (projectsQuery.isError) {
    const status =
      projectsQuery.error instanceof ApiRequestError
        ? projectsQuery.error.status
        : 0;

    if (status === 403 || status === 401) {
      return (
        <PlaceholderPage
          icon={Network}
          title="Projects"
          description="You do not have permission to view projects."
        />
      );
    }

    if (status === 404) {
      return (
        <PlaceholderPage
          icon={Network}
          title="Projects"
          description="Project management APIs are not available yet. The frontend is ready —connect the backend module to enable this page."
        />
      );
    }

    return (
      <PlaceholderPage
        icon={Network}
        title="Projects"
        description="Unable to load projects. Please try again later."
      />
    );
  }

  const projects = projectsQuery.data?.data ?? [];
  const meta = projectsQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Project register"
        description="Search and manage construction projects across your portfolio."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingProject(null);
              setDrawerOpen(true);
            }}
          >
            New project
          </Button>
        }
      >
        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search by code or name"
            className={layout.filterControlLg}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Filter by status"
            className={layout.filterControlMd}
            value={statusFilter}
            onChange={(value: ProjectStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={PROJECT_STATUS_WORKFLOW.map((step) => ({
              value: step.key,
              label: step.label,
            }))}
          />
        </Space>

        {projects.length === 0 ? (
          <Alert
            type="info"
            showIcon
            title="No projects found"
            description="Create your first project to start tracking RFIs, schedule, and site operations."
          />
        ) : (
          <DataTable<Project>
            rowKey="id"
            columns={columns}
            dataSource={projects}
            pagination={bindMeta(meta)}
          />
        )}
      </FormLayout>

      <ProjectFormDrawer
        open={drawerOpen}
        project={editingProject ?? undefined}
        onClose={() => {
          setDrawerOpen(false);
          setEditingProject(null);
        }}
        onSaved={() => {
          void projectsQuery.refetch();
        }}
      />
    </>
  );
}
