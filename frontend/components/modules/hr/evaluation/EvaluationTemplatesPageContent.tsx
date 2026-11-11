'use client';

import './evaluation-v2.css';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Drawer,
  Dropdown,
  Grid,
  Input,
  Spin,
  Tooltip,
  message,
  type MenuProps,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CopyOutlined,
  EditOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import type { EvaluationTemplate } from '@/lib/api/evaluation.types';
import {
  useCreateEvaluationTemplate,
  useEvaluationTemplates,
} from '@/lib/query/evaluation';
import { detailDrawerStyles } from '@/lib/theme/layout';
import EvaluationStat from './EvaluationStat';
import NewTemplateForm, {
  type NewTemplateFormHandle,
} from './NewTemplateForm';

type TemplateFilter = 'all' | 'active' | 'inactive';

export default function EvaluationTemplatesPageContent(): React.ReactNode {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const [newOpen, setNewOpen] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TemplateFilter>('all');
  const [search, setSearch] = useState('');
  const [messageApi, contextHolder] = message.useMessage();
  const newTemplateFormRef = useRef<NewTemplateFormHandle>(null);

  const templatesQuery = useEvaluationTemplates();
  const createTemplate = useCreateEvaluationTemplate();
  const templates = templatesQuery.data ?? [];

  const stats = useMemo(() => {
    const active = templates.filter((t) => t.isActive).length;
    const criteria = templates.reduce(
      (sum, t) => sum + t.sections.reduce((s, sec) => s + sec.criteria.length, 0),
      0,
    );
    return {
      total: templates.length,
      active,
      inactive: templates.length - active,
      sections: templates.reduce((sum, t) => sum + t.sections.length, 0),
      criteria,
    };
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (statusFilter === 'active' && !template.isActive) {
        return false;
      }
      if (statusFilter === 'inactive' && template.isActive) {
        return false;
      }
      if (!q) {
        return true;
      }
      const name = template.name.toLowerCase();
      const description = (template.description ?? '').toLowerCase();
      return name.includes(q) || description.includes(q);
    });
  }, [templates, statusFilter, search]);

  async function handleClone(template: EvaluationTemplate): Promise<void> {
    try {
      const newTemplate = await createTemplate.mutateAsync({
        name: `${template.name} (v${template.version + 1})`,
        description: template.description ?? undefined,
        sections: template.sections.map((section) => ({
          name: section.name,
          nameZh: section.nameZh ?? undefined,
          description: section.description ?? undefined,
          weight: Number(section.weight),
          sortOrder: section.sortOrder,
          criteria: section.criteria.map((c) => ({
            name: c.name,
            nameZh: c.nameZh ?? undefined,
            description: c.description ?? undefined,
            weight: Number(c.weight),
            sortOrder: c.sortOrder,
          })),
        })),
      });
      void messageApi.success('New template version created');
      router.push(`/hr/evaluations/templates/${newTemplate.id}`);
    } catch {
      void messageApi.error('Failed to create new version');
    }
  }

  function buildActionMenu(row: EvaluationTemplate): MenuProps['items'] {
    return [
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: 'Edit',
        onClick: () => router.push(`/hr/evaluations/templates/${row.id}`),
      },
      {
        key: 'clone',
        icon: <CopyOutlined />,
        label: 'New Version',
        onClick: () => void handleClone(row),
      },
    ];
  }

  const columns: ColumnsType<EvaluationTemplate> = [
    {
      title: 'Name',
      key: 'name',
      render: (_value, row) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="erp-users-name m-0">{row.name}</p>
            {row.isActive ? (
              <StatusBadge label="Active" variant="success" />
            ) : (
              <StatusBadge label="Inactive" variant="default" />
            )}
          </div>
          {row.description ? (
            <p className="erp-users-email m-0 mt-0.5 truncate">
              {row.description}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Version',
      key: 'version',
      width: 100,
      render: (_value, row) => (
        <span className="erp-users-id-chip">v{row.version}</span>
      ),
    },
    {
      title: 'Structure',
      key: 'sections',
      responsive: ['md'],
      render: (_value, row) => (
        <span className="erp-users-cell-sub">
          {row.sections.length} sections ·{' '}
          {row.sections.reduce((sum, s) => sum + s.criteria.length, 0)} criteria
        </span>
      ),
    },
    {
      title: 'Created',
      key: 'createdAt',
      width: 120,
      responsive: ['lg'],
      render: (_value, row) => (
        <span className="erp-users-cell-sub">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 52,
      align: 'right',
      render: (_value, row) => (
        <div
          className="erp-table-row-actions flex items-center justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Dropdown
            menu={{ items: buildActionMenu(row) }}
            trigger={['click']}
            rootClassName="erp-row-actions-menu"
          >
            <Button
              size="small"
              type="text"
              icon={<MoreOutlined />}
              aria-label="Actions"
              loading={createTemplate.isPending}
            />
          </Dropdown>
        </div>
      ),
    },
  ];

  const hasFilters = statusFilter !== 'all' || Boolean(search.trim());

  if (templatesQuery.isLoading && !templatesQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-v2">
        <div className="erp-evaluation-loading">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-v2">
      {contextHolder}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label="Templates"
          value={stats.total}
          accent="slate"
          icon={<FileTextOutlined />}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <EvaluationStat
          label="Active"
          value={stats.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusFilter === 'active'}
          onClick={() => setStatusFilter('active')}
        />
        <EvaluationStat
          label="Inactive"
          value={stats.inactive}
          accent="amber"
          icon={<StopOutlined />}
          active={statusFilter === 'inactive'}
          onClick={() => setStatusFilter('inactive')}
        />
        <EvaluationStat
          label="Criteria"
          value={stats.criteria}
          accent="teal"
          icon={<CheckCircleOutlined />}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">Evaluation Templates</h3>
            <span className="erp-users-count-pill">
              {filtered.length.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title="Refresh">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={
                  templatesQuery.isFetching && !templatesQuery.isLoading
                }
                onClick={() => void templatesQuery.refetch()}
                aria-label="Refresh"
              />
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setNewOpen(true)}
            >
              New Template
            </Button>
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder="Search by name or description"
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search by name or description"
          />
          {hasFilters ? (
            <Button
              type="link"
              className="!px-1"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<EvaluationTemplate>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            loading={templatesQuery.isLoading}
            pagination={false}
            size={isCompact ? 'small' : 'middle'}
            className="erp-pro-table erp-users-table"
            scroll={{ x: isCompact ? 560 : 720 }}
            onRow={(row) => ({
              onClick: () =>
                router.push(`/hr/evaluations/templates/${row.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FileTextOutlined />}
                  title={
                    hasFilters
                      ? 'No matching templates'
                      : 'No evaluation templates'
                  }
                  description={
                    hasFilters
                      ? 'Try a different search or clear the status filter.'
                      : 'Create a template to define sections and scoring criteria.'
                  }
                  action={
                    hasFilters
                      ? {
                          label: 'Clear filters',
                          onClick: () => {
                            setSearch('');
                            setStatusFilter('all');
                          },
                        }
                      : {
                          label: 'New Template',
                          onClick: () => setNewOpen(true),
                        }
                  }
                />
              ),
            }}
          />
        </div>
      </div>

      <Drawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        destroyOnHidden
        size={720}
        placement="right"
        className="erp-responsive-drawer erp-evaluation-drawer"
        rootClassName="erp-evaluation-drawer"
        styles={detailDrawerStyles}
        title={
          <div className="min-w-0 py-1">
            <div className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
              Create New Evaluation Template
            </div>
            <div className="mt-0.5 text-[12px] font-normal text-[var(--color-text-secondary)]">
              Define sections and scoring criteria. Section weights must total
              100%.
            </div>
          </div>
        }
        footer={
          <div className="erp-evaluation-drawer-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={() => setNewOpen(false)}
              disabled={creatingTemplate}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              loading={creatingTemplate}
              onClick={() => void newTemplateFormRef.current?.submit()}
            >
              Create Template
            </Button>
          </div>
        }
      >
        <NewTemplateForm
          ref={newTemplateFormRef}
          hideFooter
          onSubmittingChange={setCreatingTemplate}
          onSuccess={(template) => {
            setNewOpen(false);
            router.push(`/hr/evaluations/templates/${template.id}`);
          }}
          onCancel={() => setNewOpen(false)}
        />
      </Drawer>
    </div>
  );
}
