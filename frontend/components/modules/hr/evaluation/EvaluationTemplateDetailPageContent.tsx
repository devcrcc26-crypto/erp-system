'use client';

import { useState } from 'react';
import { Button, Input, InputNumber, Spin, Switch, Tag, Tooltip, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  useAddEvaluationCriteria,
  useEvaluationTemplate,
  useUpdateEvaluationCriteria,
} from '@/lib/query/evaluation';

interface EvaluationTemplateDetailPageContentProps {
  templateId: string;
}

export default function EvaluationTemplateDetailPageContent({
  templateId,
}: EvaluationTemplateDetailPageContentProps): React.ReactNode {
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [newCriteriaName, setNewCriteriaName] = useState('');
  const [newCriteriaZh, setNewCriteriaZh] = useState('');
  const [newCriteriaDesc, setNewCriteriaDesc] = useState('');
  const [newCriteriaWeight, setNewCriteriaWeight] = useState(0);
  const [messageApi, contextHolder] = message.useMessage();

  const templateQuery = useEvaluationTemplate(templateId);
  const addCriteria = useAddEvaluationCriteria();
  const updateCriteria = useUpdateEvaluationCriteria();

  if (templateQuery.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const template = templateQuery.data;
  if (!template) {
    return null;
  }

  async function handleAddCriteria(sectionId: string): Promise<void> {
    if (!newCriteriaName.trim()) {
      void messageApi.warning('Please enter a criterion name');
      return;
    }
    try {
      const nextSortOrder =
        (template?.sections.find((s) => s.id === sectionId)?.criteria
          .length ?? 0) + 1;

      await addCriteria.mutateAsync({
        sectionId,
        name: newCriteriaName,
        nameZh: newCriteriaZh || undefined,
        description: newCriteriaDesc || undefined,
        weight: newCriteriaWeight,
        sortOrder: nextSortOrder,
      });
      await templateQuery.refetch();
      setAddingToSection(null);
      setNewCriteriaName('');
      setNewCriteriaZh('');
      setNewCriteriaDesc('');
      setNewCriteriaWeight(0);
      void messageApi.success('Criterion added');
    } catch {
      void messageApi.error('Failed to add criterion');
    }
  }

  async function handleToggleCriteria(
    criteriaId: string,
    isActive: boolean,
  ): Promise<void> {
    try {
      await updateCriteria.mutateAsync({ criteriaId, isActive });
      await templateQuery.refetch();
    } catch {
      void messageApi.error('Failed to update criterion');
    }
  }

  return (
    <div className="erp-pro-list-page">
      {contextHolder}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{template.name}</h2>
            <Tag>v{template.version}</Tag>
            {template.isActive ? <Tag color="success">Active</Tag> : null}
          </div>
          {template.description ? (
            <p
              style={{
                margin: '4px 0 0',
                color: 'var(--color-text-tertiary)',
                fontSize: 13,
              }}
            >
              {template.description}
            </p>
          ) : null}
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
            }}
          >
            Created {new Date(template.createdAt).toLocaleDateString()} ·{' '}
            {template.sections.length} sections ·{' '}
            {template.sections.reduce(
              (sum, s) => sum + s.criteria.length,
              0,
            )}{' '}
            criteria
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[...template.sections]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((section) => (
            <div
              key={section.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: 'var(--color-bg-secondary)',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{section.name}</span>
                  {section.nameZh ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {section.nameZh}
                    </span>
                  ) : null}
                </div>
                <Tag color="blue">{section.weight}% weight</Tag>
              </div>

              <div style={{ padding: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {[...section.criteria]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((criterion) => (
                      <div
                        key={criterion.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: criterion.isActive
                            ? 'var(--color-bg-tertiary)'
                            : 'var(--color-bg-disabled)',
                          borderRadius: 6,
                          opacity: criterion.isActive ? 1 : 0.6,
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>
                            {criterion.name}
                          </span>
                          {criterion.nameZh ? (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              {criterion.nameZh}
                            </span>
                          ) : null}
                          {criterion.description ? (
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--color-text-tertiary)',
                                marginTop: 2,
                              }}
                            >
                              {criterion.description}
                            </div>
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <Tag>{criterion.weight}%</Tag>
                          <Tooltip
                            title={
                              criterion.isActive
                                ? 'Deactivate criterion'
                                : 'Activate criterion'
                            }
                          >
                            <Switch
                              size="small"
                              checked={criterion.isActive}
                              onChange={(checked) =>
                                void handleToggleCriteria(
                                  criterion.id,
                                  checked,
                                )
                              }
                            />
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                </div>

                {addingToSection === section.id ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      border: '1px dashed var(--color-border)',
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Input
                        placeholder="Criterion name (EN) *"
                        value={newCriteriaName}
                        onChange={(e) => setNewCriteriaName(e.target.value)}
                        size="small"
                        style={{ flex: 2 }}
                      />
                      <Input
                        placeholder="名称 (ZH)"
                        value={newCriteriaZh}
                        onChange={(e) => setNewCriteriaZh(e.target.value)}
                        size="small"
                        style={{ flex: 1 }}
                      />
                      <InputNumber
                        placeholder="Weight %"
                        value={newCriteriaWeight}
                        onChange={(val) => setNewCriteriaWeight(val ?? 0)}
                        min={0}
                        max={100}
                        size="small"
                        style={{ width: 90 }}
                      />
                    </div>
                    <Input
                      placeholder="Description (optional)"
                      value={newCriteriaDesc}
                      onChange={(e) => setNewCriteriaDesc(e.target.value)}
                      size="small"
                      style={{ marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        type="primary"
                        size="small"
                        loading={addCriteria.isPending}
                        onClick={() => void handleAddCriteria(section.id)}
                      >
                        Add
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setAddingToSection(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => setAddingToSection(section.id)}
                    style={{ marginTop: 12 }}
                  >
                    Add Criterion
                  </Button>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
