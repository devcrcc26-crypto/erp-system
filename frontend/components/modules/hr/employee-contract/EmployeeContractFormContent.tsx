'use client';

import { Alert, Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import EmployeeContractForm from '@/components/modules/hr/employee-contract/EmployeeContractForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmployeeContractDetail } from '@/lib/api/employee-contract.types';
import { useEmployeeContract } from '@/lib/query/employee-contract';

/**
 * Full-page create / edit employee contract - stepper chrome like Add Employee.
 */
export default function EmployeeContractFormContent({
  contractId,
}: {
  contractId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const isEdit = Boolean(contractId);
  const detailQuery = useEmployeeContract(contractId ?? '', isEdit);

  function handleSuccess(result: EmployeeContractDetail): void {
    router.push(`/hr/employee-contract/${result.id}`);
  }

  if (!canViewHr) {
    return (
      <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
    );
  }

  if (isEdit && detailQuery.isLoading && !detailQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
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

  if (isEdit && detailQuery.data && !['ACTIVE', 'DRAFT'].includes(detailQuery.data.status)) {
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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-contract-form-page">
      <HrFormPageShell
        title={
          isEdit
            ? t('pages.hr.employeeContract.edit')
            : t('pages.hr.employeeContract.new')
        }
        description={t('pages.hr.employeeContract.formDescription')}
        cancelLabel={t('common.cancel')}
        cancelHref="/hr/employee-contract"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <EmployeeContractForm
          mode={isEdit ? 'edit' : 'create'}
          contract={isEdit ? detailQuery.data : undefined}
          onCancel={() => router.push('/hr/employee-contract')}
          cancelLabel={t('common.cancel')}
          onSuccess={handleSuccess}
        />
      </HrFormPageShell>
    </div>
  );
}
