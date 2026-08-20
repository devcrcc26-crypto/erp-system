'use client';

import { useEffect, useMemo } from 'react';
import {
  Alert,
  Form,
  Input,
  InputNumber,
  Switch,
} from 'antd';
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

const DETAIL_FIELDS = ['name', 'governedBy', 'description', 'isActive'] as const;

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

interface LeavePolicyFormProps {
  policy?: LeavePolicy;
  isSubmitting?: boolean;
  submitLabel: string;
  onSubmit: (values: LeavePolicyFormValues) => void | Promise<void>;
}

/**
 * Leave policy create/edit stepper with policy details and leave rules.
 */
export default function LeavePolicyForm({
  policy,
  isSubmitting = false,
  submitLabel,
  onSubmit,
}: LeavePolicyFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<LeavePolicyFormValues>();

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
    form.setFieldsValue(policy ? valuesFromPolicy(policy) : defaultValues());
  }, [form, policy]);

  const previewDays = useMemo(() => {
    const rule: LeavePolicyRuleInput = {
      leaveType: 'ANNUAL',
      baseDays: annualBaseDays ?? 0,
      isProgressive: Boolean(annualIsProgressive),
      incrementDays: annualIncrementDays,
      incrementEveryYears: annualIncrementEveryYears,
      minimumServiceMonths: annualMinimumServiceMonths ?? 0,
      maxDaysCap: annualMaxDaysCap,
    };
    return previewEntitlement(rule, PREVIEW_YEARS);
  }, [
    annualBaseDays,
    annualIsProgressive,
    annualIncrementDays,
    annualIncrementEveryYears,
    annualMaxDaysCap,
    annualMinimumServiceMonths,
  ]);

  async function validateFields(
    names: readonly string[],
  ): Promise<boolean> {
    try {
      await form.validateFields([...names]);
      return true;
    } catch {
      return false;
    }
  }

  function resetForm(): void {
    form.setFieldsValue(policy ? valuesFromPolicy(policy) : defaultValues());
  }

  async function validateRulesStep(): Promise<boolean> {
    const progressive = form.getFieldValue('annualIsProgressive');
    const fields: string[] = [
      'annualBaseDays',
      'annualMinimumServiceMonths',
      'annualIsProgressive',
      'annualMaxCarryForwardDays',
      'maternityBaseDays',
      'maternityMinimumServiceMonths',
      'sickBaseDays',
      'sickRequiresReceipt',
    ];
    if (progressive) {
      fields.splice(
        3,
        0,
        'annualIncrementDays',
        'annualIncrementEveryYears',
        'annualMaxDaysCap',
      );
    }
    return validateFields(fields);
  }

  async function handleSubmit(): Promise<void> {
    const detailsOk = await validateFields(DETAIL_FIELDS);
    if (!detailsOk) {
      return;
    }
    const rulesOk = await validateRulesStep();
    if (!rulesOk) {
      return;
    }
    const values = form.getFieldsValue(true) as LeavePolicyFormValues;
    await onSubmit(values);
  }

  function ruleTitle(leaveType: LeavePolicyLeaveType): string {
    return formatLeaveType(leaveType, t);
  }

  const steps = useMemo(
    () => [
      {
        title: t('hr.leavePolicy.steps.details'),
        content: (
          <FormLayout variant="pro" dense title={t('hr.leavePolicy.detail')}>
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
                <Input.TextArea rows={2} maxLength={2000} showCount />
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
        validate: () => validateFields(DETAIL_FIELDS),
      },
      {
        title: t('hr.leavePolicy.steps.leaveRules'),
        content: (
          <div className="flex flex-col gap-3">
            <FormLayout variant="pro" dense title={ruleTitle('ANNUAL')}>
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
              <Alert
                className="mt-12"
                type="info"
                showIcon
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
        validate: () => validateRulesStep(),
      },
    ],
    [t, annualIsProgressive, annualBaseDays, previewDays],
  );

  return (
    <Form<LeavePolicyFormValues>
      form={form}
      layout="vertical"
      className="flex min-h-0 flex-1 flex-col"
      initialValues={defaultValues()}
    >
      <StepperForm
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={isSubmitting}
        contentVariant="sections"
        compact
        submitLabel={submitLabel}
        resetLabel={t('hr.buttons.reset')}
      />
    </Form>
  );
}
