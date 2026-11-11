'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Button, Input, InputNumber, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { EvaluationTemplate } from '@/lib/api/evaluation.types';
import { useCreateEvaluationTemplate } from '@/lib/query/evaluation';

interface CriteriaRow {
  name: string;
  nameZh: string;
  description: string;
  weight: number;
}

interface SectionRow {
  name: string;
  nameZh: string;
  weight: number;
  criteria: CriteriaRow[];
}

export interface NewTemplateFormHandle {
  submit: () => Promise<void>;
}

interface NewTemplateFormProps {
  onSuccess: (template: EvaluationTemplate) => void;
  onCancel?: () => void;
  initialSections?: SectionRow[];
  /** When true, omit bottom Cancel / Create buttons (drawer footer owns them). */
  hideFooter?: boolean;
  onSubmittingChange?: (submitting: boolean) => void;
}

const DEFAULT_SECTIONS: SectionRow[] = [
  {
    name: 'Work Performance',
    nameZh: '工作绩效',
    weight: 40,
    criteria: [
      {
        name: 'Quality of Work Output',
        nameZh: '工作质量',
        description: '',
        weight: 25,
      },
      {
        name: 'Meeting Deadlines',
        nameZh: '按时完成任务',
        description: '',
        weight: 25,
      },
      {
        name: 'Technical Accuracy',
        nameZh: '技术准确性',
        description: '',
        weight: 25,
      },
      {
        name: 'Problem Solving',
        nameZh: '问题解决能力',
        description: '',
        weight: 25,
      },
    ],
  },
  {
    name: 'Attitude & Discipline',
    nameZh: '态度与纪律',
    weight: 30,
    criteria: [
      {
        name: 'Attendance & Punctuality',
        nameZh: '出勤与准时',
        description: '',
        weight: 25,
      },
      {
        name: 'Following Instructions',
        nameZh: '执行指令',
        description: '',
        weight: 25,
      },
      {
        name: 'Teamwork & Cooperation',
        nameZh: '团队合作',
        description: '',
        weight: 25,
      },
      {
        name: 'Communication',
        nameZh: '沟通能力',
        description: '',
        weight: 25,
      },
    ],
  },
  {
    name: 'Professional Development',
    nameZh: '专业发展',
    weight: 20,
    criteria: [
      {
        name: 'Learning & Skill Improvement',
        nameZh: '学习与技能提升',
        description: '',
        weight: 34,
      },
      {
        name: 'Initiative & Innovation',
        nameZh: '主动性与创新',
        description: '',
        weight: 33,
      },
      {
        name: 'Knowledge Sharing',
        nameZh: '知识分享',
        description: '',
        weight: 33,
      },
    ],
  },
  {
    name: 'Safety & Compliance',
    nameZh: '安全与合规',
    weight: 10,
    criteria: [
      {
        name: 'Following Safety Rules',
        nameZh: '遵守安全规定',
        description: '',
        weight: 50,
      },
      {
        name: 'Compliance with Company Policies',
        nameZh: '遵守公司政策',
        description: '',
        weight: 50,
      },
    ],
  },
];

