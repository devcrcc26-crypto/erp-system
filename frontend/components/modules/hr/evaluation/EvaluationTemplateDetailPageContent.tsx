'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  InputNumber,
  Spin,
  Switch,
  Tooltip,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
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
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page flex justify-center p-12">
        <Spin size="large" />
      </div>
    );
  }

  const template = templateQuery.data;
  if (!template) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page">
        <div className="erp-pro-card p-6">
          <p className="m-0 text-[#6B7280]">Template not found.</p>
        </div>
      </div>
    );
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

  const criteriaCount = template.sections.reduce(
    (sum, s) => sum + s.criteria.length,
    0,
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page erp-evaluation-template-detail">
      {contextHolder}

      <div className="erp-evaluation-detail-hero">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[20px] font-semibold text-[#111827]">
              {template.name}
            </h2>
            <span className="erp-users-id-chip">v{template.version}</span>
            {template.isActive ? (
              <StatusBadge label="Active" variant="success" />
            ) : (
              <StatusBadge label="Inactive" variant="default" />
            )}
          </div>
          {template.description ? (
            <p className="erp-users-email m-0 mb-1">{template.description}</p>
          ) : null}
          <div className="erp-evaluation-detail-meta">
            <span>
              Created{' '}
              <strong>
                {new Date(template.createdAt).toLocaleDateString()}
              </strong>
            </span>
            <span>
              Sections: <strong>{template.sections.length}</strong>
            </span>
            <span>
              Criteria: <strong>{criteriaCount}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="erp-assessment-sections">
        {[...template.sections]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((section) => (
            <div key={section.id} className="erp-evaluation-section-card">
              <div className="erp-evaluation-section-header">
                <div className="min-w-0">
                  <span className="erp-users-cell-strong">{section.name}</span>
                  {section.nameZh ? (
                    <span className="erp-users-email ml-2">
                      {section.nameZh}
                    </span>
                  ) : null}
                </div>
                <StatusBadge
                  label={`${Number(section.weight)}% weight`}
                  variant="info"
                />
              </div>

              <div className="erp-assessment-criteria-list">
                {[...section.criteria]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((criterion) => (
                    <div
                      key={criterion.id}
                      className={`erp-assessment-criteria-item${
                        criterion.isActive
                          ? ''
                          : ' erp-evaluation-criteria-row--inactive'
                      }`}
                    >
                      <div className="erp-assessment-criteria-text">
                        <p className="erp-assessment-criteria-name">
                          {criterion.name}
                          {criterion.nameZh ? (
                            <span className="erp-users-email ml-1.5 text-[12px]">
                              {criterion.nameZh}
                            </span>
                          ) : null}
                        </p>
                        {criterion.description ? (
                          <p className="erp-assessment-criteria-desc">
                            {criterion.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="erp-users-id-chip">
                          {Number(criterion.weight)}%
                        </span>
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
                              void handleToggleCriteria(criterion.id, checked)
                            }
                          />
                        </Tooltip>
                      </div>
                    </div>
                  ))}
              </div>

              {addingToSection === section.id ? (
                <div className="erp-assessment-add rounded-lg border border-dashed border-[#e8ebef] p-3">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Input
                      placeholder="Criterion name (EN) *"
                      value={newCriteriaName}
                      onChange={(e) => setNewCriteriaName(e.target.value)}
                      size="small"
                      className="min-w-[160px] flex-[2]"
                    />
                    <Input
                      placeholder="名称 (ZH)"
                      value={newCriteriaZh}
                      onChange={(e) => setNewCriteriaZh(e.target.value)}
                      size="small"
                      className="min-w-[100px] flex-1"
                    />
                    <InputNumber
                      placeholder="Weight %"
                      value={newCriteriaWeight}
                      onChange={(val) => setNewCriteriaWeight(val ?? 0)}
                      min={0}
                      max={100}
                      size="small"
                      className="w-[90px]"
                    />
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={newCriteriaDesc}
                    onChange={(e) => setNewCriteriaDesc(e.target.value)}
                    size="small"
                    className="mb-2"
                  />
                  <div className="flex gap-2">
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
                  className="erp-assessment-add self-start"
                >
                  Add Criterion
                </Button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
