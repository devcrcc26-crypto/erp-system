'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
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
    <FormLayout
      title={t('users.addEmployee')}
      description={t('users.form.addEmployeeDescription')}
      extra={
        <Button onClick={() => router.push('/users')}>{t('users.form.cancel')}</Button>
      }
    >
      <AddEmployeeForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
