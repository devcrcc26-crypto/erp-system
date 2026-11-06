'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useUser } from '@/lib/query/users';
import { formatUserName } from '@/lib/utils/user-display';

const FORM_ROOT = `erp-pro-list-page erp-users-page erp-employee-form-page erp-hr-travel-v2 ${DETAIL_PAGE_V2}`;

export default function EditEmployeeFormContent({
  userId,
}: {
  userId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const userQuery = useUser(userId);

  function handleSuccess(result: {
    userId: string;
    email: string | null;
    loginNameUnchangedToast?: string | null;
  }): void {
    const name = userQuery.data
      ? formatUserName(userQuery.data)
      : result.userId;
    messageApi.success(t('users.updated', { name }));
    if (result.loginNameUnchangedToast) {
      messageApi.warning(result.loginNameUnchangedToast);
    }
    router.push(`/users/${result.userId}`);
  }

  if (userQuery.isLoading) {
    return (
      <div className={`${FORM_ROOT} min-w-0 max-w-full`}>
        <div className="erp-pro-card p-4 sm:p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`${FORM_ROOT} min-w-0 max-w-full`}>
      <HrFormPageShell
        title={t('pages.users.edit')}
        description={t('users.form.editEmployeeDescription')}
        cancelLabel={t('users.form.cancel')}
        cancelHref={`/users/${userId}`}
        backLabel={t('users.backToList')}
        showCancelButton={false}
      >
        <AddEmployeeForm
          userId={userId}
          onSuccess={handleSuccess}
          onCancel={() => router.push(`/users/${userId}`)}
          cancelLabel={t('users.form.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
