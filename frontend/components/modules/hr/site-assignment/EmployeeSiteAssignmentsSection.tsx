'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { SiteAssignmentListItem } from '@/lib/api/site-assignment.types';
import { useEmployeeSiteAssignments } from '@/lib/query/site-assignment';
import { formatProjectDate } from '@/lib/utils/project-display';
import { siteAssignmentStatusVariant } from '@/lib/utils/site-assignment-display';

export default function EmployeeSiteAssignmentsSection({
  employeeId,
}: {
  employeeId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const query = useEmployeeSiteAssignments(employeeId);
  const rows = query.data ?? [];

  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">
          {t('pages.hr.siteAssignments.profileSectionTitle')}
        </h3>
        <Button
          type="link"
          onClick={() => router.push('/approvals/new/site-assignment')}
        >
          {t('pages.hr.siteAssignments.newRequest')}
        </Button>
      </div>
      <div className="erp-employee-section-body">
        <DataTable
          rowKey="id"
          loading={query.isLoading}
          pagination={false}
          dataSource={rows}
          onRow={(row) => ({
            onClick: () => router.push(`/hr/site-assignments/${row.id}`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: t('pages.hr.siteAssignments.columns.requestNumber'),
              dataIndex: 'requestNumber',
            },
            {
              title: t('pages.hr.siteAssignments.columns.site'),
              dataIndex: 'siteName',
            },
            {
              title: t('pages.hr.siteAssignments.columns.start'),
              dataIndex: 'startDate',
              render: (v: string) => formatProjectDate(v),
            },
            {
              title: t('pages.hr.siteAssignments.columns.end'),
              dataIndex: 'endDate',
              render: (v: string) => formatProjectDate(v),
            },
            {
              title: t('pages.hr.siteAssignments.columns.status'),
              dataIndex: 'status',
              render: (status: SiteAssignmentListItem['status']) => (
                <StatusBadge
                  variant={siteAssignmentStatusVariant(status)}
                  label={t(`pages.hr.siteAssignments.status.${status}`)}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
