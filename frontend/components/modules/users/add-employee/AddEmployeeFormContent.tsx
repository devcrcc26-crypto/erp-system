'use client';

import { useMemo } from 'react';
import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

export default function AddEmployeeFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();

  const headerExtra = useMemo(
    () => (
      <Button onClick={() => router.push('/users')} style={{ borderRadius: 8 }}>
        {t('users.form.cancel')}
      </Button>
    ),
    [router, t],
  );
  useSetHeaderExtra(headerExtra);

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
      <AddEmployeeForm onSuccess={handleSuccess} />
    </div>
  );
}
