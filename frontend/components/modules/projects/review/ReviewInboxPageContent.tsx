'use client';

import { useState } from 'react';
import { Select } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewInboxTable from '@/components/modules/projects/review/ReviewInboxTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCanViewReviewInbox } from '@/hooks/use-pm-capabilities';
import { Alert } from 'antd';

const TIER_KEYS = [
  'ALL',
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
  'INSTITUTE_CHIEF',
] as const;

export default function ReviewInboxPageContent(): React.ReactNode {
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const { t } = useEpcTranslation();
  const canViewReviewInbox = useCanViewReviewInbox();

  if (!canViewReviewInbox) {
    return (
      <Alert type="warning" showIcon title="You do not have access to the review inbox." />
    );
  }

  return (
    <FormLayout
      title={t('pages.reviewInbox.title')}
      description={t('pages.reviewInbox.description')}
      extra={
        <Select
          value={tierFilter}
          onChange={setTierFilter}
          options={TIER_KEYS.map((key) => ({
            value: key,
            label: t(`reviewTier.${key}`),
          }))}
          className="w-44"
        />
      }
    >
      <ReviewInboxTable tierFilter={tierFilter} />
    </FormLayout>
  );
}
