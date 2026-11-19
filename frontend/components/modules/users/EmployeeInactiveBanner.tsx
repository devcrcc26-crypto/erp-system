'use client';

import { Button } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import EmploymentAttachmentsList from '@/components/modules/users/EmploymentAttachmentsList';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { EmploymentState } from '@/lib/api/employment';

/** Shows the current or upcoming inactive period with optional reactivate. */
export default function EmployeeInactiveBanner({
  userId,
  inactive,
  canManage,
  onReactivate,
}: {
  userId: string;
  inactive: NonNullable<EmploymentState['inactive']>;
  canManage: boolean;
  onReactivate: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const typeLabel = t(`users.employment.inactiveTypes.${inactive.type}`);
  const toLabel = inactive.toDate ?? t('users.employment.openEnded');

  return (
    <ErpNotice
      className="mb-4"
      tone="warning"
      title={
        inactive.current
          ? t('users.employment.bannerInactive', {
              type: typeLabel,
              from: inactive.fromDate,
              to: toLabel,
            })
          : t('users.employment.bannerInactiveUpcoming', {
              type: typeLabel,
              from: inactive.fromDate,
              to: toLabel,
            })
      }
      description={
        <>
          {inactive.reason ? <p>{inactive.reason}</p> : null}
          <EmploymentAttachmentsList
            userId={userId}
            attachments={inactive.attachments ?? []}
          />
        </>
      }
      action={
        canManage ? (
          <Button size="small" icon={<PlayCircleOutlined />} onClick={onReactivate}>
            {t('users.employment.reactivate')}
          </Button>
        ) : null
      }
    />
  );
}
