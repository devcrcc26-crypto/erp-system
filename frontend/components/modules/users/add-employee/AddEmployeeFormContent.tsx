'use client';

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

  useSetHeaderExtra(null);

  function handleSuccess(result: { userId: string; email: string | null }): void {
    if (result.email) {
      messageApi.success(t('users.invitationSentBody', { email: result.email }));
    } else {
      messageApi.success(t('users.recordOnlyCreated'));
    }
    router.push('/users');
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
            onClick={() => router.push('/users')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('users.form.cancel')}
          </Button>
      </div>
      <AddEmployeeForm onSuccess={handleSuccess} />
    </div>
  );
}
