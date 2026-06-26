'use client';

import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { DesignPackageStatus } from '@/lib/api/epc.types';
import {
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_VARIANTS,
} from '@/lib/utils/epc-display';

export default function PackageStatusBadge({
  status,
}: {
  status: DesignPackageStatus | string;
}): React.ReactNode {
  const normalized = status as DesignPackageStatus;
  const variant = PACKAGE_STATUS_VARIANTS[normalized] ?? 'default';
  const label = PACKAGE_STATUS_LABELS[normalized] ?? normalized.replace(/_/g, ' ');

  return <StatusBadge label={label} variant={variant} />;
}
