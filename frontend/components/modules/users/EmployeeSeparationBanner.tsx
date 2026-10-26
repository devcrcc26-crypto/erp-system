'use client';

import { useState } from 'react';
import { Alert, Button, Tooltip } from 'antd';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmploymentState } from '@/lib/api/employment';
import { useCancelSeparation } from '@/lib/query/employment';

/** Shows a scheduled or effective separation, with cancel for HR. */
export default function EmployeeSeparationBanner({
  userId,
  employment,
  canManage,
}: {
  userId: string;
  employment: EmploymentState;
  canManage: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const cancel = useCancelSeparation(userId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const separation = employment.separation;
  if (!separation) {
    return null;
  }

  const typeLabel = separation.separationType
    ? t(`users.separation.types.${separation.separationType}`)
    : '';
  const cancelButton = canManage ? (
    <Tooltip title={separation.canCancel ? undefined : separation.cancelBlockedReason}>
      <Button
        size="small"
        disabled={!separation.canCancel}
        onClick={() => setConfirmOpen(true)}
      >
        {t('users.separation.cancel')}
      </Button>
    </Tooltip>
  ) : null;

  return (
    <>
      <Alert
        type={separation.effective ? 'error' : 'warning'}
        showIcon
        className="mx-4 mb-4 sm:mx-6"
        title={
          separation.effective
            ? t('users.separation.bannerSeparated', {
                date: separation.leavingDate,
                type: typeLabel,
              })
            : t('users.separation.bannerScheduled', {
                date: separation.leavingDate,
                type: typeLabel,
              })
        }
        description={separation.reason ?? undefined}
        action={cancelButton}
      />
      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={confirmOpen}
        title={t('users.separation.cancelTitle')}
        description={t('users.separation.cancelDescription')}
        confirmLabel={t('users.separation.cancel')}
        confirmLoading={cancel.isPending}
        onConfirm={() => {
          void (async () => {
            try {
              await cancel.mutateAsync();
              messageApi.success(t('users.separation.cancelled'));
              setConfirmOpen(false);
            } catch (error) {
              messageApi.error(
                error instanceof ApiRequestError
                  ? error.message
                  : t('users.separation.saveError'),
              );
            }
          })();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