const NewTemplateForm = forwardRef<NewTemplateFormHandle, NewTemplateFormProps>(
  function NewTemplateForm(
    {
      onSuccess,
      onCancel,
      initialSections,
      hideFooter = false,
      onSubmittingChange,
    },
    ref,
  ): React.ReactNode {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [sections, setSections] = useState<SectionRow[]>(
      initialSections ?? DEFAULT_SECTIONS,
    );
    const [submitting, setSubmitting] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    const createTemplate = useCreateEvaluationTemplate();

    function setSubmittingState(next: boolean): void {
      setSubmitting(next);
      onSubmittingChange?.(next);
    }

    function addSection(): void {
      setSections((prev) => [
        ...prev,
        { name: '', nameZh: '', weight: 0, criteria: [] },
      ]);
    }

    function removeSection(index: number): void {
      setSections((prev) => prev.filter((_, i) => i !== index));
    }

    function updateSection(
      index: number,
      field: keyof SectionRow,
      value: SectionRow[keyof SectionRow],
    ): void {
      setSections((prev) =>
        prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
      );
    }

    function addCriteria(sectionIndex: number): void {
      setSections((prev) =>
        prev.map((s, i) =>
          i === sectionIndex
            ? {
                ...s,
                criteria: [
                  ...s.criteria,
                  { name: '', nameZh: '', description: '', weight: 0 },
                ],
              }
            : s,
        ),
      );
    }

    function removeCriteria(
      sectionIndex: number,
      criteriaIndex: number,
    ): void {
      setSections((prev) =>
        prev.map((s, i) =>
          i === sectionIndex
            ? {
                ...s,
                criteria: s.criteria.filter((_, ci) => ci !== criteriaIndex),
              }
            : s,
        ),
      );
    }

    function updateCriteria(
      sectionIndex: number,
      criteriaIndex: number,
      field: keyof CriteriaRow,
      value: CriteriaRow[keyof CriteriaRow],
    ): void {
      setSections((prev) =>
        prev.map((s, i) =>
          i === sectionIndex
            ? {
                ...s,
                criteria: s.criteria.map((c, ci) =>
                  ci === criteriaIndex ? { ...c, [field]: value } : c,
                ),
              }
            : s,
        ),
      );
    }

    const sectionWeightTotal = sections.reduce(
      (sum, s) => sum + (s.weight || 0),
      0,
    );
    const sectionWeightValid = Math.abs(sectionWeightTotal - 100) < 0.01;
    const canSubmit = sectionWeightValid && Boolean(name.trim());

    async function handleSubmit(): Promise<void> {
      if (!name.trim()) {
        void messageApi.warning('Please enter a template name');
        return;
      }
      if (!sectionWeightValid) {
        void messageApi.warning(
          `Section weights must sum to 100. Current sum: ${sectionWeightTotal}`,
        );
        return;
      }

      setSubmittingState(true);
      try {
        const template = await createTemplate.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          sections: sections.map((s, si) => ({
            name: s.name,
            nameZh: s.nameZh || undefined,
            weight: s.weight,
            sortOrder: si + 1,
            criteria: s.criteria.map((c, ci) => ({
              name: c.name,
              nameZh: c.nameZh || undefined,
              description: c.description || undefined,
              weight: c.weight,
              sortOrder: ci + 1,
            })),
          })),
        });
        onSuccess(template);
      } catch {
        void messageApi.error('Failed to create template');
      } finally {
        setSubmittingState(false);
      }
    }

    const submitRef = useRef(handleSubmit);
    useEffect(() => {
      submitRef.current = handleSubmit;
    });

    useImperativeHandle(ref, () => ({
      submit: () => submitRef.current(),
    }));

    return (
      <div className="erp-evaluation-template-form">
        {contextHolder}
        <div className="erp-evaluation-template-form-stack">
          <div className="erp-evaluation-template-form-field">
            <label htmlFor="eval-template-name">Template Name *</label>
            <Input
              id="eval-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CCECC Ethiopia Standard Evaluation Form v2"
            />
          </div>
          <div className="erp-evaluation-template-form-field">
            <label htmlFor="eval-template-description">Description</label>
            <Input.TextArea
              id="eval-template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
            />
          </div>

          <div className="erp-evaluation-template-form-sections-head">
            <h4>Sections</h4>
            <span
              className={
                sectionWeightValid
                  ? 'erp-evaluation-template-form-weight erp-evaluation-template-form-weight--ok'
                  : 'erp-evaluation-template-form-weight erp-evaluation-template-form-weight--bad'
              }
            >
              Total weight: {sectionWeightTotal}%{' '}
              {sectionWeightValid ? '✓' : '(must be 100%)'}
            </span>
          </div>

          {sections.map((section, si) => (
            <div key={si} className="erp-evaluation-template-form-section">
              <div className="erp-evaluation-template-form-section-row">
                <Input
                  value={section.name}
                  onChange={(e) => updateSection(si, 'name', e.target.value)}
                  placeholder="Section name (EN)"
                  className="min-w-0 flex-[2]"
                />
                <Input
                  value={section.nameZh}
                  onChange={(e) => updateSection(si, 'nameZh', e.target.value)}
                  placeholder="名称 (ZH)"
                  className="min-w-0 flex-1"
                />
                <InputNumber
                  value={section.weight}
                  onChange={(val) => updateSection(si, 'weight', val ?? 0)}
                  min={0}
                  max={100}
                  formatter={(val) => `${val}%`}
                  parser={(val) => Number(val?.replace('%', '') ?? 0)}
                  className="w-[80px]"
                />
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => removeSection(si)}
                  aria-label="Remove section"
                />
              </div>

              <div className="erp-evaluation-template-form-criteria">
                {section.criteria.map((criterion, ci) => (
                  <div
                    key={ci}
                    className="erp-evaluation-template-form-criteria-row"
                  >
                    <Input
                      value={criterion.name}
                      onChange={(e) =>
                        updateCriteria(si, ci, 'name', e.target.value)
                      }
                      placeholder="Criterion name (EN)"
                      className="min-w-0 flex-[2]"
                      size="small"
                    />
                    <Input
                      value={criterion.nameZh}
                      onChange={(e) =>
                        updateCriteria(si, ci, 'nameZh', e.target.value)
                      }
                      placeholder="名称 (ZH)"
                      className="min-w-0 flex-1"
                      size="small"
                    />
                    <Input
                      value={criterion.description}
                      onChange={(e) =>
                        updateCriteria(si, ci, 'description', e.target.value)
                      }
                      placeholder="Description"
                      className="min-w-0 flex-[2]"
                      size="small"
                    />
                    <InputNumber
                      value={criterion.weight}
                      onChange={(val) =>
                        updateCriteria(si, ci, 'weight', val ?? 0)
                      }
                      min={0}
                      max={100}
                      formatter={(val) => `${val}%`}
                      parser={(val) => Number(val?.replace('%', '') ?? 0)}
                      className="w-[70px]"
                      size="small"
                    />
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeCriteria(si, ci)}
                      aria-label="Remove criterion"
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => addCriteria(si)}
                  className="self-start"
                >
                  Add Criterion
                </Button>
              </div>
            </div>
          ))}

          <Button type="dashed" icon={<PlusOutlined />} onClick={addSection}>
            Add Section
          </Button>

          {!hideFooter ? (
            <div className="erp-evaluation-template-form-actions">
              {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
              <Button
                type="primary"
                onClick={() => void handleSubmit()}
                loading={submitting}
                disabled={!canSubmit}
              >
                Create Template
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

export default NewTemplateForm;
