'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popover,
  Select,
  Skeleton,
  Space,
  Spin,
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
  EmployeeContractDetail,
  EmployeeContractDocument,
  EmployeeContractType,
  SalaryPreviewResult,
} from '@/lib/api/employee-contract.types';
import {
  previewEmployeeContractSalary,
  solveBonusFromNet,
  useAttachEmployeeContractFiles,
  useCreateEmployeeContract,
  useRemoveEmployeeContractAttachment,
  useRenewalLeavePreview,
  useUpdateEmployeeContract,
} from '@/lib/query/employee-contract';
import { useUser } from '@/lib/query/users';
import {
  EMPLOYEE_CONTRACT_TYPE_OPTIONS,
  contractTypeRequiresEndDate,
  formatEmployeeContractEmployeeName,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

export interface EmployeeContractFormValues {
  employeeId: string;
  contractType: EmployeeContractType;
  signedAt?: dayjs.Dayjs;
  startDate?: dayjs.Dayjs;
  endDate?: dayjs.Dayjs | null;
  notes?: string;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  monthlyNetBonus?: number;
  pensionApplicable: boolean;
  taxApplicable: boolean;
  probationEndDate?: dayjs.Dayjs | null;
  governedBy?: string;
}

interface EmployeeContractFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
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
  'basicSalary',
  'transportationAllowance',
  'monthlyBonus',
  'monthlyNetBonus',
  'pensionApplicable',
  'taxApplicable',
] as const;

const ETB = 'ETB';
const PREVIEW_DEBOUNCE_MS = 400;

function CurrencyInputNumber({
  value,
  onChange,
  currencySuffix = ETB,
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
): Partial<EmployeeContractFormValues> {
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
    signedAt: toDay(contract.signedAt),
    startDate: toDay(contract.startDate),
    endDate: toDay(contract.endDate),
    notes: contract.notes ?? undefined,
    basicSalary: toAmount(contract.basicSalary),
    transportationAllowance: toAmount(contract.transportationAllowance),
    monthlyBonus: toAmount(contract.monthlyBonus),
    monthlyNetBonus: toAmount(contract.monthlyNetBonus) ?? 0,
    pensionApplicable: contract.pensionApplicable ?? true,
    taxApplicable: contract.taxApplicable ?? true,
    probationEndDate: toDay(contract.probationEndDate),
    governedBy: contract.governedBy ?? undefined,
  };
}

function defaultValues(): Partial<EmployeeContractFormValues> {
  return {
    contractType: 'FIXED_TERM',
    pensionApplicable: true,
    taxApplicable: true,
  };
}

