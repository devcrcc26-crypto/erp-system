'use client';

import { Alert } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Shown only while aggregate status projection is still running.
 */
export default function ProjectionLagHelper({
  pending,
}: {
  pending?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (!pending) {
    return null;
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
