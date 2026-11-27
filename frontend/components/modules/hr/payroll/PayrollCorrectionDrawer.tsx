'use client';

import { Drawer, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollCorrectionLine } from '@/lib/api/payroll-adjustments';
import type { PayrollEntryDetail } from '@/lib/api/payroll.types';
import { usePayrollCorrectionLines } from '@/lib/query/payroll-adjustments';
import { formatPayrollMoney, parsePayrollMoney } from '@/lib/utils/payroll-display';
import { formatUserName } from '@/lib/utils/user-display';

const KEY = 'hr.payroll.correctionLines';

/** Signed money with an explicit + for increases. */
function signed(value: number): string {
  if (Math.abs(value) < 0.005) {
    return '0.00';
  }
  const text = formatPayrollMoney(Math.abs(value), { emptyZero: false });
  return value > 0 ? `+${text}` : `−${text}`;
}

/**
 * Correction run: one employee's paid vs corrected amount for every payroll
 * component, with the non-zero differences highlighted.
 */
export default function PayrollCorrectionDrawer({
  runId,
  entry,
  onClose,
}: {
  runId: string;
  entry: PayrollEntryDetail | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const linesQuery = usePayrollCorrectionLines(runId, entry?.employeeId ?? null, entry !== null);
  const lines = linesQuery.data ?? [];
  const net = parsePayrollMoney(entry?.deltaAmount ?? 0);

  const columns: ColumnsType<PayrollCorrectionLine> = [
    {
      title: t(`${KEY}.component`),
      dataIndex: 'component',
      render: (component: string) => t(`${KEY}.components.${component}`),
    },
    {
      title: t(`${KEY}.paid`),
      dataIndex: 'paidAmount',
      align: 'right',
      width: 120,
      render: (value: number) => (
        <span className="erp-payroll-num">{formatPayrollMoney(value, { emptyZero: false })}</span>
      ),
    },
    {
      title: t(`${KEY}.corrected`),
      dataIndex: 'correctedAmount',
      align: 'right',
      width: 120,
      render: (value: number) => (
        <span className="erp-payroll-num">{formatPayrollMoney(value, { emptyZero: false })}</span>
      ),
    },
    {
      title: t(`${KEY}.difference`),
      dataIndex: 'difference',
      align: 'right',
      width: 120,
      render: (value: number) => (
        <span className={`erp-payroll-num${Math.abs(value) >= 0.005 ? ' font-semibold' : ' erp-payroll-num--muted'}`}>
          {signed(value)}
        </span>
      ),
    },
  ];

  return (
    <Drawer
      open={entry !== null}
      onClose={onClose}
      size={640}
      destroyOnHidden
      rootClassName="erp-pe-drawer erp-payroll-modal"
      title={entry ? t(`${KEY}.drawerTitle`, { name: formatUserName(entry.employee) }) : ''}
    >
      {entry ? (
        <div className="erp-payroll-correction-net">
          <span>{t(`${KEY}.netDifference`)}</span>
          <strong className="erp-payroll-num">{signed(net)} ETB</strong>
        </div>
      ) : null}
      {linesQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table<PayrollCorrectionLine>
          rowKey="component"
          size="small"
          columns={columns}
          dataSource={lines}
          pagination={false}
          rowClassName={(row) =>
            Math.abs(row.difference) >= 0.005 ? 'erp-payroll-diff-row' : ''
          }
          locale={{ emptyText: t(`${KEY}.unchanged`) }}
        />
      )}
    </Drawer>
  );
}
