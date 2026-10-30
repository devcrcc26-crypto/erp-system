'use client';

import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  EmployeeContractListItem,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import { useEmployeeContractsAll } from '@/lib/query/employee-contract';
import {
  employeeContractStatusVariant,
  formatEmployeeContractStatus,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Read-only list of one employee's contracts on their profile (HR and the
 * employee's supervisors). Each row opens the contract; changing contracts
 * stays on the HR contract pages.
 */
export default function EmployeeContractsSection({
  employeeId,
}: {
  employeeId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const query = useEmployeeContractsAll({ employeeId }, Boolean(employeeId));

  const columns: ColumnsType<EmployeeContractListItem> = useMemo(
    () => [
      {
        title: t('hr.table.contractNumber'),
        dataIndex: 'contractNumber',
        key: 'contractNumber',
        width: 140,
        render: (value: string) => <span className="erp-users-id-chip">{value}</span>,
      },
      {
        title: t('hr.table.contractType'),
        dataIndex: 'contractType',
        key: 'contractType',
        responsive: ['md'],
        render: (value: EmployeeContractType) => (
          <span className="erp-users-cell-strong">{formatEmployeeContractType(value, t)}</span>
        ),
      },
      {
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        render: (value: string | undefined) => (
          <span className="erp-users-cell-sub">
            {value ? formatProjectDate(value) : t('hr.labels.openEnded')}
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: EmployeeContractListItem['status']) => (
          <StatusBadge
            label={formatEmployeeContractStatus(value, t)}
            variant={employeeContractStatusVariant(value)}
          />
        ),
      },
    ],
    [t],
  );

  if (query.isError) {
    return (
      <ErpNotice
        tone="error"
        title={getFriendlyApiErrorMessage(query.error, t('users.contractsLoadFailed'), t)}
      />
    );
  }

  return (
    <div className="erp-pro-card">
      <div className="erp-pro-table-card-body">
        <DataTable<EmployeeContractListItem>
          rowKey="id"
          className="erp-pro-table erp-users-table"
          size="middle"
          columns={columns}
          dataSource={query.data ?? []}
          loading={query.isLoading}
          scroll={{ x: 640 }}
          onRow={(row) => ({
            onClick: () => router.push(`/hr/employee-contract/${row.id}`),
            className: 'cursor-pointer',
          })}
          locale={{
            emptyText: (
              <TableEmptyState icon={<FileText />} title={t('users.contractsEmpty')} />
            ),
          }}
          pagination={false}
        />
      </div>
    </div>
  );
}
