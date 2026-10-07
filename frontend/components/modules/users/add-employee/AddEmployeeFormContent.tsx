'use client';

import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';

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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
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
