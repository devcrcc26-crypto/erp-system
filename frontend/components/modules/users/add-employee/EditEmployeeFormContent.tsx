'use client';

import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useUser } from '@/lib/query/users';

export default function EditEmployeeFormContent({
  userId,
}: {
  userId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const userQuery = useUser(userId);

  useSetHeaderExtra(null);

  function handleSuccess(result: { userId: string; email: string | null }): void {
    const name = userQuery.data
      ? `${userQuery.data.firstName} ${userQuery.data.lastName}`
      : result.userId;
    messageApi.success(t('users.updated', { name }));
    router.push(`/users/${result.userId}`);
  }

  if (userQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          onClick={() => router.push(`/users/${userId}`)}
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('users.form.cancel')}
        </Button>
      </div>
      <AddEmployeeForm userId={userId} onSuccess={handleSuccess} />
    </div>
  );
}
