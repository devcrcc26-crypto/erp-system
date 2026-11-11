'use client';

import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { EdvStatus } from '@/lib/api/epc.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { EDV_STATUS_VARIANTS } from '@/lib/utils/epc-display';

export default function EdvStatusBadge({
  status,
}: {
  status: EdvStatus | string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const normalized = status as EdvStatus;
  const variant = EDV_STATUS_VARIANTS[normalized] ?? 'default';
  const label = t(`edvStatus.${normalized}`);

  return <StatusBadge label={label} variant={variant} />;
}
