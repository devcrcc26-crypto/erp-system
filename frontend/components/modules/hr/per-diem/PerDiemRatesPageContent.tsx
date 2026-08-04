'use client';

import { useState } from 'react';
import { Alert, Button, Switch } from 'antd';
import { PlusOutlined, WalletOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Pencil, Trash2 } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import TableEmptyState from '@/components/ui/TableEmptyState';
import PerDiemRateFormDrawer from '@/components/modules/hr/per-diem/PerDiemRateFormDrawer';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanManagePerDiemRates } from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { PerDiemRate } from '@/lib/api/per-diem.types';
import { useDeletePerDiemRate, usePerDiemRates } from '@/lib/query/per-diem';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * HR configuration page — per diem destination rate management.
 */
export default function PerDiemRatesPageContent(): React.ReactNode {
  const messageApi = useAppMessage();
  const canManage = useCanManagePerDiemRates();
  const listQuery = usePerDiemRates(canManage);
  const deleteMutation = useDeletePerDiemRate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<PerDiemRate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function openCreate(): void {
    setEditingRate(null);
    setDrawerOpen(true);
  }

  function openEdit(rate: PerDiemRate): void {
    setEditingRate(rate);
    setDrawerOpen(true);
  }

  async function handleDelete(): Promise<void> {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      messageApi.success('Rate deleted');
      setDeleteId(null);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to delete rate', messageApi);
    }
  }

  if (!canManage) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to per diem rate configuration."
      />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  const columns: ColumnsType<PerDiemRate> = [
    {
      title: 'Destination Category',
      dataIndex: 'destinationCategory',
      key: 'destinationCategory',
    },
    {
      title: 'Daily Rate',
      key: 'dailyRate',
      width: 160,
      render: (_: unknown, row: PerDiemRate) =>
        formatCurrencyAmount(row.dailyRate, row.currency),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string | null) => value || '—',
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (value: boolean) => <Switch checked={value} disabled size="small" />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      render: (_: unknown, row: PerDiemRate) => (
        <div className="flex items-center gap-1">
          <Button
            type="text"
            size="small"
            icon={<Pencil size={14} />}
            onClick={() => openEdit(row)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<Trash2 size={14} />}
            onClick={() => setDeleteId(row.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load per diem rates'
          }
        />
      ) : null}

      <div className="flex items-center justify-end mb-4">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Rate
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<PerDiemRate>
          rowKey="id"
          columns={columns}
          dataSource={listQuery.data ?? []}
          loading={listQuery.isFetching}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<WalletOutlined />}
                title="No per diem rates configured"
                description="Add a rate to enable per diem submissions for that destination category."
              />
            ),
          }}
          pagination={false}
        />
      </div>

      <PerDiemRateFormDrawer
        open={drawerOpen}
        editingRate={editingRate}
        onClose={() => {
          setDrawerOpen(false);
          setEditingRate(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete per diem rate?"
        description="This rate will no longer be available for new per diem requests."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
