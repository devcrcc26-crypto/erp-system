'use client';

import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCurrentUser } from '@/lib/query/profile';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { canEditOwnRequest } from '@/lib/utils/request-edit';

/**
 * Loading / error / not-editable states shared by employee edit pages.
 * Renders children only for the owner of a DRAFT or RETURNED request; the
 * backend enforces the same rule.
 */
export default function RequestEditGate({
  isLoading,
  error,
  status,
  ownerId,
  backHref,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  status: string | null | undefined;
  ownerId: string | null | undefined;
  backHref: string;
  children: () => React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const currentUser = useCurrentUser();

  if (isLoading || currentUser.isLoading) {
    return (
      <div className="erp-pro-card p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const back = (
    <Button onClick={() => router.push(backHref)}>{t('hr.buttons.back')}</Button>
  );

  if (error || !status) {
    return (
      <ErpNotice
        tone="error"
        title={getFriendlyApiErrorMessage(
          error,
          t('pages.approvals.edit.loadFailed'),
          t,
        )}
        action={back}
      />
    );
  }

  if (!canEditOwnRequest(status, ownerId, currentUser.data?.id)) {
    return (
      <ErpNotice
        tone="warning"
        title={t('pages.approvals.edit.cannotEdit')}
        action={back}
      />
    );
  }

  return children();
}
