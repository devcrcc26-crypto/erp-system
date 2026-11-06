'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useState } from 'react';
import { Alert, Modal, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import AddEmployeeForm from '@/components/modules/users/add-employee/AddEmployeeForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';

const FORM_ROOT = `erp-pro-list-page erp-users-page erp-employee-form-page erp-hr-travel-v2 ${DETAIL_PAGE_V2}`;

export default function AddEmployeeFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [tempPasswordModal, setTempPasswordModal] = useState<{
    temporaryPassword: string;
  } | null>(null);

  function handleSuccess(result: {
    userId: string;
    email: string | null;
    temporaryPassword?: string;
  }): void {
    if (result.temporaryPassword) {
      setTempPasswordModal({ temporaryPassword: result.temporaryPassword });
      return;
    }
    if (result.email) {
      messageApi.success(t('users.invitationSentBody', { email: result.email }));
    } else {
      messageApi.success(t('users.recordOnlyCreated'));
    }
    router.push('/users');
  }

  function closeTempPasswordModal(): void {
    setTempPasswordModal(null);
    messageApi.success(t('users.temporaryPasswordCreated'));
    router.push('/users');
  }

  return (
    <div className={`${FORM_ROOT} min-w-0 max-w-full`}>
      <HrFormPageShell
        title={t('pages.users.new')}
        description={t('users.form.addEmployeeDescription')}
        cancelLabel={t('users.form.cancel')}
        cancelHref="/users"
        backLabel={t('users.backToList')}
        showCancelButton={false}
      >
        <AddEmployeeForm
          onSuccess={handleSuccess}
          onCancel={() => router.push('/users')}
          cancelLabel={t('users.form.cancel')}
        />
      </HrFormPageShell>

      <Modal
        open={Boolean(tempPasswordModal)}
        title={t('users.employment.temporaryPasswordTitle')}
        okText={t('common.close')}
        cancelButtonProps={{ style: { display: 'none' } }}
        onOk={closeTempPasswordModal}
        onCancel={closeTempPasswordModal}
        mask={{ closable: false }}
        destroyOnHidden
        width={{ xs: '100%', sm: 480 }}
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        {tempPasswordModal ? (
          <Alert
            type="success"
            showIcon
            title={t('users.employment.temporaryPasswordTitle')}
            description={
              <div className="flex flex-col gap-2">
                <Typography.Text code copyable className="text-base">
                  {tempPasswordModal.temporaryPassword}
                </Typography.Text>
                <span>{t('users.employment.temporaryPasswordHint')}</span>
              </div>
            }
          />
        ) : null}
      </Modal>
    </div>
  );
}
