'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';

const FORM_ROOT = `erp-pro-list-page erp-users-page erp-employee-form-page erp-hr-travel-v2 ${DETAIL_PAGE_V2}`;

export default function AddEmployeeFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();

  function handleSuccess(result: { userId: string; email: string | null }): void {
    if (result.email) {
      messageApi.success(t('users.invitationSentBody', { email: result.email }));
    } else {
      messageApi.success(t('users.recordOnlyCreated'));
    }
    router.push('/users');
  }

  return (
    <div className={FORM_ROOT}>
      <HrFormPageShell
        title={t('pages.users.new')}
        description={t('users.form.addEmployeeDescription')}
        cancelLabel={t('users.form.cancel')}
        cancelHref="/users"
        backLabel={t('users.backToList')}
      >
        <AddEmployeeForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