function formatEtb(value: number | string | null | undefined): string {
  return formatCurrencyAmount(value, ETB);
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

function PreviewRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className="text-xs"
        style={{ color: tokens.colorTextSecondary }}
      >
        {label}
      </span>
      <span
        className={emphasize ? 'text-sm font-semibold' : 'text-sm'}
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Annual leave effect of a renewal (carry-forward + new entitlement), from the
 * ledger's own rules. Hidden for first contracts; never blocks submit.
 */
function RenewalLeavePreviewCard({
  employeeId,
  startDate,
}: {
  employeeId: string;
  startDate: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const previewQuery = useRenewalLeavePreview(employeeId, startDate);
  const k = 'pages.hr.employeeContract.renewalPreview';
  const days = (count: number): string => t(`${k}.days`, { count });

  let body: React.ReactNode;
  if (previewQuery.isPending) {
    body = <Skeleton active title={false} paragraph={{ rows: 4 }} />;
  } else if (previewQuery.isError) {
    body = <Alert type="warning" showIcon title={t(`${k}.unavailable`)} />;
  } else {
    const preview = previewQuery.data;
    if (!preview.isRenewal || preview.excluded) {
      return null;
    }
    const newYearStart = formatProjectDate(preview.newYear.start);
    const intro = preview.alreadyOpen
      ? t(`${k}.alreadyOpen`, { date: newYearStart })
      : t(`${k}.startsLeaveYear`, { date: newYearStart });
    body = (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs" style={{ color: tokens.colorTextSecondary }}>
          {intro}
        </p>
        <div
          className="flex flex-col gap-2 rounded-xl border border-[#e8ebef] bg-[#f8f9fb] p-4"
          aria-live="polite"
        >
          {!preview.alreadyOpen ? (
            <PreviewRow
              label={t(`${k}.currentRemaining`)}
              value={days(preview.currentRemaining)}
            />
          ) : null}
          <PreviewRow
            label={t(`${k}.carryForward`)}
            value={days(preview.carryForward)}
          />
          {preview.expired > 0 ? (
            <PreviewRow
              label={t(`${k}.expired`)}
              value={days(preview.expired)}
            />
          ) : null}
          <PreviewRow
            label={t(`${k}.serviceYears`)}
            value={t(`${k}.years`, { count: preview.serviceYears })}
          />
          <PreviewRow
            label={t(`${k}.newEntitlement`)}
            value={days(preview.newEntitlement)}
          />
          <PreviewRow
            label={t(`${k}.openingBalance`, { date: newYearStart })}
            value={days(preview.projectedOpeningBalance)}
            emphasize
          />
        </div>
        {!preview.alreadyOpen ? (
          <p className="m-0 text-xs" style={{ color: tokens.colorTextSecondary }}>
            {t(`${k}.asOfToday`)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <FormLayout variant="pro" dense title={t(`${k}.title`)}>
      {body}
    </FormLayout>
  );
}

/**
 * Employee contract create/edit - StepperForm chrome like Add Employee.
 */
export default function EmployeeContractForm({
  mode = 'create',
  contract,
  onSuccess,
  onCancel,
  cancelLabel,
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
  const [salaryPreview, setSalaryPreview] = useState<SalaryPreviewResult | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [bonusPopoverOpen, setBonusPopoverOpen] = useState(false);
  const [targetNet, setTargetNet] = useState<number | null>(null);
  const [bonusFromNetLoading, setBonusFromNetLoading] = useState(false);
  const [bonusFromNetError, setBonusFromNetError] = useState<string | null>(
    null,
  );

  const createMutation = useCreateEmployeeContract();
  const updateMutation = useUpdateEmployeeContract(contract?.id ?? '');
  const attachMutation = useAttachEmployeeContractFiles(contract?.id ?? '');
  const removeAttachmentMutation = useRemoveEmployeeContractAttachment(
    contract?.id ?? '',
  );

  const contractType =
    Form.useWatch('contractType', form) ??
    detailsSnapshot.contractType ??
    contract?.contractType ??
    'FIXED_TERM';
  const basicSalary = Form.useWatch('basicSalary', form);
  const transportationAllowance = Form.useWatch('transportationAllowance', form);
  const monthlyBonus = Form.useWatch('monthlyBonus', form);
  const monthlyNetBonus = Form.useWatch('monthlyNetBonus', form);
  const pensionApplicable = Form.useWatch('pensionApplicable', form);
  const taxApplicable = Form.useWatch('taxApplicable', form);
  const employeeId = Form.useWatch('employeeId', form) ?? detailsSnapshot.employeeId;
  const formValues = Form.useWatch([], form) as
    | EmployeeContractFormValues
    | undefined;
  const requiresEndDate = contractTypeRequiresEndDate(contractType);

  const selectedEmployeeQuery = useUser(employeeId ?? '', Boolean(employeeId));

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
      setExistingDocuments([]);
      return;
    }
    const values = valuesFromContract(contract);
    form.setFieldsValue(values);
    setDetailsSnapshot(values);
    setExistingDocuments(contract.attachmentFolder?.documents ?? []);
  }, [contract, form]);

  useEffect(() => {
    const basic =
      typeof basicSalary === 'number' && Number.isFinite(basicSalary)
        ? basicSalary
        : undefined;
    const transport =
      typeof transportationAllowance === 'number' &&
      Number.isFinite(transportationAllowance)
        ? transportationAllowance
        : 0;
    const bonus =
      typeof monthlyBonus === 'number' && Number.isFinite(monthlyBonus)
        ? monthlyBonus
        : 0;
    const netBonus =
      typeof monthlyNetBonus === 'number' && Number.isFinite(monthlyNetBonus)
        ? monthlyNetBonus
        : 0;

    if (basic == null) {
      setSalaryPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await previewEmployeeContractSalary({
            basicSalary: basic,
            transportationAllowance: transport,
            monthlyBonus: bonus,
            monthlyNetBonus: netBonus,
            pensionApplicable: pensionApplicable ?? true,
            taxApplicable: taxApplicable ?? true,
          });
          if (cancelled) {
            return;
          }
          setSalaryPreview(result);
          setPreviewError(null);
        } catch (error: unknown) {
          if (cancelled) {
            return;
          }
          setSalaryPreview(null);
          setPreviewError(
            error instanceof Error
              ? error.message
              : t('hr.messages.salaryPreviewFailed'),
          );
        } finally {
          if (!cancelled) {
            setPreviewLoading(false);
          }
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    basicSalary,
    transportationAllowance,
    monthlyBonus,
    monthlyNetBonus,
    pensionApplicable,
    taxApplicable,
    t,
  ]);

  async function applyBonusFromNet(): Promise<void> {
    const basic =
      typeof basicSalary === 'number' && Number.isFinite(basicSalary)
        ? basicSalary
        : undefined;
    const net =
      typeof targetNet === 'number' && Number.isFinite(targetNet)
        ? targetNet
        : undefined;
    if (basic == null || net == null) {
      setBonusFromNetError(t('hr.validation.required'));
      return;
    }

    const transport =
      typeof transportationAllowance === 'number' &&
      Number.isFinite(transportationAllowance)
        ? transportationAllowance
        : 0;

    setBonusFromNetLoading(true);
    setBonusFromNetError(null);
    try {
      const result = await solveBonusFromNet({
        basicSalary: basic,
        transportationAllowance: transport,
        targetNet: net,
        pensionApplicable: pensionApplicable ?? true,
        taxApplicable: taxApplicable ?? true,
      });
      form.setFieldValue('monthlyBonus', result.monthlyBonus);
      setBonusPopoverOpen(false);
      setTargetNet(null);
    } catch (error: unknown) {
      setBonusFromNetError(
        error instanceof Error
          ? error.message
          : t('hr.messages.bonusFromNetFailed'),
      );
    } finally {
      setBonusFromNetLoading(false);
    }
  }

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

  function resetForm(): void {
    if (mode === 'edit' && contract) {
      const values = valuesFromContract(contract);
      form.setFieldsValue(values);
      setDetailsSnapshot(values);
    } else {
      form.resetFields();
      form.setFieldsValue(defaultValues());
      setDetailsSnapshot(defaultValues());
    }
    setSelectedFiles([]);
    setFormError(null);
    setSalaryPreview(null);
    setPreviewError(null);
    setBonusPopoverOpen(false);
    setTargetNet(null);
    setBonusFromNetError(null);
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
      if (
        values.signedAt &&
        values.startDate &&
        values.startDate.isBefore(values.signedAt, 'day')
      ) {
        messageApi.error(t('hr.validation.startAfterSigned'));
        return false;
      }
      if (
        contractTypeRequiresEndDate(values.contractType) &&
        values.endDate &&
        values.startDate &&
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

    if (!values.signedAt || !values.startDate) {
      messageApi.error(t('hr.validation.selectDate'));
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
      basicSalary: values.basicSalary,
      transportationAllowance: values.transportationAllowance,
      monthlyBonus: values.monthlyBonus,
      monthlyNetBonus: values.monthlyNetBonus ?? 0,
      pensionApplicable: values.pensionApplicable ?? true,
      taxApplicable: values.taxApplicable ?? true,
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
          basicSalary: salaryPayload.basicSalary,
          transportationAllowance: salaryPayload.transportationAllowance,
          monthlyBonus: salaryPayload.monthlyBonus,
          pensionApplicable: salaryPayload.pensionApplicable,
          taxApplicable: salaryPayload.taxApplicable,
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

  const bonusFromNetContent = (
    <div className="flex w-64 flex-col gap-3">
      <div>
        <p
          className="mb-1 text-xs font-medium"
          style={{ color: tokens.colorTextSecondary }}
        >
          {t('hr.labels.targetNet')}
        </p>
        <CurrencyInputNumber
          min={0}
          precision={2}
          value={targetNet ?? undefined}
          onChange={(value) => {
            setTargetNet(typeof value === 'number' ? value : null);
            setBonusFromNetError(null);
          }}
        />
      </div>
      {bonusFromNetError ? (
        <Alert type="error" showIcon title={bonusFromNetError} />
      ) : null}
      <Button
        type="primary"
        loading={bonusFromNetLoading}
        disabled={
          bonusFromNetLoading ||
          typeof basicSalary !== 'number' ||
          typeof targetNet !== 'number'
        }
        onClick={() => void applyBonusFromNet()}
      >
        {t('hr.labels.useThisBonus')}
      </Button>
    </div>
  );

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
            <div className="erp-form-grid-2 mb-4">
              <Form.Item
                name="pensionApplicable"
                valuePropName="checked"
                className="mb-0"
              >
                <Checkbox>{t('hr.labels.pensionApplicable')}</Checkbox>
              </Form.Item>
              <Form.Item
                name="taxApplicable"
                valuePropName="checked"
                className="mb-0"
              >
                <Checkbox>{t('hr.labels.taxApplicable')}</Checkbox>
              </Form.Item>
            </div>
            <p
              className="mb-4 mt-0 text-xs"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('hr.messages.pensionTaxExemptHint')}
            </p>

            <div className="erp-form-grid-2">
              <Form.Item name="basicSalary" label={t('hr.labels.basicSalary')}>
                <CurrencyInputNumber min={0} precision={2} />
              </Form.Item>
              <Form.Item
                name="transportationAllowance"
                label={t('hr.labels.transportationAllowance')}
              >
                <CurrencyInputNumber min={0} precision={2} />
              </Form.Item>
              <Form.Item
                name="monthlyBonus"
                label={t('hr.labels.monthlyBonus')}
                extra={
                  <Popover
                    trigger="click"
                    open={bonusPopoverOpen}
                    onOpenChange={(open) => {
                      setBonusPopoverOpen(open);
                      if (!open) {
                        setBonusFromNetError(null);
                      }
                    }}
                    content={bonusFromNetContent}
                    title={t('hr.labels.calculateFromTargetNet')}
                  >
                    <Button type="link" size="small" className="!px-0">
                      {t('hr.labels.calculateFromTargetNet')}
                    </Button>
                  </Popover>
                }
              >
                <CurrencyInputNumber min={0} precision={2} />
              </Form.Item>
              <Form.Item
                name="monthlyNetBonus"
                label={t('hr.labels.monthlyNetBonus')}
                extra={t('hr.labels.monthlyNetBonusHint')}
              >
                <CurrencyInputNumber min={0} precision={2} />
              </Form.Item>
            </div>

            <div
              className="mt-4 rounded-xl border border-[#e8ebef] bg-[#f8f9fb] p-4"
              aria-live="polite"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4
                  className="m-0 text-sm font-semibold"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {t('hr.labels.salaryPreviewNormalMonth')}
                </h4>
                {previewLoading ? <Spin size="small" /> : null}
              </div>
              {previewError ? (
                <Alert type="warning" showIcon title={previewError} />
              ) : salaryPreview ? (
                <div className="flex flex-col gap-2">
                  <PreviewRow
                    label={t('hr.labels.taxableIncome')}
                    value={formatEtb(salaryPreview.taxableIncome)}
                  />
                  <PreviewRow
                    label={t('hr.labels.incomeTax')}
                    value={formatEtb(salaryPreview.incomeTax)}
                  />
                  <PreviewRow
                    label={t('hr.labels.pensionEmployee')}
                    value={formatEtb(salaryPreview.pensionEmployee)}
                  />
                  {(salaryPreview.monthlyNetBonus ?? 0) > 0 ? (
                    <PreviewRow
                      label={t('hr.labels.monthlyNetBonus')}
                      value={formatEtb(salaryPreview.monthlyNetBonus)}
                    />
                  ) : null}
                  <PreviewRow
                    label={t('hr.labels.estimatedNet')}
                    value={formatEtb(salaryPreview.netPay)}
                    emphasize
                  />
                </div>
              ) : (
                <p
                  className="m-0 text-xs"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  {t('hr.labels.salaryPreviewEmpty')}
                </p>
              )}
              <p
                className="mb-0 mt-3 text-xs"
                style={{ color: tokens.colorTextSecondary }}
              >
                {t('hr.messages.salaryPreviewActualNetHint')}
              </p>
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
                  label={t('hr.labels.pensionApplicable')}
                  value={
                    (reviewValues.pensionApplicable ?? true)
                      ? t('common.yes')
                      : t('common.no')
                  }
                />
                <ReviewItem
                  label={t('hr.labels.taxApplicable')}
                  value={
                    (reviewValues.taxApplicable ?? true)
                      ? t('common.yes')
                      : t('common.no')
                  }
                />
                <ReviewItem
                  label={t('hr.labels.basicSalary')}
                  value={formatEtb(reviewValues.basicSalary)}
                />
                <ReviewItem
                  label={t('hr.labels.transportationAllowance')}
                  value={formatEtb(reviewValues.transportationAllowance)}
                />
                <ReviewItem
                  label={t('hr.labels.monthlyBonus')}
                  value={formatEtb(reviewValues.monthlyBonus)}
                />
                <ReviewItem
                  label={t('hr.labels.monthlyNetBonus')}
                  value={formatEtb(reviewValues.monthlyNetBonus ?? 0)}
                />
                {salaryPreview ? (
                  <ReviewItem
                    label={t('hr.labels.estimatedNet')}
                    value={formatEtb(salaryPreview.netPay)}
                  />
                ) : null}
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

            {mode === 'create' &&
            reviewValues.employeeId &&
            reviewValues.startDate ? (
              <RenewalLeavePreviewCard
                employeeId={reviewValues.employeeId}
                startDate={reviewValues.startDate.format('YYYY-MM-DD')}
              />
            ) : null}
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
      salaryPreview,
      previewLoading,
      previewError,
      employeeLabel,
      reviewValues,
      form,
      selectedFiles,
      submitting,
      removeAttachmentMutation.isPending,
      pendingRemoveDoc?.id,
      bonusPopoverOpen,
      bonusFromNetContent,
      basicSalary,
      targetNet,
      bonusFromNetLoading,
      bonusFromNetError,
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
        onCancel={onCancel}
        cancelLabel={cancelLabel}
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
