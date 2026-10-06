'use client';

import './evaluation-v2.css';

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
import { ArrowLeft, FileText, Layers, ListChecks } from 'lucide-react';
import Link from 'next/link';
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
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page erp-evaluation-v2">
        <div className="erp-evaluation-loading">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  const template = templateQuery.data;
  if (!template) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page erp-evaluation-v2">
        <div className="erp-pro-card p-6">
          <p className="erp-users-email m-0">Template not found.</p>
          <Link
            href="/hr/evaluations/templates"
            className="erp-evaluation-back mt-3"
          >
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Back to templates
          </Link>
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
  const activeCriteria = template.sections.reduce(
    (sum, s) => sum + s.criteria.filter((c) => c.isActive).length,
    0,
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page erp-evaluation-template-detail erp-evaluation-v2">
      {contextHolder}

      <section className="erp-evaluation-detail-hero">
        <div className="erp-evaluation-hero-top">
          <div className="min-w-0">
            <Link
              href="/hr/evaluations/templates"
              className="erp-evaluation-back"
            >
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              All templates
            </Link>
            <div className="erp-evaluation-hero-title-row">
              <h2 className="erp-evaluation-hero-title">{template.name}</h2>
              <span className="erp-users-id-chip">v{template.version}</span>
              {template.isActive ? (
                <StatusBadge label="Active" variant="success" />
              ) : (
                <StatusBadge label="Inactive" variant="default" />
              )}
            </div>
            {template.description ? (
              <p className="erp-users-email m-0 mt-1">{template.description}</p>
            ) : null}
            <p className="erp-evaluation-detail-meta">
              <span>
                <FileText size={14} strokeWidth={2} aria-hidden />
                Created{' '}
                <strong>
                  {new Date(template.createdAt).toLocaleDateString()}
                </strong>
              </span>
              <span>
                <Layers size={14} strokeWidth={2} aria-hidden />
                Sections: <strong>{template.sections.length}</strong>
              </span>
              <span>
                <ListChecks size={14} strokeWidth={2} aria-hidden />
                Criteria: <strong>{criteriaCount}</strong>
              </span>
            </p>
          </div>
        </div>

        <div className="erp-evaluation-fact-row">
          <div className="erp-evaluation-fact">
            <p className="erp-evaluation-fact-label">Sections</p>
            <p className="erp-evaluation-fact-value">
              {template.sections.length}
            </p>
          </div>
          <div className="erp-evaluation-fact">
            <p className="erp-evaluation-fact-label">Criteria</p>
            <p className="erp-evaluation-fact-value">{criteriaCount}</p>
          </div>
          <div className="erp-evaluation-fact">
            <p className="erp-evaluation-fact-label">Active criteria</p>
            <p className="erp-evaluation-fact-value">{activeCriteria}</p>
          </div>
        </div>
      </section>

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
                <div className="erp-assessment-add rounded-xl border border-dashed border-[#e8ebef] bg-[#f7f8fa] p-3">
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
