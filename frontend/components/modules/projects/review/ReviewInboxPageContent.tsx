'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Select, Space } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewInboxTable from '@/components/modules/projects/review/ReviewInboxTable';

const TIER_OPTIONS = [
  { value: 'ALL', label: 'All tiers' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'DISCIPLINE_LEAD', label: 'Discipline lead' },
  { value: 'DEPT_CHIEF', label: 'Dept chief' },
  { value: 'INSTITUTE_CHIEF', label: 'Institute chief' },
];

export default function ReviewInboxPageContent(): React.ReactNode {
  const [tierFilter, setTierFilter] = useState('ALL');

  return (
    <FormLayout
      title="Review Inbox"
      description="Assigned review sessions with SLA tracking and tier filtering."
      extra={
        <Select
          value={tierFilter}
          onChange={setTierFilter}
          options={TIER_OPTIONS}
          className="w-44"
        />
      }
    >
      <ReviewInboxTable tierFilter={tierFilter} />
    </FormLayout>
  );
}
