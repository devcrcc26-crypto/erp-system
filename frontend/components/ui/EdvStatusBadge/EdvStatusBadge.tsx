'use client';

import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { EdvStatus } from '@/lib/api/epc.types';
import {
  EDV_STATUS_VARIANTS,
  formatEdvStatus,
} from '@/lib/utils/epc-display';

export default function EdvStatusBadge({
  status,
}: {
  status: EdvStatus | string;
}): React.ReactNode {
  const normalized = status as EdvStatus;
  const variant = EDV_STATUS_VARIANTS[normalized] ?? 'default';

  return (
    <StatusBadge label={formatEdvStatus(status)} variant={variant} />
  );
}
