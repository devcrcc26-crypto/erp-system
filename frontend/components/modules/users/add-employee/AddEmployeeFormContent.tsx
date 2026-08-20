'use client';

import { useMemo } from 'react';
import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { tokens } from '@/lib/theme/tokens';

export default function AddEmployeeFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();

  const headerExtra = useMemo(
    () => (
      <Button onClick={() => router.push('/users')} style={{ borderRadius: 2 }}>
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
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <p
        className="mb-4 mt-0 text-[14px] leading-relaxed"
        style={{ color: tokens.colorTextSecondary, fontFamily: tokens.fontFamily }}
      >
        {t('users.form.addEmployeeDescription')}
      </p>
      <AddEmployeeForm onSuccess={handleSuccess} />
    </div>
  );
}
