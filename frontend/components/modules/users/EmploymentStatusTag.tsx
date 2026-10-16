'use client';

import { Tag } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { EmploymentState } from '@/lib/api/employment';

/** Active / Inactive (type, dates) / Separated (date, type). */
export default function EmploymentStatusTag({
  employment,
}: {
  employment: EmploymentState;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (employment.employmentStatus === 'SEPARATED') {
    const separation = employment.separation;
    return (
      <Tag color="red" className="m-0">
        {t('users.employment.statusSeparated', {
          date: separation?.leavingDate ?? '-',
          type: separation?.separationType
            ? t(`users.separation.types.${separation.separationType}`)
            : '-',
        })}
      </Tag>
    );
  }

  const inactive = employment.inactive;
  if (inactive?.current) {
    return (
      <Tag color="orange" className="m-0">
        {t('users.employment.statusInactive', {
          type: t(`users.employment.inactiveTypes.${inactive.type}`),
          from: inactive.fromDate,
          to: inactive.toDate ?? t('users.employment.openEnded'),
        })}
      </Tag>
    );
  }

  return (
    <Tag color="green" className="m-0">
      {t('users.employment.statusActive')}
    </Tag>
  );
}
