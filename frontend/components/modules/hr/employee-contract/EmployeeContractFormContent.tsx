'use client';

import { Alert, Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import EmployeeContractForm, {
  type EmployeeContractFormValues,
} from '@/components/modules/hr/employee-contract/EmployeeContractForm';
import FormPageFooter from '@/components/ui/FormPageFooter/FormPageFooter';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCreateEmployeeContract,
  useEmployeeContract,
  useUpdateEmployeeContract,
} from '@/lib/query/employee-contract';
import {
  contractTypeRequiresEndDate,
} from '@/lib/utils/employee-contract-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

/**
 * Full-page create / edit employee contract — layout aligned with Leave Policy and Users.
 */
export default function EmployeeContractFormContent({
  contractId,
}: {
  contractId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const isEdit = Boolean(contractId);
  const detailQuery = useEmployeeContract(contractId ?? '', isEdit);
  const createMutation = useCreateEmployeeContract();
  const updateMutation = useUpdateEmployeeContract(contractId ?? '');

  const saving = createMutation.isPending || updateMutation.isPending;

  useSetHeaderExtra(null);

  async function handleSubmit(
    values: EmployeeContractFormValues,
  ): Promise<void> {
    if (values.startDate.isBefore(values.signedAt, 'day')) {
      messageApi.error(t('hr.validation.startAfterSigned'));
      return;
    }

    const requiresEndDate = contractTypeRequiresEndDate(values.contractType);

    if (requiresEndDate && !values.endDate) {
      messageApi.error(t('hr.validation.endDateRequired'));
      return;
    }

    if (
      requiresEndDate &&
      values.endDate &&
      values.endDate.isBefore(values.startDate, 'day')
    ) {
      messageApi.error(t('hr.validation.endAfterStart'));
      return;
    }

    const endDate = requiresEndDate
      ? values.endDate?.format('YYYY-MM-DD')
      : undefined;

    const salaryPayload = {
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
      probationEndDate: values.probationEndDate?.format('YYYY-MM-DD'),
      governedBy: values.governedBy?.trim() || undefined,
    };

    try {
      const result =
        isEdit && contractId
          ? await updateMutation.mutateAsync({
              contractType: values.contractType,
              signedAt: values.signedAt.format('YYYY-MM-DD'),
              startDate: values.startDate.format('YYYY-MM-DD'),
              endDate: requiresEndDate ? endDate : null,
              notes: values.notes?.trim() || undefined,
              ...salaryPayload,
            })
          : await createMutation.mutateAsync({
              employeeId: values.employeeId,
              contractType: values.contractType,
              signedAt: values.signedAt.format('YYYY-MM-DD'),
              startDate: values.startDate.format('YYYY-MM-DD'),
              endDate,
              notes: values.notes?.trim() || undefined,
              ...salaryPayload,
            });

      messageApi.success(
        isEdit
          ? t('hr.messages.employeeContractUpdated')
          : t('hr.messages.employeeContractCreated'),
      );
      router.push(`/hr/employee-contract/${result.id}`);
    } catch (error: unknown) {
      notifyApiError(
        error,
        isEdit
          ? t('hr.messages.failedToUpdateEmployeeContract')
          : t('hr.messages.failedToCreateEmployeeContract'),
        messageApi,
      );
    }
  }

  if (!canViewHr) {
    return (
      <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
    );
  }

  if (isEdit && detailQuery.isLoading && !detailQuery.data) {
    return (
      <div className="flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (isEdit && detailQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.employeeContractNotFound')
        }
        action={
          <Button onClick={() => router.push('/hr/employee-contract')}>
            {t('hr.buttons.backToList')}
          </Button>
        }
      />
    );
  }

  if (isEdit && detailQuery.data?.status !== 'ACTIVE') {
    return (
      <Alert
        type="error"
        showIcon
        title={t('hr.messages.cannotEditContract')}
        action={
          <Button
            onClick={() =>
              router.push(`/hr/employee-contract/${detailQuery.data?.id}`)
            }
          >
            {t('hr.buttons.back')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="m-0 text-xl font-semibold tracking-tight"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {isEdit
              ? t('pages.hr.employeeContract.edit')
              : t('pages.hr.employeeContract.new')}
          </h1>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('pages.hr.employeeContract.formDescription')}
          </p>
        </div>
        <Button
          onClick={() => router.push('/hr/employee-contract')}
          className="shrink-0"
          style={{ borderRadius: 0 }}
        >
          {t('common.cancel')}
        </Button>
      </div>

      <EmployeeContractForm
        mode={isEdit ? 'edit' : 'create'}
        contract={isEdit ? detailQuery.data : undefined}
        isSubmitting={saving}
        submitLabel={
          isEdit ? t('hr.buttons.save') : t('hr.buttons.createContract')
        }
        onSubmit={handleSubmit}
        formId="employee-contract-form"
        showFooterActions={false}
      />

      <FormPageFooter
        submitLabel={
          isEdit ? t('hr.buttons.save') : t('hr.buttons.createContract')
        }
        formId="employee-contract-form"
        useFormAttribute
        isSubmitting={saving}
      />
    </div>
  );
}
