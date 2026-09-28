'use client';

import { useState } from 'react';
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

interface NewTemplateFormProps {
  onSuccess: (template: EvaluationTemplate) => void;
  onCancel: () => void;
  initialSections?: SectionRow[];
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

export default function NewTemplateForm({
  onSuccess,
  onCancel,
  initialSections,
}: NewTemplateFormProps): React.ReactNode {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<SectionRow[]>(
    initialSections ?? DEFAULT_SECTIONS,
  );
  const [submitting, setSubmitting] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const createTemplate = useCreateEvaluationTemplate();

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

  function removeCriteria(sectionIndex: number, criteriaIndex: number): void {
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

    setSubmitting(true);
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
      setSubmitting(false);
    }
  }

  return (
    <div>
      {contextHolder}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label
            style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}
          >
            Template Name *
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CCECC Ethiopia Standard Evaluation Form v2"
          />
        </div>
        <div>
          <label
            style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}
          >
            Description
          </label>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional description"
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h4 style={{ margin: 0 }}>Sections</h4>
          <span
            style={{
              fontSize: 13,
              color: sectionWeightValid ? '#52c41a' : '#f5222d',
              fontWeight: 500,
            }}
          >
            Total weight: {sectionWeightTotal}%{' '}
            {sectionWeightValid ? '✓' : '(must be 100%)'}
          </span>
        </div>

        {sections.map((section, si) => (
          <div
            key={si}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 12,
                alignItems: 'flex-start',
              }}
            >
              <Input
                value={section.name}
                onChange={(e) => updateSection(si, 'name', e.target.value)}
                placeholder="Section name (EN)"
                style={{ flex: 2 }}
              />
              <Input
                value={section.nameZh}
                onChange={(e) => updateSection(si, 'nameZh', e.target.value)}
                placeholder="名称 (ZH)"
                style={{ flex: 1 }}
              />
              <InputNumber
                value={section.weight}
                onChange={(val) => updateSection(si, 'weight', val ?? 0)}
                min={0}
                max={100}
                formatter={(val) => `${val}%`}
                parser={(val) => Number(val?.replace('%', '') ?? 0)}
                style={{ width: 80 }}
              />
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removeSection(si)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                paddingLeft: 16,
              }}
            >
              {section.criteria.map((criterion, ci) => (
                <div
                  key={ci}
                  style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  <Input
                    value={criterion.name}
                    onChange={(e) =>
                      updateCriteria(si, ci, 'name', e.target.value)
                    }
                    placeholder="Criterion name (EN)"
                    style={{ flex: 2 }}
                    size="small"
                  />
                  <Input
                    value={criterion.nameZh}
                    onChange={(e) =>
                      updateCriteria(si, ci, 'nameZh', e.target.value)
                    }
                    placeholder="名称 (ZH)"
                    style={{ flex: 1 }}
                    size="small"
                  />
                  <Input
                    value={criterion.description}
                    onChange={(e) =>
                      updateCriteria(si, ci, 'description', e.target.value)
                    }
                    placeholder="Description"
                    style={{ flex: 2 }}
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
                    style={{ width: 70 }}
                    size="small"
                  />
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeCriteria(si, ci)}
                  />
                </div>
              ))}
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => addCriteria(si)}
                style={{ alignSelf: 'flex-start' }}
              >
                Add Criterion
              </Button>
            </div>
          </div>
        ))}

        <Button type="dashed" icon={<PlusOutlined />} onClick={addSection}>
          Add Section
        </Button>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            type="primary"
            onClick={() => void handleSubmit()}
            loading={submitting}
            disabled={!sectionWeightValid || !name.trim()}
          >
            Create Template
          </Button>
        </div>
      </div>
    </div>
  );
}
