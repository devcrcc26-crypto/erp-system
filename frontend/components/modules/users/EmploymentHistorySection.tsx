'use client';

import { Table, Tag } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { EmploymentState, InactivePeriod } from '@/lib/api/employment';
import { useInactivePeriods } from '@/lib/query/employment';

/**
 * Employment periods (hire → leaving) and inactive periods, newest first.
 * Rendered in a flush section body: both tables run edge to edge, the
 * inactive table under its own sub-header strip.
 */
export default function EmploymentHistorySection({
  userId,
  employment,
}: {
  userId: string;
  employment: EmploymentState;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const inactiveQuery = useInactivePeriods(userId);
  const periods = [...employment.periods].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );

  return (
    <div className="erp-employment-history">
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={periods}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('users.employment.noPeriods') }}
        columns={[
          {
            title: t('users.employment.periodStart'),
            dataIndex: 'startDate',
          },
          {
            title: t('users.employment.periodEnd'),
            dataIndex: 'endDate',
            render: (value: string | null) =>
              value ?? (
                <Tag
                  color="green"
                  className="m-0 rounded-full border-0 px-2.5 py-0.5 text-xs font-medium"
                >
                  {t('users.employment.current')}
                </Tag>
              ),
          },
          {
            title: t('users.separation.type'),
            dataIndex: 'separationType',
            render: (value: string | null) =>
              value ? t(`users.separation.types.${value}`) : '-',
          },
          {
            title: t('users.separation.reason'),
            dataIndex: 'separationReason',
            render: (value: string | null) => value ?? '-',
          },
        ]}
      />
      <div className="erp-employment-history-block">
        <h4 className="erp-employment-history-subtitle">
          {t('users.employment.inactiveHistory')}
        </h4>
        <Table<InactivePeriod>
          size="small"
          rowKey="id"
          pagination={false}
          loading={inactiveQuery.isLoading}
          dataSource={inactiveQuery.data ?? []}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: t('users.employment.noInactive') }}
          columns={[
            {
              title: t('users.employment.inactiveType'),
              dataIndex: 'type',
              render: (value: InactivePeriod['type']) =>
                t(`users.employment.inactiveTypes.${value}`),
            },
            { title: t('users.employment.from'), dataIndex: 'fromDate' },
            {
              title: t('users.employment.to'),
              dataIndex: 'toDate',
              render: (value: string | null) => value ?? t('users.employment.openEnded'),
            },
            { title: t('users.separation.reason'), dataIndex: 'reason' },
          ]}
        />
      </div>
    </div>
  );
}
