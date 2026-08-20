'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { tokens } from '@/lib/theme/tokens';

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
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1
            className="truncate text-[20px] font-semibold tracking-tight leading-tight m-0"
            style={{ color: tokens.colorTextPrimary, fontFamily: tokens.fontFamily }}
          >
            {t('users.addEmployee')}
          </h1>
          <p
            className="mt-1 text-[14px] leading-relaxed"
            style={{ color: tokens.colorTextSecondary, fontFamily: tokens.fontFamily }}
          >
            {t('users.form.addEmployeeDescription')}
          </p>
        </div>
        <Button onClick={() => router.push('/users')} style={{ borderRadius: 2 }}>
          {t('users.form.cancel')}
        </Button>
      </div>
      <AddEmployeeForm onSuccess={handleSuccess} />
    </div>
  );
}
