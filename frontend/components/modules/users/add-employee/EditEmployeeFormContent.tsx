'use client';

import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
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
  const userQuery = useUser(userId);

  function handleSuccess(result: { userId: string; email: string | null }): void {
    const name = userQuery.data
      ? `${userQuery.data.firstName} ${userQuery.data.lastName}`
      : result.userId;
    messageApi.success(t('users.updated', { name }));
    router.push(`/users/${result.userId}`);
  }

  function handleCancel(): void {
    router.push(`/users/${userId}`);
  }

  if (userQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1
            className="m-0 truncate text-[20px] font-semibold leading-tight tracking-tight"
            style={{ color: tokens.colorTextPrimary, fontFamily: tokens.fontFamily }}
          >
            {t('users.updateEmployee')}
          </h1>
          <p
            className="mt-1 text-[14px] leading-relaxed"
            style={{ color: tokens.colorTextSecondary, fontFamily: tokens.fontFamily }}
          >
            {userQuery.data
              ? `${userQuery.data.firstName} ${userQuery.data.lastName}${
                  userQuery.data.email ? ` · ${userQuery.data.email}` : ''
                }`
              : t('users.form.editEmployeeDescription')}
          </p>
        </div>
        <Button onClick={handleCancel} style={{ borderRadius: 2 }}>
          {t('users.form.cancel')}
        </Button>
      </div>
      <AddEmployeeForm userId={userId} onSuccess={handleSuccess} />
    </div>
  );
}
