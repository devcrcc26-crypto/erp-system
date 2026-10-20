'use client';

import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BusinessTripHostFields } from '@/lib/utils/business-trip-host-display';

export default function BusinessTripHostMetaItems({
  trip,
}: {
  trip: BusinessTripHostFields;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (
    !trip.hostOrganization?.trim() &&
    !trip.hostContactName?.trim() &&
    !trip.hostContactPhone?.trim() &&
    !trip.hostContactEmail?.trim()
  ) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {trip.hostOrganization?.trim() ? (
        <MetaItem label={t('hr.form.hostOrganizationName')}>
          <span className="erp-users-cell-strong">{trip.hostOrganization}</span>
        </MetaItem>
      ) : null}
      {trip.hostContactName?.trim() ? (
        <MetaItem label={t('hr.form.hostContactName')}>
          {trip.hostContactName}
        </MetaItem>
      ) : null}
      {trip.hostContactPhone?.trim() ? (
        <MetaItem label={t('hr.form.hostContactPhone')}>
          {trip.hostContactPhone}
        </MetaItem>
      ) : null}
      {trip.hostContactEmail?.trim() ? (
        <MetaItem label={t('hr.form.hostContactEmail')}>
          {trip.hostContactEmail}
        </MetaItem>
      ) : null}
    </div>
  );
}
