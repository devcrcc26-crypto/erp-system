'use client';

import { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Switch } from 'antd';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  LeavePolicy,
  LeavePolicyLeaveType,
  LeavePolicyRuleInput,
} from '@/lib/api/leave-policy.types';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { previewEntitlement } from '@/lib/utils/leave-policy-preview';

export interface LeavePolicyFormValues {
  name: string;
  description?: string;
  governedBy?: string;
  isActive: boolean;
  annualBaseDays: number;
  annualIsProgressive: boolean;
  annualIncrementDays?: number;
  annualIncrementEveryYears?: number;
  annualMaxDaysCap?: number;
  annualMinimumServiceMonths: number;
  annualMaxCarryForwardDays?: number;
  maternityBaseDays: number;
  maternityMinimumServiceMonths: number;
  sickBaseDays: number;
  sickRequiresReceipt: boolean;
}

const PREVIEW_YEARS = 3;

const DETAILS_FIELDS = [
  'name',
  'description',
  'governedBy',
  'isActive',
] as const;

const RULES_FIELDS_BASE = [
  'annualBaseDays',
  'annualIsProgressive',
  'annualMinimumServiceMonths',
  'annualMaxCarryForwardDays',
  'annualMaxDaysCap',
  'maternityBaseDays',
  'maternityMinimumServiceMonths',
  'sickBaseDays',
  'sickRequiresReceipt',
] as const;

const PROGRESSIVE_FIELDS = [
  'annualIncrementDays',
  'annualIncrementEveryYears',
] as const;

function defaultValues(): LeavePolicyFormValues {
  return {
    name: '',
    description: undefined,
    governedBy: undefined,
    isActive: true,
    annualBaseDays: 16,
    annualIsProgressive: true,
    annualIncrementDays: 1,
    annualIncrementEveryYears: 2,
    annualMaxDaysCap: undefined,
    annualMinimumServiceMonths: 0,
    annualMaxCarryForwardDays: 8,
    maternityBaseDays: 90,
    maternityMinimumServiceMonths: 0,
    sickBaseDays: 30,
    sickRequiresReceipt: true,
  };
}

function valuesFromPolicy(policy: LeavePolicy): LeavePolicyFormValues {
  const byType = new Map(policy.rules.map((rule) => [rule.leaveType, rule]));
  const annual = byType.get('ANNUAL');
  const maternity = byType.get('MATERNITY');
  const sick = byType.get('SICK');

  return {
    name: policy.name,
    description: policy.description ?? undefined,
    governedBy: policy.governedBy ?? undefined,
    isActive: policy.isActive,
    annualBaseDays: annual?.baseDays ?? 16,
    annualIsProgressive: annual?.isProgressive ?? false,
    annualIncrementDays: annual?.incrementDays ?? undefined,
    annualIncrementEveryYears: annual?.incrementEveryYears ?? undefined,
    annualMaxDaysCap: annual?.maxDaysCap ?? undefined,
    annualMinimumServiceMonths: annual?.minimumServiceMonths ?? 0,
    annualMaxCarryForwardDays: annual?.maxCarryForwardDays ?? undefined,
    maternityBaseDays: maternity?.baseDays ?? 90,
    maternityMinimumServiceMonths: maternity?.minimumServiceMonths ?? 0,
    sickBaseDays: sick?.baseDays ?? 30,
    sickRequiresReceipt: sick?.requiresReceipt ?? true,
  };
}

/**
 * Maps form values to create/update API payload rules.
 */
export function buildLeavePolicyRules(
  values: LeavePolicyFormValues,
): LeavePolicyRuleInput[] {
  return [
    {
      leaveType: 'ANNUAL',
      baseDays: values.annualBaseDays,
      isProgressive: values.annualIsProgressive,
      incrementDays: values.annualIsProgressive
        ? values.annualIncrementDays
        : undefined,
      incrementEveryYears: values.annualIsProgressive
        ? values.annualIncrementEveryYears
        : undefined,
      minimumServiceMonths: values.annualMinimumServiceMonths,
      maxDaysCap: values.annualMaxDaysCap,
      maxCarryForwardDays: values.annualMaxCarryForwardDays,
      requiresReceipt: false,
    },
    {
      leaveType: 'MATERNITY',
      baseDays: values.maternityBaseDays,
      isProgressive: false,
      minimumServiceMonths: values.maternityMinimumServiceMonths,
      requiresReceipt: false,
    },
    {
      leaveType: 'SICK',
      baseDays: values.sickBaseDays,
      isProgressive: false,
      minimumServiceMonths: 0,
      requiresReceipt: values.sickRequiresReceipt,
    },
  ];
}

function ReviewItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactNode {
  return (
    <div
      className={`erp-leave-policy-review-field${
        wide ? ' erp-leave-policy-review-field--wide' : ''
      }`}
    >
      <p className="erp-leave-policy-review-label">{label}</p>
      <p className="erp-leave-policy-review-value">{value}</p>
    </div>
  );
}

interface LeavePolicyFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  policy?: LeavePolicy;
  isSubmitting?: boolean;
  submitLabel: string;
  onSubmit: (values: LeavePolicyFormValues) => void | Promise<void>;
}

/**
 * Leave policy create/edit - StepperForm (details → rules → review).
 */
export default function LeavePolicyForm({
  policy,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel,
  cancelLabel,
}: LeavePolicyFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<LeavePolicyFormValues>();
  const [snapshot, setSnapshot] = useState<LeavePolicyFormValues>(
    defaultValues(),
  );

  const annualIsProgressive = Form.useWatch('annualIsProgressive', form);
  const annualBaseDays = Form.useWatch('annualBaseDays', form);
  const annualIncrementDays = Form.useWatch('annualIncrementDays', form);
  const annualIncrementEveryYears = Form.useWatch(
    'annualIncrementEveryYears',
    form,
  );
  const annualMaxDaysCap = Form.useWatch('annualMaxDaysCap', form);
  const annualMinimumServiceMonths = Form.useWatch(
    'annualMinimumServiceMonths',
    form,
  );

  useEffect(() => {
    const next = policy ? valuesFromPolicy(policy) : defaultValues();
    form.setFieldsValue(next);
    setSnapshot(next);
  }, [form, policy]);

  const previewDays = useMemo(() => {
    const rule: LeavePolicyRuleInput = {
      leaveType: 'ANNUAL',
      baseDays: annualBaseDays ?? snapshot.annualBaseDays ?? 0,
      isProgressive: Boolean(
        annualIsProgressive ?? snapshot.annualIsProgressive,
      ),
      incrementDays: annualIncrementDays ?? snapshot.annualIncrementDays,
      incrementEveryYears:
        annualIncrementEveryYears ?? snapshot.annualIncrementEveryYears,
      minimumServiceMonths:
        annualMinimumServiceMonths ?? snapshot.annualMinimumServiceMonths ?? 0,
      maxDaysCap: annualMaxDaysCap ?? snapshot.annualMaxDaysCap,
    };
    return previewEntitlement(rule, PREVIEW_YEARS);
  }, [
    annualBaseDays,
    annualIsProgressive,
    annualIncrementDays,
    annualIncrementEveryYears,
    annualMaxDaysCap,
    annualMinimumServiceMonths,
    snapshot,
  ]);

  function ruleTitle(leaveType: LeavePolicyLeaveType): string {
    return formatLeaveType(leaveType, t);
  }

  function captureSnapshot(): LeavePolicyFormValues {
    const values = form.getFieldsValue(true) as LeavePolicyFormValues;
    setSnapshot(values);
    return values;
  }

  function resetForm(): void {
    const next = policy ? valuesFromPolicy(policy) : defaultValues();
    form.setFieldsValue(next);
    setSnapshot(next);
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields([...DETAILS_FIELDS]);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function validateRulesStep(): Promise<boolean> {
    try {
      const progressive = Boolean(form.getFieldValue('annualIsProgressive'));
      const fields = progressive
        ? [...RULES_FIELDS_BASE, ...PROGRESSIVE_FIELDS]
        : [...RULES_FIELDS_BASE];
      await form.validateFields(fields);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    const detailsOk = await validateDetailsStep();
    if (!detailsOk) {
      return;
    }
    const rulesOk = await validateRulesStep();
    if (!rulesOk) {
      return;
    }
    const values = captureSnapshot();
    await onSubmit(values);
  }

  const review = snapshot;

  const steps = useMemo(
    () => [
      {
        title: t('hr.leavePolicy.steps.details'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.leavePolicy.steps.details')}
            description={t('pages.hr.leavePolicy.detailsStepDescription')}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="name"
                label={t('hr.leavePolicy.name')}
                rules={[{ required: true, message: t('common.required') }]}
              >
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item
                name="governedBy"
                label={t('hr.leavePolicy.governedBy')}
              >
                <Input maxLength={500} />
              </Form.Item>
              <Form.Item
                name="description"
                label={t('hr.leavePolicy.description')}
                className="md:col-span-2"
              >
                <Input.TextArea rows={3} maxLength={2000} showCount />
              </Form.Item>
              <Form.Item
                name="isActive"
                label={t('hr.leavePolicy.isActive')}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('hr.leavePolicy.steps.leaveRules'),
        validate: () => validateRulesStep(),
        content: (
          <div className="flex flex-col gap-4">
            <FormLayout
              variant="pro"
              title={ruleTitle('ANNUAL')}
              description={t('pages.hr.leavePolicy.rulesStepDescription')}
            >
              <div className="erp-form-grid-2">
                <Form.Item
                  name="annualBaseDays"
                  label={t('hr.leavePolicy.baseDays')}
                  rules={[{ required: true, message: t('common.required') }]}
                >
                  <InputNumber className="w-full" min={0} step={0.5} />
                </Form.Item>
                <Form.Item
                  name="annualMinimumServiceMonths"
                  label={t('hr.leavePolicy.minimumServiceMonths')}
                >
                  <InputNumber className="w-full" min={0} step={1} />
                </Form.Item>
                <Form.Item
                  name="annualIsProgressive"
                  label={t('hr.leavePolicy.isProgressive')}
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
                <Form.Item
                  name="annualMaxCarryForwardDays"
                  label={t('hr.leavePolicy.maxCarryForwardDays')}
                >
                  <InputNumber className="w-full" min={0} step={0.5} />
                </Form.Item>
                {annualIsProgressive ? (
                  <>
                    <Form.Item
                      name="annualIncrementDays"
                      label={t('hr.leavePolicy.incrementDays')}
                      rules={[
                        { required: true, message: t('common.required') },
                      ]}
                    >
                      <InputNumber className="w-full" min={0} step={0.5} />
                    </Form.Item>
                    <Form.Item
                      name="annualIncrementEveryYears"
                      label={t('hr.leavePolicy.incrementEveryYears')}
                      rules={[
                        { required: true, message: t('common.required') },
                      ]}
                    >
                      <InputNumber className="w-full" min={1} step={1} />
                    </Form.Item>
                    <Form.Item
                      name="annualMaxDaysCap"
                      label={t('hr.leavePolicy.maxDaysCap')}
                      className="md:col-span-2"
                    >
                      <InputNumber className="w-full" min={0} step={0.5} />
                    </Form.Item>
                  </>
                ) : null}
              </div>
              <ErpNotice
                className="mt-3"
                tone="info"
                title={t('hr.leavePolicy.preview')}
                description={t('hr.leavePolicy.previewExample', {
                  years: PREVIEW_YEARS,
                  days: previewDays,
                  base: annualBaseDays ?? 0,
                })}
              />
            </FormLayout>

            <FormLayout variant="pro" dense title={ruleTitle('MATERNITY')}>
              <div className="erp-form-grid-2">
                <Form.Item
                  name="maternityBaseDays"
                  label={t('hr.leavePolicy.baseDays')}
                  rules={[{ required: true, message: t('common.required') }]}
                >
                  <InputNumber className="w-full" min={0} step={0.5} />
                </Form.Item>
                <Form.Item
                  name="maternityMinimumServiceMonths"
                  label={t('hr.leavePolicy.minimumServiceMonths')}
                >
                  <InputNumber className="w-full" min={0} step={1} />
                </Form.Item>
              </div>
            </FormLayout>

            <FormLayout variant="pro" dense title={ruleTitle('SICK')}>
              <div className="erp-form-grid-2">
                <Form.Item
                  name="sickBaseDays"
                  label={t('hr.leavePolicy.baseDays')}
                  rules={[{ required: true, message: t('common.required') }]}
                >
                  <InputNumber className="w-full" min={0} step={0.5} />
                </Form.Item>
                <Form.Item
                  name="sickRequiresReceipt"
                  label={t('hr.leavePolicy.requiresReceipt')}
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              </div>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.leavePolicy.steps.review'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.leavePolicy.steps.review')}
            description={t('pages.hr.leavePolicy.reviewStepDescription')}
          >
            <div className="erp-leave-policy-review-grid">
              <ReviewItem
                label={t('hr.leavePolicy.name')}
                value={review.name?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.leavePolicy.governedBy')}
                value={review.governedBy?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.leavePolicy.isActive')}
                value={
                  review.isActive ? t('common.active') : t('common.inactive')
                }
              />
              <ReviewItem
                label={t('hr.leavePolicy.description')}
                value={review.description?.trim() || '-'}
                wide
              />
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div>
                <p className="erp-leave-policy-form-hero-title mb-2 !text-sm">
                  {ruleTitle('ANNUAL')}
                </p>
                <div className="erp-leave-policy-review-grid">
                  <ReviewItem
                    label={t('hr.leavePolicy.baseDays')}
                    value={String(review.annualBaseDays ?? '-')}
                  />
                  <ReviewItem
                    label={t('hr.leavePolicy.minimumServiceMonths')}
                    value={String(review.annualMinimumServiceMonths ?? '-')}
                  />
                  <ReviewItem
                    label={t('hr.leavePolicy.isProgressive')}
                    value={
                      review.annualIsProgressive
                        ? t('common.yes')
                        : t('common.no')
                    }
                  />
                  <ReviewItem
                    label={t('hr.leavePolicy.maxCarryForwardDays')}
                    value={String(review.annualMaxCarryForwardDays ?? '-')}
                  />
                  {review.annualIsProgressive ? (
                    <>
                      <ReviewItem
                        label={t('hr.leavePolicy.incrementDays')}
                        value={String(review.annualIncrementDays ?? '-')}
                      />
                      <ReviewItem
                        label={t('hr.leavePolicy.incrementEveryYears')}
                        value={String(review.annualIncrementEveryYears ?? '-')}
                      />
                      <ReviewItem
                        label={t('hr.leavePolicy.maxDaysCap')}
                        value={String(review.annualMaxDaysCap ?? '-')}
                      />
                    </>
                  ) : null}
                </div>
                {review.annualIsProgressive ? (
                  <ErpNotice
                    className="mt-3"
                    tone="info"
                    title={t('hr.leavePolicy.preview')}
                    description={t('hr.leavePolicy.previewExample', {
                      years: PREVIEW_YEARS,
                      days: previewDays,
                      base: review.annualBaseDays ?? 0,
                    })}
                  />
                ) : null}
              </div>

              <div>
                <p className="erp-leave-policy-form-hero-title mb-2 !text-sm">
                  {ruleTitle('MATERNITY')}
                </p>
                <div className="erp-leave-policy-review-grid">
                  <ReviewItem
                    label={t('hr.leavePolicy.baseDays')}
                    value={String(review.maternityBaseDays ?? '-')}
                  />
                  <ReviewItem
                    label={t('hr.leavePolicy.minimumServiceMonths')}
                    value={String(review.maternityMinimumServiceMonths ?? '-')}
                  />
                </div>
              </div>

              <div>
                <p className="erp-leave-policy-form-hero-title mb-2 !text-sm">
                  {ruleTitle('SICK')}
                </p>
                <div className="erp-leave-policy-review-grid">
                  <ReviewItem
                    label={t('hr.leavePolicy.baseDays')}
                    value={String(review.sickBaseDays ?? '-')}
                  />
                  <ReviewItem
                    label={t('hr.leavePolicy.requiresReceipt')}
                    value={
                      review.sickRequiresReceipt
                        ? t('common.yes')
                        : t('common.no')
                    }
                  />
                </div>
              </div>
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      annualBaseDays,
      annualIsProgressive,
      previewDays,
      review,
      t,
    ],
  );

  return (
    <Form<LeavePolicyFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      initialValues={defaultValues()}
      className="flex min-h-0 flex-1 flex-col"
    >
      <StepperForm
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={isSubmitting}
        contentVariant="sections"
        submitLabel={submitLabel}
      />
    </Form>
  );
}
