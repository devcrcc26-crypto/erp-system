// UI polish pass - styles only, no logic changes

'use client';

import { useState } from 'react';
import { Alert, Select } from 'antd';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ReviewInboxTable from '@/components/modules/projects/review/ReviewInboxTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewReviewInbox,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';

const TIER_KEYS = [
  'ALL',
  'DISCIPLINE_OWNER',
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
] as const;

export default function ReviewInboxPageContent({
  projectId,
}: {
  projectId?: string;
} = {}): React.ReactNode {
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const { t } = useEpcTranslation();
  const capabilitiesReady = !usePermissionsLoading();
  const canViewReviewInbox = useCanViewReviewInbox();

  if (!capabilitiesReady) {
    return <PageLoadingSkeleton />;
  }

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
      <ReviewInboxTable projectId={projectId} tierFilter={tierFilter} />
    </FormLayout>
  );
}
