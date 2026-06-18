'use client';

import { Alert } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Explains that package/discipline aggregate badges may lag until projection commits.
 */
export default function ProjectionLagHelper({
  pending,
}: {
  pending?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (!pending) {
    return (
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title={t('projection.lagInfoTitle')}
        description={t('projection.lagInfoDescription')}
      />
    );
  }

  return (
    <Alert
      type="warning"
      showIcon
      className="mb-4"
      title={t('projection.lagPendingTitle')}
      description={t('projection.lagPendingDescription')}
    />
  );
}
