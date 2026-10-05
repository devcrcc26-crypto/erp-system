'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import PageHeader from '@/components/ui/PageHeader/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { SiteAssignmentListItem, SiteAssignmentStatus } from '@/lib/api/site-assignment.types';
import { useSiteAssignments } from '@/lib/query/site-assignment';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const STATUS_OPTIONS: SiteAssignmentStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
];

function statusVariant(
  status: SiteAssignmentStatus,
): 'approved' | 'pending' | 'rejected' | 'draft' {
  if (status === 'APPROVED') {
    return 'approved';
  }
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return 'rejected';
  }
  if (status === 'SUBMITTED' || status === 'IN_REVIEW' || status === 'RETURNED') {
    return 'pending';
  }
  return 'draft';
}

export default function SiteAssignmentsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const { page, limit, onChange } = useTablePagination();
  const [status, setStatus] = useState<SiteAssignmentStatus | undefined>();
  const [siteFilter, setSiteFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState<Dayjs | null>(null);

  const params = useMemo(
    () => ({
      page,
      limit,
      status,
      siteName: siteFilter.trim() || undefined,
      month: monthFilter?.month() != null ? monthFilter.month() + 1 : undefined,
      year: monthFilter?.year(),
    }),
    [page, limit, status, siteFilter, monthFilter],
  );

  const listQuery = useSiteAssignments(params);
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<SiteAssignmentListItem> = [
    {
      title: t('pages.hr.siteAssignments.columns.requestNumber'),
      dataIndex: 'requestNumber',
      width: 120,
    },
    {
      title: t('pages.hr.siteAssignments.columns.employee'),
      key: 'employee',
      render: (_, row) => formatUserName(row.employee),
    },
    {
      title: t('pages.hr.siteAssignments.columns.site'),
      dataIndex: 'siteName',
    },
    {
      title: t('pages.hr.siteAssignments.columns.project'),
      key: 'project',
      render: (_, row) =>
        row.project
          ? `${row.project.projectCode} — ${row.project.name}`
          : '—',
    },
    {
      title: t('pages.hr.siteAssignments.columns.start'),
      dataIndex: 'startDate',
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: t('pages.hr.siteAssignments.columns.end'),
      dataIndex: 'endDate',
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: t('pages.hr.siteAssignments.columns.days'),
      dataIndex: 'calendarDays',
      align: 'right',
      width: 80,
    },
    {
      title: t('pages.hr.siteAssignments.columns.status'),
      dataIndex: 'status',
      render: (value: SiteAssignmentStatus) => (
        <StatusBadge
          variant={statusVariant(value)}
          label={t(`pages.hr.siteAssignments.status.${value}`)}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('pages.hr.siteAssignments.title')}
        description={t('pages.hr.siteAssignments.description')}
        actions={
          <Button
            type="primary"
            onClick={() => router.push('/approvals/new/site-assignment')}
          >
            {t('pages.hr.siteAssignments.newRequest')}
          </Button>
        }
      />
      <DataTable
        rowKey="id"
        loading={listQuery.isLoading}
        columns={columns}
        dataSource={rows}
        onRow={(row) => ({
          onClick: () => router.push(`/hr/site-assignments/${row.id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: meta?.page ?? page,
          pageSize: meta?.limit ?? limit,
          total: meta?.total ?? 0,
          onChange,
        }}
        toolbar={
          <>
            <Select
              allowClear
              placeholder={t('pages.hr.siteAssignments.filters.status')}
              style={{ width: 160 }}
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS.map((s) => ({
                value: s,
                label: t(`pages.hr.siteAssignments.status.${s}`),
              }))}
            />
            <Input
              allowClear
              placeholder={t('pages.hr.siteAssignments.filters.site')}
              style={{ width: 180 }}
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
            />
            <DatePicker
              picker="month"
              placeholder={t('pages.hr.siteAssignments.filters.month')}
              value={monthFilter}
              onChange={setMonthFilter}
            />
          </>
        }
      />
    </>
  );
}
