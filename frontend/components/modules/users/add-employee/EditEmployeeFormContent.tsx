'use client';

import { useMemo } from 'react';
import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useUser } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';

export default function EditEmployeeFormContent({
  userId,
}: {
  userId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const userQuery = useUser(userId);

  const headerExtra = useMemo(
    () => (
      <Button
        onClick={() => router.push(`/users/${userId}`)}
        style={{ borderRadius: 2 }}
      >
        {t('users.form.cancel')}
      </Button>
    ),
    [router, t, userId],
  );
  useSetHeaderExtra(headerExtra);

  function handleSuccess(result: { userId: string; email: string | null }): void {
    const name = userQuery.data
      ? `${userQuery.data.firstName} ${userQuery.data.lastName}`
      : result.userId;
    messageApi.success(t('users.updated', { name }));
    router.push(`/users/${result.userId}`);
  }

  if (userQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <p
        className="mb-4 mt-0 text-[14px] leading-relaxed"
        style={{ color: tokens.colorTextSecondary, fontFamily: tokens.fontFamily }}
      >
        {userQuery.data
          ? `${userQuery.data.firstName} ${userQuery.data.lastName}${
              userQuery.data.email ? ` · ${userQuery.data.email}` : ''
            }`
          : t('users.form.editEmployeeDescription')}
      </p>
      <AddEmployeeForm userId={userId} onSuccess={handleSuccess} />
      {canViewHr ? (
        <div className="mt-6">
          <EmployeePerDiemRatesSection employeeId={userId} editable />
        </div>
      ) : null}
    </div>
  );
}
