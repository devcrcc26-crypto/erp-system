'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Table, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CopyOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { EvaluationTemplate } from '@/lib/api/evaluation.types';
import {
  useCreateEvaluationTemplate,
  useEvaluationTemplates,
} from '@/lib/query/evaluation';
import EvaluationStat from './EvaluationStat';
import NewTemplateForm from './NewTemplateForm';

export default function EvaluationTemplatesPageContent(): React.ReactNode {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

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
      sections: templates.reduce((sum, t) => sum + t.sections.length, 0),
      criteria,
    };
  }, [templates]);

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

  const columns: ColumnsType<EvaluationTemplate> = [
    {
      title: 'Name',
      key: 'name',
      render: (_value, row) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="erp-users-cell-strong m-0">{row.name}</p>
            {row.isActive ? (
              <StatusBadge label="Active" variant="success" />
            ) : null}
          </div>
          {row.description ? (
            <p className="erp-users-email m-0 mt-0.5">{row.description}</p>
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
      render: (_value, row) => (
        <span className="erp-users-cell-sub">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_value, row) => (
        <div
          className="flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Edit template">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() =>
                router.push(`/hr/evaluations/templates/${row.id}`)
              }
            >
              Edit
            </Button>
          </Tooltip>
          <Tooltip title="Create new version based on this template">
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => void handleClone(row)}
              loading={createTemplate.isPending}
            >
              New Version
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page">
      {contextHolder}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label="Templates"
          value={stats.total}
          accent="slate"
          icon={<FileTextOutlined />}
        />
        <EvaluationStat
          label="Active"
          value={stats.active}
          accent="green"
          icon={<CheckCircleOutlined />}
        />
        <EvaluationStat
          label="Sections"
          value={stats.sections}
          accent="blue"
          icon={<FileTextOutlined />}
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
              {stats.total.toLocaleString()}
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

        <div className="erp-pro-table-card-body">
          <Table
            dataSource={templates}
            columns={columns}
            rowKey="id"
            loading={templatesQuery.isLoading}
            pagination={false}
            className="erp-pro-table erp-users-table"
            onRow={(row) => ({
              onClick: () =>
                router.push(`/hr/evaluations/templates/${row.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        </div>
      </div>

      <Modal
        title="Create New Evaluation Template"
        open={newOpen}
        onCancel={() => setNewOpen(false)}
        footer={null}
        width={700}
      >
        <NewTemplateForm
          onSuccess={(template) => {
            setNewOpen(false);
            router.push(`/hr/evaluations/templates/${template.id}`);
          }}
          onCancel={() => setNewOpen(false)}
        />
      </Modal>
    </div>
  );
}
