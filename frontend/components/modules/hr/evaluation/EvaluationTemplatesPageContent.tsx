'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { EvaluationTemplate } from '@/lib/api/evaluation.types';
import {
  useCreateEvaluationTemplate,
  useEvaluationTemplates,
} from '@/lib/query/evaluation';
import NewTemplateForm from './NewTemplateForm';

export default function EvaluationTemplatesPageContent(): React.ReactNode {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const templatesQuery = useEvaluationTemplates();
  const createTemplate = useCreateEvaluationTemplate();

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
        <div>
          <div style={{ fontWeight: 500 }}>
            {row.name}
            {row.isActive ? (
              <Tag color="success" style={{ marginLeft: 8 }}>
                Active
              </Tag>
            ) : null}
          </div>
          {row.description ? (
            <div
              style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}
            >
              {row.description}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Version',
      key: 'version',
      render: (_value, row) => <Tag>v{row.version}</Tag>,
    },
    {
      title: 'Sections',
      key: 'sections',
      render: (_value, row) =>
        `${row.sections.length} sections, ${row.sections.reduce(
          (sum, s) => sum + s.criteria.length,
          0,
        )} criteria`,
    },
    {
      title: 'Created',
      key: 'createdAt',
      render: (_value, row) =>
        new Date(row.createdAt).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_value, row) => (
        <div
          style={{ display: 'flex', gap: 8 }}
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
    <div className="erp-pro-list-page">
      {contextHolder}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Evaluation Templates</h2>
          <p
            style={{
              margin: 0,
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
            }}
          >
            Manage evaluation form templates. Create a new version to update
            the form — old evaluations keep their original template.
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setNewOpen(true)}
        >
          New Template
        </Button>
      </div>

      <Table
        dataSource={templatesQuery.data ?? []}
        columns={columns}
        rowKey="id"
        loading={templatesQuery.isLoading}
        pagination={false}
        onRow={(row) => ({
          onClick: () =>
            router.push(`/hr/evaluations/templates/${row.id}`),
          style: { cursor: 'pointer' },
        })}
      />

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
