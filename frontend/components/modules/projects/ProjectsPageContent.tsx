// UI polish pass - styles only, no logic changes

'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Input,
  Select,
  Space,
} from 'antd';
import { EditOutlined, FileExcelOutlined, FilePdfOutlined, PlusOutlined } from '@ant-design/icons';
import { Network } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import PlaceholderPage from '@/components/PlaceholderPage';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { Project, ProjectStatus } from '@/lib/api/project-management.types';
import { PROJECT_STATUS_WORKFLOW } from '@/lib/api/workflow';
import { fetchAllProjects, useProjects } from '@/lib/query/projects';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAuthStore } from '@/stores/auth.store';
import { useAppMessage } from '@/hooks/use-app-message';
import { tokens } from '@/lib/theme/tokens';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectStatus,
  formatProjectType,
  projectStatusVariant,
} from '@/lib/utils/project-display';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import { formatUserName } from '@/lib/utils/user-display';
import { exportProjectsPdf } from '@/lib/utils/projects-export-pdf';
import { downloadProjectListExcel } from '@/lib/query/project-exports';
import ProjectFormDrawer from '@/components/modules/projects/ProjectFormDrawer';

export default function ProjectsPageContent(): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const messageApi = useAppMessage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const authUser = useAuthStore((state) => state.user);
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

  const handleExportPdf = useCallback(async (): Promise<void> => {
    const trimmedSearch = search.trim();
    setExportingPdf(true);

    try {
      const allProjects = await fetchAllProjects({
        search: trimmedSearch || undefined,
        status: statusFilter,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      const generatedAt = new Date().toISOString();
      const preparedBy = authUser ? formatUserName(authUser) : 'User';

      exportProjectsPdf({
        companyName: authUser?.companyName ?? 'Company',
        generatedAt,
        preparedBy,
        projects: allProjects,
        filters: {
          search: trimmedSearch || undefined,
          status: statusFilter,
        },
      });
      messageApi.success('Project export generated.');
    } catch {
      messageApi.error('Unable to export projects. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  }, [authUser, messageApi, search, statusFilter]);

  const handleExportExcel = useCallback(async (): Promise<void> => {
    setExportingExcel(true);
    try {
      await downloadProjectListExcel({
        search: search.trim() || undefined,
        status: statusFilter,
      });
      messageApi.success('Project list export downloaded.');
    } catch {
      messageApi.error('Unable to export project list. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  }, [messageApi, search, statusFilter]);

  const columns: ColumnsType<Project> = useMemo(
    () => [
      {
        title: 'Code',
        dataIndex: 'projectCode',
        key: 'projectCode',
        render: (code: string, record) => (
          <Link
            href={`/projects/${record.id}`}
            className="font-[family-name:var(--font-mono)] text-[12px] font-normal no-underline hover:underline"
            style={{ color: tokens.colorTeal600 }}
          >
            {code}
          </Link>
        ),
      },
      {
        title: 'Name',
        key: 'name',
        ellipsis: true,
        render: (_value, record) => formatLocalizedName(record),
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
        render: (value: string | null) => (
          <span
            className="text-[13px]"
            style={{ color: tokens.colorTextSecondary }}
          >
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: 'Budget',
        key: 'budget',
        align: 'right',
        render: (_value, record) => (
          <span className="text-[13px] tabular-nums">
            {formatProjectBudget(record.budget, record.currency)}
          </span>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 48,
        render: (_value, record) => (
          <Button
            type="text"
            icon={<EditOutlined style={{ fontSize: 16 }} />}
            aria-label="Edit project"
            className="!flex !h-8 !w-8 !items-center !justify-center !rounded-lg hover:!bg-[var(--color-surface-secondary)]"
            style={{ color: tokens.colorTextSecondary }}
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
    return <PageLoadingSkeleton />;
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
    return <PageLoadingSkeleton />;
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
          description="Project management APIs are not available yet. The frontend is ready -connect the backend module to enable this page."
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
          <Space wrap>
            <Button
              icon={<FileExcelOutlined />}
              loading={exportingExcel}
              onClick={() => void handleExportExcel()}
            >
              Export Excel
            </Button>
            <Button
              icon={<FilePdfOutlined />}
              loading={exportingPdf}
              onClick={() => void handleExportPdf()}
            >
              Export PDF
            </Button>
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
          </Space>
        }
      >
        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search by code or name"
            className={layout.filterControlLg}
            committedValue={search}
            onCommit={(value) => {
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
