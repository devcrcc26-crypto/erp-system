'use client';

import { useState } from 'react';
import { Input, Modal, Switch, Tag } from 'antd';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useUpdateUser } from '@/lib/query/users';

const REASON_MAX = 500;

/** "Approver only" tag for list rows and the detail hero. */
export function ApproverOnlyTag(): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <Tag color="purple" className="!m-0">
      {t('users.approverOnly')}
    </Tag>
  );
}

interface EmployeeApproverOnlyFieldProps {
  userId: string;
  excluded: boolean;
  reason: string | null | undefined;
  /** users.edit - the same permission PATCH /users/:id requires. */
  canEdit: boolean;
}

/**
 * Approver only - excluded from HR processes. Read-only without users.edit.
 */
export default function EmployeeApproverOnlyField({
  userId,
  excluded,
  reason,
  canEdit,
}: EmployeeApproverOnlyFieldProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const updateUser = useUpdateUser();
  const [pending, setPending] = useState<boolean | null>(null);
  const [draftReason, setDraftReason] = useState('');

  function openConfirm(next: boolean): void {
    setDraftReason(next ? (reason ?? '') : '');
    setPending(next);
  }

  async function handleConfirm(): Promise<void> {
    if (pending === null) {
      return;
    }
    try {
      await updateUser.mutateAsync({
        userId,
        body: {
          excludedFromHrProcesses: pending,
          excludedReason: pending ? draftReason.trim() || null : null,
        },
      });
      messageApi.success(t('users.approverOnlyUpdated'));
      setPending(null);
    } catch (error) {
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.approverOnlyUpdateError'),
      );
    }
  }

  return (
    <div className="sm:col-span-2">
      <MetaItem label={t('users.approverOnlySwitch')}>
        <div className="flex flex-col items-start gap-1">
          {canEdit ? (
            <Switch
              checked={excluded}
              loading={updateUser.isPending}
              onChange={(next) => openConfirm(next)}
              aria-label={t('users.approverOnlySwitch')}
            />
          ) : excluded ? (
            <ApproverOnlyTag />
          ) : (
            <span>{t('common.no')}</span>
          )}
          {excluded && reason?.trim() ? (
            <span className="erp-users-cell-sub">{reason}</span>
          ) : null}
          <span className="erp-users-cell-sub">{t('users.approverOnlyHint')}</span>
        </div>
      </MetaItem>

      <Modal
        open={pending !== null}
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
        title={
          pending
            ? t('users.approverOnlyEnableTitle')
            : t('users.approverOnlyDisableTitle')
        }
        okText={t('common.save')}
        confirmLoading={updateUser.isPending}
        onOk={() => void handleConfirm()}
        onCancel={() => setPending(null)}
        destroyOnHidden
      >
        <p>{t('users.approverOnlyHint')}</p>
        {pending ? (
          <label className="flex flex-col gap-1">
            <span>{t('users.approverOnlyReason')}</span>
            <Input.TextArea
              value={draftReason}
              maxLength={REASON_MAX}
              rows={2}
              placeholder={t('users.approverOnlyReasonPlaceholder')}
              onChange={(event) => setDraftReason(event.target.value)}
            />
          </label>
        ) : null}
      </Modal>
    </div>
  );
}
