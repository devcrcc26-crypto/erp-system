'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tooltip,
  type InputNumberProps,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import ProfileFileTypeIcon from '@/components/modules/users/ProfileFileTypeIcon';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  EmployeeContractCurrency,
  EmployeeContractDetail,
  EmployeeContractDocument,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import type { SupportedCurrency } from '@/lib/api/per-diem.types';
import {
  useAttachEmployeeContractFiles,
  useCreateEmployeeContract,
  useRemoveEmployeeContractAttachment,
  useUpdateEmployeeContract,
} from '@/lib/query/employee-contract';
import { useCurrencyRates } from '@/lib/query/currency';
import { useUser } from '@/lib/query/users';
import {
  EMPLOYEE_CONTRACT_TYPE_OPTIONS,
  contractTypeRequiresEndDate,
  formatEmployeeContractEmployeeName,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import {
  convertCurrencyAmount,
  roundCurrencyAmount,
} from '@/lib/utils/currency-convert';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

export interface EmployeeContractFormValues {
  employeeId: string;
  contractType: EmployeeContractType;
  signedAt: dayjs.Dayjs;
  startDate: dayjs.Dayjs;
  endDate?: dayjs.Dayjs | null;
  notes?: string;
  currency: EmployeeContractCurrency;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
  probationEndDate?: dayjs.Dayjs | null;
  governedBy?: string;
}

interface EmployeeContractFormProps {
  mode?: 'create' | 'edit';
  contract?: EmployeeContractDetail;
  onSuccess: (result: EmployeeContractDetail) => void;
}

const DETAILS_FIELDS = [
  'employeeId',
  'contractType',
  'signedAt',
  'startDate',
  'endDate',
  'probationEndDate',
  'governedBy',
  'notes',
] as const;

const COMPENSATION_FIELDS = [
  'currency',
  'basicSalary',
  'transportationAllowance',
  'monthlyBonus',
  'netSalary',
] as const;

const COMPENSATION_AMOUNT_FIELDS = [
  'basicSalary',
  'transportationAllowance',
  'monthlyBonus',
  'netSalary',
] as const;

const CURRENCY_OPTIONS: Array<{ value: SupportedCurrency; label: string }> = [
  { value: 'ETB', label: 'ETB' },
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
];

function CurrencyInputNumber({
  value,
  onChange,
  currencySuffix = 'ETB',
  ...rest
}: InputNumberProps & { currencySuffix?: string }): React.ReactNode {
  return (
    <Space.Compact className="w-full">
      <Input
        disabled
        value={currencySuffix}
        style={{ width: 64, textAlign: 'center' }}
      />
      <InputNumber
        {...rest}
        value={value}
        onChange={onChange}
        className="w-full"
        style={{ width: '100%' }}
      />
    </Space.Compact>
  );
}

function valuesFromContract(
  contract: EmployeeContractDetail,
): EmployeeContractFormValues {
  const toDay = (value: string | null | undefined): dayjs.Dayjs | undefined => {
    if (!value) {
      return undefined;
    }
    const dateOnly = value.slice(0, 10);
    return dayjs(dateOnly);
  };

  const toAmount = (
    value: string | number | null | undefined,
  ): number | undefined => {
    if (value == null || value === '') {
      return undefined;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    employeeId: contract.employeeId,
    contractType: contract.contractType,
    signedAt: toDay(contract.signedAt) ?? dayjs(),
    startDate: toDay(contract.startDate) ?? dayjs(),
    endDate: toDay(contract.endDate),
    notes: contract.notes ?? undefined,
    currency: contract.currency ?? 'ETB',
    basicSalary: toAmount(contract.basicSalary),
    transportationAllowance: toAmount(contract.transportationAllowance),
    monthlyBonus: toAmount(contract.monthlyBonus),
    netSalary: toAmount(contract.netSalary),
    probationEndDate: toDay(contract.probationEndDate),
    governedBy: contract.governedBy ?? undefined,
  };
}

function defaultValues(): Partial<EmployeeContractFormValues> {
  return { contractType: 'FIXED_TERM', currency: 'ETB' };
}

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p
        className="mb-0.5 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className="m-0 whitespace-pre-wrap text-sm"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Employee contract create/edit - StepperForm chrome like Add Employee.
 */
export default function EmployeeContractForm({
  mode = 'create',
  contract,
  onSuccess,
}: EmployeeContractFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<EmployeeContractFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [existingDocuments, setExistingDocuments] = useState<
    EmployeeContractDocument[]
  >(contract?.attachmentFolder?.documents ?? []);
  const [pendingRemoveDoc, setPendingRemoveDoc] =
    useState<EmployeeContractDocument | null>(null);
  const [detailsSnapshot, setDetailsSnapshot] =
    useState<Partial<EmployeeContractFormValues>>(defaultValues());
  const previousCurrencyRef = useRef<SupportedCurrency | null>(null);

  const createMutation = useCreateEmployeeContract();
  const updateMutation = useUpdateEmployeeContract(contract?.id ?? '');
  const attachMutation = useAttachEmployeeContractFiles(contract?.id ?? '');
  const removeAttachmentMutation = useRemoveEmployeeContractAttachment(
    contract?.id ?? '',
  );
  const ratesQuery = useCurrencyRates(true);

  const contractType =
    Form.useWatch('contractType', form) ??
    detailsSnapshot.contractType ??
    contract?.contractType ??
    'FIXED_TERM';
  const currency =
    (Form.useWatch('currency', form) as SupportedCurrency | undefined) ??
    detailsSnapshot.currency ??
    contract?.currency ??
    'ETB';
  const basicSalary = Form.useWatch('basicSalary', form);
  const transportationAllowance = Form.useWatch('transportationAllowance', form);
  const monthlyBonus = Form.useWatch('monthlyBonus', form);
  const employeeId = Form.useWatch('employeeId', form) ?? detailsSnapshot.employeeId;
  const formValues = Form.useWatch([], form) as
    | EmployeeContractFormValues
    | undefined;
  const requiresEndDate = contractTypeRequiresEndDate(contractType);

  const selectedEmployeeQuery = useUser(employeeId ?? '', Boolean(employeeId));

  const rateHint =
    ratesQuery.data?.USD != null && ratesQuery.data?.CNY != null
      ? t('hr.messages.currencyRatesHint', {
          usd: ratesQuery.data.USD.toLocaleString(undefined, {
            maximumFractionDigits: 4,
          }),
          cny: ratesQuery.data.CNY.toLocaleString(undefined, {
            maximumFractionDigits: 4,
          }),
        })
      : undefined;

  const typeOptions = useMemo(
    () =>
      EMPLOYEE_CONTRACT_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: formatEmployeeContractType(option.value, t),
      })),
    [t],
  );

  useEffect(() => {
    if (!contract) {
      previousCurrencyRef.current = 'ETB';
      setExistingDocuments([]);
      return;
    }
    const values = valuesFromContract(contract);
    form.setFieldsValue(values);
    setDetailsSnapshot(values);
    previousCurrencyRef.current = values.currency;
    setExistingDocuments(contract.attachmentFolder?.documents ?? []);
  }, [contract, form]);

  async function confirmRemoveAttachment(): Promise<void> {
    if (!pendingRemoveDoc || !contract) {
      return;
    }
    try {
      const updated = await removeAttachmentMutation.mutateAsync(
        pendingRemoveDoc.id,
      );
      setExistingDocuments(updated.attachmentFolder?.documents ?? []);
      messageApi.success(t('hr.messages.employeeContractAttachmentRemoved'));
      setPendingRemoveDoc(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToRemoveEmployeeContractAttachment'),
        messageApi,
      );
    }
  }

  function captureSnapshot(): Partial<EmployeeContractFormValues> {
    const values = form.getFieldsValue(true) as EmployeeContractFormValues;
    setDetailsSnapshot(values);
    return values;
  }

  function convertCompensationToCurrency(next: SupportedCurrency): void {
    const previous = previousCurrencyRef.current;
    if (!previous || previous === next) {
      previousCurrencyRef.current = next;
      return;
    }
    if (!ratesQuery.data) {
      messageApi.warning(t('hr.messages.currencyRatesUnavailable'));
      previousCurrencyRef.current = next;
      return;
    }

    const updates: Partial<
      Record<(typeof COMPENSATION_AMOUNT_FIELDS)[number], number>
    > = {};
    for (const field of COMPENSATION_AMOUNT_FIELDS) {
      const current = form.getFieldValue(field) as number | undefined;
      if (current == null || !Number.isFinite(current)) {
        continue;
      }
      const converted = convertCurrencyAmount(
        current,
        previous,
        next,
        ratesQuery.data,
      );
      if (converted == null) {
        messageApi.warning(t('hr.messages.currencyRatesUnavailable'));
        previousCurrencyRef.current = next;
        return;
      }
      updates[field] = roundCurrencyAmount(converted);
    }
    if (Object.keys(updates).length > 0) {
      form.setFieldsValue(updates);
    }
    previousCurrencyRef.current = next;
  }

  function resetForm(): void {
    if (mode === 'edit' && contract) {
      const values = valuesFromContract(contract);
      form.setFieldsValue(values);
      setDetailsSnapshot(values);
      previousCurrencyRef.current = values.currency;
    } else {
      form.resetFields();
      form.setFieldsValue(defaultValues());
      setDetailsSnapshot(defaultValues());
      previousCurrencyRef.current = 'ETB';
    }
    setSelectedFiles([]);
    setFormError(null);
    if (mode === 'edit' && contract) {
      setExistingDocuments(contract.attachmentFolder?.documents ?? []);
    } else {
      setExistingDocuments([]);
    }
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      const fields: string[] = [
        'employeeId',
        'contractType',
        'signedAt',
        'startDate',
      ];
      if (contractTypeRequiresEndDate(form.getFieldValue('contractType'))) {
        fields.push('endDate');
      }
      await form.validateFields(fields);

      const values = form.getFieldsValue(true) as EmployeeContractFormValues;
      if (values.startDate.isBefore(values.signedAt, 'day')) {
        messageApi.error(t('hr.validation.startAfterSigned'));
        return false;
      }
      if (
        contractTypeRequiresEndDate(values.contractType) &&
        values.endDate &&
        values.endDate.isBefore(values.startDate, 'day')
      ) {
        messageApi.error(t('hr.validation.endAfterStart'));
        return false;
      }

      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function validateCompensationStep(): Promise<boolean> {
    try {
      await form.validateFields([...COMPENSATION_FIELDS]);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function validateDocumentsStep(): Promise<boolean> {
    captureSnapshot();
    return true;
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    let values: EmployeeContractFormValues;
    try {
      values = await form.validateFields([
        ...DETAILS_FIELDS,
        ...COMPENSATION_FIELDS,
      ]);
    } catch {
      messageApi.error(t('hr.validation.required'));
      return;
    }

    if (values.startDate.isBefore(values.signedAt, 'day')) {
      messageApi.error(t('hr.validation.startAfterSigned'));
      return;
    }

    const needsEndDate = contractTypeRequiresEndDate(values.contractType);
    if (needsEndDate && !values.endDate) {
      messageApi.error(t('hr.validation.endDateRequired'));
      return;
    }
    if (
      needsEndDate &&
      values.endDate &&
      values.endDate.isBefore(values.startDate, 'day')
    ) {
      messageApi.error(t('hr.validation.endAfterStart'));
      return;
    }

    const endDate = needsEndDate
      ? values.endDate?.format('YYYY-MM-DD')
      : undefined;

    const salaryPayload = {
      currency: values.currency ?? 'ETB',
      basicSalary: values.basicSalary,
      transportationAllowance: values.transportationAllowance,
      monthlyBonus: values.monthlyBonus,
      netSalary:
        values.netSalary ??
        (values.basicSalary != null &&
        values.transportationAllowance != null &&
        values.monthlyBonus != null
          ? values.basicSalary +
            values.transportationAllowance +
            values.monthlyBonus
          : undefined),
      probationEndDate: values.probationEndDate
        ? values.probationEndDate.format('YYYY-MM-DD')
        : null,
      governedBy: values.governedBy?.trim() || null,
    };

    setSubmitting(true);
    try {
      let result: EmployeeContractDetail;
      if (mode === 'edit' && contract) {
        result = await updateMutation.mutateAsync({
          contractType: values.contractType,
          signedAt: values.signedAt.format('YYYY-MM-DD'),
          startDate: values.startDate.format('YYYY-MM-DD'),
          endDate: needsEndDate ? endDate ?? null : null,
          notes: values.notes?.trim() || null,
          ...salaryPayload,
        });
        if (selectedFiles.length > 0) {
          result = await attachMutation.mutateAsync(selectedFiles);
        }
      } else {
        result = await createMutation.mutateAsync({
          employeeId: values.employeeId,
          contractType: values.contractType,
          signedAt: values.signedAt.format('YYYY-MM-DD'),
          startDate: values.startDate.format('YYYY-MM-DD'),
          endDate,
          notes: values.notes?.trim() || undefined,
          currency: salaryPayload.currency,
          basicSalary: salaryPayload.basicSalary,
          transportationAllowance: salaryPayload.transportationAllowance,
          monthlyBonus: salaryPayload.monthlyBonus,
          netSalary: salaryPayload.netSalary,
          probationEndDate: salaryPayload.probationEndDate ?? undefined,
          governedBy: salaryPayload.governedBy ?? undefined,
          files: selectedFiles.length > 0 ? selectedFiles : undefined,
        });
      }

      messageApi.success(
        mode === 'edit'
          ? t('hr.messages.employeeContractUpdated')
          : t('hr.messages.employeeContractCreated'),
      );
      onSuccess(result);
    } catch (error: unknown) {
      const fallback =
        mode === 'edit'
          ? t('hr.messages.failedToUpdateEmployeeContract')
          : t('hr.messages.failedToCreateEmployeeContract');
      notifyApiError(error, fallback, messageApi);
      setFormError(fallback);
    } finally {
      setSubmitting(false);
    }
  }

  const reviewValues: Partial<EmployeeContractFormValues> =
    detailsSnapshot.employeeId || detailsSnapshot.signedAt
      ? detailsSnapshot
      : (formValues ?? detailsSnapshot);

  const employeeLabel = selectedEmployeeQuery.data
    ? formatUserName(selectedEmployeeQuery.data)
    : contract?.employee
      ? formatEmployeeContractEmployeeName(contract.employee)
      : reviewValues.employeeId || '-';

  const computedNet =
    reviewValues.netSalary ??
    (reviewValues.basicSalary != null &&
    reviewValues.transportationAllowance != null &&
    reviewValues.monthlyBonus != null
      ? reviewValues.basicSalary +
        reviewValues.transportationAllowance +
        reviewValues.monthlyBonus
      : undefined);

  const steps = useMemo(
    () => [
      {
        title: t('hr.section.contractDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            dense
            title={t('hr.section.contractDetails')}
            description={t('pages.hr.employeeContract.detailsStepDescription')}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="employeeId"
                label={t('hr.form.employee')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectEmployee'),
                  },
                ]}
              >
                <UserSelect
                  placeholder={t('hr.placeholder.employee')}
                  allowClear={false}
                  disabled={mode === 'edit'}
                />
              </Form.Item>
              <Form.Item
                name="contractType"
                label={t('hr.form.contractType')}
                rules={[
                  { required: true, message: t('hr.validation.required') },
                ]}
              >
                <Select
                  options={typeOptions}
                  onChange={(value: EmployeeContractType) => {
                    if (value === 'OPEN_ENDED') {
                      form.setFieldValue('endDate', undefined);
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                name="signedAt"
                label={t('hr.form.signedAt')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectDate'),
                  },
                ]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item
                name="startDate"
                label={t('hr.form.startDate')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectDate'),
                  },
                ]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
              {requiresEndDate ? (
                <Form.Item
                  name="endDate"
                  label={t('hr.form.endDate')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.endDateRequired'),
                    },
                  ]}
                >
                  <DatePicker className="w-full" />
                </Form.Item>
              ) : null}
              <Form.Item
                name="probationEndDate"
                label={t('hr.labels.probationEndDate')}
              >
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item name="governedBy" label={t('hr.labels.governedBy')}>
                <Input placeholder={t('hr.placeholder.governedBy')} />
              </Form.Item>
              <Form.Item
                name="notes"
                label={t('hr.form.notes')}
                className="md:col-span-2"
              >
                <Input.TextArea rows={3} maxLength={2000} showCount />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('hr.section.compensation'),
        validate: () => validateCompensationStep(),
        content: (
          <FormLayout
            variant="pro"
            dense
            title={t('hr.section.compensation')}
            description={t(
              'pages.hr.employeeContract.compensationStepDescription',
            )}
          >
            <div className="mb-4 max-w-xs">
              <Form.Item
                name="currency"
                label={t('hr.form.currency')}
                rules={[{ required: true }]}
                extra={rateHint}
                className="mb-0"
              >
                <Select
                  className="erp-contract-currency-select"
                  loading={ratesQuery.isLoading}
                  options={CURRENCY_OPTIONS}
                  onChange={(value: SupportedCurrency) => {
                    convertCompensationToCurrency(value);
                  }}
                />
              </Form.Item>
            </div>
            {ratesQuery.isError ? (
              <Alert
                type="warning"
                showIcon
                title={t('hr.messages.currencyRatesUnavailable')}
                className="mb-4"
              />
            ) : null}
            <div className="erp-form-grid-2">
              <Form.Item name="basicSalary" label={t('hr.labels.basicSalary')}>
                <CurrencyInputNumber
                  min={0}
                  precision={2}
                  currencySuffix={currency}
                />
              </Form.Item>
              <Form.Item
                name="transportationAllowance"
                label={t('hr.labels.transportationAllowance')}
              >
                <CurrencyInputNumber
                  min={0}
                  precision={2}
                  currencySuffix={currency}
                />
              </Form.Item>
              <Form.Item
                name="monthlyBonus"
                label={t('hr.labels.monthlyBonus')}
              >
                <CurrencyInputNumber
                  min={0}
                  precision={2}
                  currencySuffix={currency}
                />
              </Form.Item>
              <Form.Item name="netSalary" label={t('hr.labels.netSalary')}>
                <CurrencyInputNumber
                  min={0}
                  precision={2}
                  currencySuffix={currency}
                  placeholder={
                    basicSalary != null &&
                    transportationAllowance != null &&
                    monthlyBonus != null
                      ? String(
                          basicSalary + transportationAllowance + monthlyBonus,
                        )
                      : undefined
                  }
                />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('hr.section.supportingDocuments'),
        validate: () => validateDocumentsStep(),
        content: (
          <FormLayout
            variant="pro"
            dense
            title={t('hr.section.supportingDocuments')}
            description={t('pages.hr.employeeContract.documentsStepDescription')}
          >
            {mode === 'edit' && existingDocuments.length > 0 ? (
              <ul className="mb-4 m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                {existingDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-2 rounded-xl border border-[#e8ebef] bg-white px-3 py-2"
                  >
                    <ProfileFileTypeIcon
                      name={doc.name}
                      fileType={doc.fileType}
                      size="sm"
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      title={doc.name}
                    >
                      {doc.name}
                    </span>
                    <Tooltip title={t('hr.buttons.removeItem')}>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={submitting || removeAttachmentMutation.isPending}
                        loading={
                          removeAttachmentMutation.isPending &&
                          pendingRemoveDoc?.id === doc.id
                        }
                        aria-label={t('hr.buttons.removeItem')}
                        onClick={() => setPendingRemoveDoc(doc)}
                      />
                    </Tooltip>
                  </li>
                ))}
              </ul>
            ) : null}
            <FileUploadInput
              files={selectedFiles}
              onChange={setSelectedFiles}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              multiple
              disabled={submitting}
              placeholder={t('hr.placeholder.chooseSupportingDocuments')}
            />
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <div className="erp-employee-form-sections">
            <FormLayout
              variant="pro"
              dense
              title={t('hr.form.reviewSubmit')}
              description={t('pages.hr.employeeContract.reviewStepDescription')}
            >
              <div className="erp-form-grid-2">
                <ReviewItem
                  label={t('hr.form.employee')}
                  value={employeeLabel}
                />
                <ReviewItem
                  label={t('hr.form.contractType')}
                  value={formatEmployeeContractType(
                    reviewValues.contractType ?? 'FIXED_TERM',
                    t,
                  )}
                />
                <ReviewItem
                  label={t('hr.form.signedAt')}
                  value={
                    reviewValues.signedAt
                      ? formatProjectDate(
                          reviewValues.signedAt.toISOString(),
                        )
                      : '-'
                  }
                />
                <ReviewItem
                  label={t('hr.form.startDate')}
                  value={
                    reviewValues.startDate
                      ? formatProjectDate(
                          reviewValues.startDate.toISOString(),
                        )
                      : '-'
                  }
                />
                <ReviewItem
                  label={t('hr.form.endDate')}
                  value={
                    contractTypeRequiresEndDate(reviewValues.contractType)
                      ? reviewValues.endDate
                        ? formatProjectDate(
                            reviewValues.endDate.toISOString(),
                          )
                        : '-'
                      : t('hr.labels.openEnded')
                  }
                />
                <ReviewItem
                  label={t('hr.labels.probationEndDate')}
                  value={
                    reviewValues.probationEndDate
                      ? formatProjectDate(
                          reviewValues.probationEndDate.toISOString(),
                        )
                      : '-'
                  }
                />
                <ReviewItem
                  label={t('hr.labels.governedBy')}
                  value={reviewValues.governedBy?.trim() || '-'}
                />
                {reviewValues.notes?.trim() ? (
                  <ReviewItem
                    label={t('hr.form.notes')}
                    value={reviewValues.notes.trim()}
                  />
                ) : null}
              </div>
            </FormLayout>

            <FormLayout
              variant="pro"
              dense
              title={t('hr.section.compensation')}
            >
              <div className="erp-form-grid-2">
                <ReviewItem
                  label={t('hr.form.currency')}
                  value={reviewValues.currency ?? currency}
                />
                <ReviewItem
                  label={t('hr.labels.basicSalary')}
                  value={formatCurrencyAmount(
                    reviewValues.basicSalary,
                    reviewValues.currency ?? currency,
                  )}
                />
                <ReviewItem
                  label={t('hr.labels.transportationAllowance')}
                  value={formatCurrencyAmount(
                    reviewValues.transportationAllowance,
                    reviewValues.currency ?? currency,
                  )}
                />
                <ReviewItem
                  label={t('hr.labels.monthlyBonus')}
                  value={formatCurrencyAmount(
                    reviewValues.monthlyBonus,
                    reviewValues.currency ?? currency,
                  )}
                />
                <ReviewItem
                  label={t('hr.labels.netSalary')}
                  value={formatCurrencyAmount(
                    computedNet,
                    reviewValues.currency ?? currency,
                  )}
                />
              </div>
            </FormLayout>

            <FormLayout
              variant="pro"
              dense
              title={t('hr.section.supportingDocuments')}
            >
              {selectedFiles.length > 0 ||
              (mode === 'edit' && existingDocuments.length > 0) ? (
                <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                  {mode === 'edit'
                    ? existingDocuments.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex items-center gap-2 rounded-xl border border-[#e8ebef] bg-white px-3 py-2"
                        >
                          <ProfileFileTypeIcon
                            name={doc.name}
                            fileType={doc.fileType}
                            size="sm"
                          />
                          <span
                            className="min-w-0 truncate text-sm"
                            title={doc.name}
                          >
                            {doc.name}
                          </span>
                        </li>
                      ))
                    : null}
                  {selectedFiles.map((file) => (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="flex items-center gap-2 rounded-xl border border-[#e8ebef] bg-white px-3 py-2"
                    >
                      <ProfileFileTypeIcon
                        name={file.name}
                        fileType={file.type}
                        size="sm"
                      />
                      <span
                        className="min-w-0 truncate text-sm"
                        title={file.name}
                      >
                        {file.name}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noAttachments')}
                </p>
              )}
            </FormLayout>
          </div>
        ),
      },
    ],
    [
      t,
      mode,
      existingDocuments,
      typeOptions,
      requiresEndDate,
      currency,
      rateHint,
      ratesQuery.isLoading,
      ratesQuery.isError,
      basicSalary,
      transportationAllowance,
      monthlyBonus,
      employeeLabel,
      reviewValues,
      computedNet,
      form,
      selectedFiles,
      submitting,
      removeAttachmentMutation.isPending,
      pendingRemoveDoc?.id,
    ],
  );

  return (
    <>
    <Form<EmployeeContractFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      className="flex min-h-0 flex-1 flex-col"
      initialValues={contract ? undefined : defaultValues()}
    >
      {formError ? (
        <Alert
          type="error"
          showIcon
          title={formError}
          className="mb-4"
          closable
          onClose={() => setFormError(null)}
        />
      ) : null}
      <StepperForm
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={submitting}
        contentVariant="sections"
        submitLabel={
          mode === 'edit'
            ? t('hr.buttons.save')
            : t('hr.buttons.createContract')
        }
      />
    </Form>
    <ConfirmDialog
      open={pendingRemoveDoc != null}
      title={t('pages.hr.employeeContract.removeAttachmentTitle')}
      description={t('pages.hr.employeeContract.removeAttachmentDescription', {
        name: pendingRemoveDoc?.name ?? '',
      })}
      confirmLabel={t('hr.buttons.removeItem')}
      cancelLabel={t('common.cancel')}
      danger
      confirmLoading={removeAttachmentMutation.isPending}
      onConfirm={() => void confirmRemoveAttachment()}
      onCancel={() => {
        if (!removeAttachmentMutation.isPending) {
          setPendingRemoveDoc(null);
        }
      }}
    />
    </>
  );
}
