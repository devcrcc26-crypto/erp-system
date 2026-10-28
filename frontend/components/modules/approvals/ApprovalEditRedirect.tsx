'use client';

import { useEffect } from 'react';
import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useApprovalRequest } from '@/lib/query/approvals';
import { useCurrentUser } from '@/lib/query/profile';
import {
  canEditOwnRequest,
  editRequestHref,
} from '@/lib/utils/request-edit';

/**
 * `/approvals/:id/edit` - resolves an approval request to its module's edit
 * page (list rows only know the approval id, not the source record).
 */
export default function ApprovalEditRedirect({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const detailQuery = useApprovalRequest(requestId);
  const request = detailQuery.data;

  const target =
    request &&
    canEditOwnRequest(request.status, request.requestedBy, currentUser.data?.id)
      ? editRequestHref(
          request.categoryCode ?? request.category?.code,
          request.sourceId,
          request.id,
        )
      : null;

  useEffect(() => {
    if (target) {
      router.replace(target);
    }
  }, [router, target]);

  if (detailQuery.isLoading || currentUser.isLoading || target) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  return (
    <ErpNotice
      tone="warning"
      title={
        detailQuery.isError
          ? t('pages.approvals.edit.loadFailed')
          : t('pages.approvals.edit.cannotEdit')
      }
      action={
        <Button onClick={() => router.push(`/approvals/${requestId}`)}>
          {t('hr.buttons.back')}
        </Button>
      }
    />
  );
}
