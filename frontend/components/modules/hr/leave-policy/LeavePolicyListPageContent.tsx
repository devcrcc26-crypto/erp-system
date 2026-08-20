'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Space, Switch, Spin } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeavePolicy } from '@/lib/api/leave-policy.types';
import {
  useDeleteLeavePolicy,
  useLeavePolicyList,
  useRefreshLeaveBalances,
} from '@/lib/query/leave-policy';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * HR leave policy configuration list.
 */
export default function LeavePolicyListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const listQuery = useLeavePolicyList(canViewHr);
  const deleteMutation = useDeleteLeavePolicy();
  const refreshMutation = useRefreshLeaveBalances();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function handleDelete(): Promise<void> {
    if (!deleteId) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deleteId);
      messageApi.success(t('hr.leavePolicy.deleted'));
      setDeleteId(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.leavePolicy.deleteBlocked'),
        messageApi,
      );
    }
  }

  async function handleRefreshBalances(): Promise<void> {
    try {
      const result = await refreshMutation.mutateAsync(
        new Date().getFullYear(),
      );
      messageApi.success(
        t('hr.leavePolicy.refreshed', { count: result.refreshed }),
      );
    } catch (error: unknown) {
      notifyApiError(error, t('hr.leavePolicy.refreshFailed'), messageApi);
    }
  }

  const columns: ColumnsType<LeavePolicy> = useMemo(
    () => [
      {
        title: t('hr.leavePolicy.name'),
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: t('hr.leavePolicy.governedBy'),
        dataIndex: 'governedBy',
        key: 'governedBy',
        ellipsis: true,
        render: (value: string | null) => value || '—',
      },
      {
        title: t('hr.leavePolicy.rules'),
        dataIndex: 'ruleCount',
        key: 'ruleCount',
        width: 100,
        align: 'right',
      },
      {
        title: t('hr.leavePolicy.employees'),
        dataIndex: 'employeeCount',
        key: 'employeeCount',
        width: 120,
        align: 'right',
      },
      {
        title: t('hr.leavePolicy.isActive'),
        dataIndex: 'isActive',
        key: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <StatusBadge
            label={value ? t('common.active') : t('common.inactive')}
            variant={value ? 'success' : 'default'}
          />
        ),
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 100,
        render: (_: unknown, row: LeavePolicy) => (
          <Space size={4}>
            <Button
              type="text"
              size="small"
              icon={<Pencil size={14} />}
              onClick={() => router.push(`/hr/leave-policy/${row.id}/edit`)}
              aria-label={t('common.update')}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<Trash2 size={14} />}
              onClick={() => setDeleteId(row.id)}
              aria-label={t('common.delete')}
            />
          </Space>
        ),
      },
    ],
    [router, t],
  );

  if (!canViewHr) {
    return (
      <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page">
        <div className="erp-pro-card">
          <div className="flex justify-center p-12">
            <Spin />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.leavePolicy.loadError')
          }
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('hr.leavePolicy.deleteTitle')}
        description={t('hr.leavePolicy.deleteDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <h1
            className="erp-pro-card-toolbar-title"
            style={{ fontSize: 16, fontWeight: 600 }}
          >
            {t('hr.leavePolicy.listTitle')}
          </h1>
          <Space wrap size={8}>
            <Button
              icon={<ReloadOutlined />}
              loading={refreshMutation.isPending}
              onClick={() => void handleRefreshBalances()}
              style={{ borderRadius: 2 }}
            >
              {t('hr.leavePolicy.refreshBalances')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/hr/leave-policy/new')}
              style={{ borderRadius: 2 }}
            >
              {t('hr.leavePolicy.new')}
            </Button>
          </Space>
        </div>
        <div className="erp-pro-table-card-body">
          <DataTable<LeavePolicy>
            rowKey="id"
            className="erp-pro-table"
            size="middle"
            columns={columns}
            dataSource={listQuery.data ?? []}
            pagination={false}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FileText />}
                  title={t('hr.leavePolicy.empty')}
                  action={{
                    label: t('hr.leavePolicy.new'),
                    onClick: () => router.push('/hr/leave-policy/new'),
                  }}
                />
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
}
