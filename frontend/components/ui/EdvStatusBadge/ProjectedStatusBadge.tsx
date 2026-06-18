'use client';

import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type {
  DesignPackageProjectedStatus,
  TaskDisciplineProjectedStatus,
} from '@/lib/api/epc.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { PROJECTED_STATUS_VARIANTS } from '@/lib/utils/epc-display';

export default function ProjectedStatusBadge({
  status,
  pending,
}: {
  status: DesignPackageProjectedStatus | TaskDisciplineProjectedStatus | string;
  pending?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const normalized = status as DesignPackageProjectedStatus;
  const variant = PROJECTED_STATUS_VARIANTS[normalized] ?? 'default';
  const baseLabel = t(`projectedStatus.${normalized}`);
  const label = pending
    ? `${baseLabel} (${t('projectedStatus.updating')})`
    : baseLabel;

  return <StatusBadge label={label} variant={variant} />;
}
