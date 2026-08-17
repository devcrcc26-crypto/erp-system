'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import EmployeeContractForm from '@/components/modules/hr/employee-contract/EmployeeContractForm';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { EmployeeContractDetail } from '@/lib/api/employee-contract.types';
import { useEmployeeContract } from '@/lib/query/employee-contract';

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

  if (isEdit && detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (isEdit && (detailQuery.isError || !detailQuery.data)) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('hr.messages.employeeContractNotFound')}
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
    <FormLayout
      title={
        isEdit
          ? t('hr.buttons.editEmployeeContract')
          : t('hr.buttons.newEmployeeContract')
      }
      description={t('pages.hr.employeeContract.formDescription')}
      extra={
        <Button onClick={() => router.push('/hr/employee-contract')}>
          {t('hr.buttons.cancel')}
        </Button>
      }
    >
      <EmployeeContractForm
        mode={isEdit ? 'edit' : 'create'}
        contract={isEdit ? detailQuery.data : undefined}
        onSuccess={handleSuccess}
      />
    </FormLayout>
  );
}
