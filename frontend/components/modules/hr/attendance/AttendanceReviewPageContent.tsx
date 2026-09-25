'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  TeamOutlined,
  UnlockOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AttendanceDailyLogsDrawer from '@/components/modules/hr/attendance/AttendanceDailyLogsDrawer';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceMonthStatus,
  AttendanceRecord,
} from '@/lib/api/attendance.types';
import {
  useApproveAttendanceMonth,
  useAttendanceMonthlyApproval,
  useAttendanceRecordsAll,
  useMarkAttendanceMonthReviewed,
  useUnlockAttendanceMonth,
} from '@/lib/query/attendance';
import { formatUserName } from '@/lib/utils/user-display';

const AVATAR_COLORS = [
  'var(--color-teal-400)',
  'var(--color-blue-400)',
  'var(--color-amber-400)',
  'var(--color-teal-600)',
  'var(--color-blue-800)',
  'var(--color-red-400)',
] as const;

const STATUS_COLORS: Record<AttendanceMonthStatus, string> = {
  PENDING_REVIEW: 'blue',
  REVIEWED: 'orange',
  APPROVED: 'green',
  UNLOCKED: 'gold',
};

export interface AttendanceReviewPageContentProps {
  month: number;
  year: number;
}

function initialsOf(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatNumber(value: number | string | null | undefined): string {
  if (value == null || value === '') {
    return '0';
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '0';
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusBanner(
  status: AttendanceMonthStatus | undefined,
  t: (key: string, values?: Record<string, string>) => string,
  meta: {
    approvedAt?: string | null;
    approverName?: string;
    unlockedAt?: string | null;
    unlockReason?: string | null;
  },
): {
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  icon: React.ReactNode;
} | null {
  if (!status) {
    return null;
  }
  switch (status) {
    case 'PENDING_REVIEW':
      return {
        type: 'info',
        icon: <ClockCircleOutlined />,
        message: t('pages.hr.attendance.review.banner.pending'),
      };
    case 'REVIEWED':
      return {
        type: 'warning',
        icon: <CheckCircleOutlined />,
        message: t('pages.hr.attendance.review.banner.reviewed'),
      };
    case 'APPROVED':
      return {
        type: 'success',
        icon: <CheckCircleOutlined />,
        message: t('pages.hr.attendance.review.banner.approved', {
          date: meta.approvedAt
            ? new Date(meta.approvedAt).toLocaleString()
            : '—',
          name: meta.approverName ?? '—',
        }),
      };
    case 'UNLOCKED':
      return {
        type: 'warning',
        icon: <UnlockOutlined />,
        message: t('pages.hr.attendance.review.banner.unlocked', {
          date: meta.unlockedAt
            ? new Date(meta.unlockedAt).toLocaleString()
            : '—',
          reason: meta.unlockReason ?? '—',
        }),
      };
    default:
      return null;
  }
}

/**
 * HR review and approval UI for one imported attendance month.
 */
export default function AttendanceReviewPageContent({
  month,
  year,
}: AttendanceReviewPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const { message, modal } = App.useApp();
  const router = useRouter();
  const canViewHr = useCanViewHr();

  const [drawerEmployeeId, setDrawerEmployeeId] = useState<string | undefined>();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockForm] = Form.useForm<{ unlockReason: string }>();

  const monthName = t(`hr.months.${month}`);
  const listQuery = useAttendanceRecordsAll({ month, year }, canViewHr);
  const approvalQuery = useAttendanceMonthlyApproval(month, year, canViewHr);
  const markReviewed = useMarkAttendanceMonthReviewed();
  const approveMonth = useApproveAttendanceMonth();
  const unlockMonth = useUnlockAttendanceMonth();

  const records = listQuery.data ?? [];
  const approval = approvalQuery.data ?? null;

  const summary = useMemo(() => {
    const employeesWithFlags = records.filter(
      (row) => toNumber(row.flaggedDays) > 0,
    ).length;
    const totalFlagged = records.reduce(
      (sum, row) => sum + toNumber(row.flaggedDays),
      0,
    );
    const totalResolved = records.reduce(
      (sum, row) => sum + toNumber(row.resolvedDays),
      0,
    );
    return {
      totalEmployees: records.length,
      employeesWithFlags,
      totalFlagged,
      totalResolved,
    };
  }, [records]);

  const banner = statusBanner(approval?.status, t, {
    approvedAt: approval?.approvedAt,
    approverName: approval?.approver
      ? formatUserName(approval.approver)
      : undefined,
    unlockedAt: approval?.unlockedAt,
    unlockReason: approval?.unlockReason,
  });

  const canCorrect =
    approval != null &&
    ['PENDING_REVIEW', 'REVIEWED', 'UNLOCKED'].includes(approval.status);

  const importedAt = approval?.importBatch?.importedAt
    ? new Date(approval.importBatch.importedAt).toLocaleString()
    : '—';
  const fileName = approval?.importBatch?.fileName ?? '—';
  const totalRows =
    approval?.importBatch?.matchedRows ??
    approval?.importBatch?.totalRows ??
    records.length;

  const columns: ColumnsType<AttendanceRecord> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: 260,
        fixed: 'left',
        render: (_: unknown, row: AttendanceRecord) => {
          const name = formatUserName(row.employee);
          const erpId = row.employee.employeeId?.trim() || '—';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                size={36}
                className="erp-users-avatar"
                style={{
                  background: avatarColor(row.employee.id),
                  borderRadius: 10,
                  flexShrink: 0,
                }}
              >
                {initialsOf(row.employee.firstName, row.employee.lastName)}
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <div className="erp-users-name">{name}</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <span className="erp-users-id-chip">{erpId}</span>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.scheduledDays'),
        key: 'scheduledDays',
        width: 120,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-text-secondary)',
            }}
          >
            {formatNumber(row.scheduledDays)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.presentDays'),
        key: 'presentDays',
        width: 110,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
            }}
          >
            {formatNumber(row.presentDays)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.absentDays'),
        key: 'absentDays',
        width: 110,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const value = toNumber(row.absentDays);
          return (
            <span
              style={{
                fontWeight: value > 0 ? 600 : 400,
                color:
                  value > 0
                    ? 'var(--color-red-400)'
                    : 'var(--color-text-tertiary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value > 0 ? formatNumber(row.absentDays) : '—'}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.flaggedDays'),
        key: 'flaggedDays',
        width: 160,
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = toNumber(row.flaggedDays);
          const resolved = toNumber(row.resolvedDays);
          if (flagged === 0) {
            return (
              <Tag color="success" style={{ borderRadius: 999 }}>
                ✓ No flags
              </Tag>
            );
          }
          if (resolved === flagged) {
            return (
              <Tag color="success" style={{ borderRadius: 999 }}>
                ✓ All resolved
              </Tag>
            );
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color="warning" style={{ borderRadius: 999, margin: 0 }}>
                ⚠ {flagged}
              </Tag>
              {resolved > 0 ? (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {resolved} resolved
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.resolved'),
        key: 'resolved',
        width: 110,
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = toNumber(row.flaggedDays);
          const resolved = toNumber(row.resolvedDays);
          if (flagged <= 0) {
            return (
              <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
            );
          }
          const percent = Math.round((resolved / flagged) * 100);
          return (
            <div style={{ width: 80 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 3,
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <span>{resolved}</span>
                <span>{flagged}</span>
              </div>
              <div className="erp-attendance-progress-track">
                <div
                  className="erp-attendance-progress-fill"
                  style={{
                    width: `${percent}%`,
                    background:
                      resolved === flagged
                        ? 'var(--color-teal-400)'
                        : 'var(--color-amber-400)',
                  }}
                />
              </div>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.status'),
        key: 'flagStatus',
        width: 140,
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = toNumber(row.flaggedDays);
          const resolved = toNumber(row.resolvedDays);
          if (flagged === 0) {
            return (
              <span
                style={{
                  color: 'var(--color-teal-600)',
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                ✓ Complete
              </span>
            );
          }
          if (resolved >= flagged) {
            return (
              <span
                style={{
                  color: 'var(--color-teal-600)',
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                ✓ All Resolved
              </span>
            );
          }
          if (resolved > 0) {
            return (
              <span
                style={{
                  color: 'var(--color-amber-400)',
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                Partial
              </span>
            );
          }
          return (
            <span
              style={{
                color: 'var(--color-red-400)',
                fontWeight: 500,
                fontSize: 12,
              }}
            >
              Needs Attention
            </span>
          );
        },
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 72,
        align: 'center',
        fixed: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <div className="erp-table-row-actions">
            <Tooltip title={t('pages.hr.attendance.review.viewDailyLogs')}>
              <Button
                type="text"
                size="small"
                icon={<CalendarOutlined />}
                onClick={() => setDrawerEmployeeId(row.employeeId)}
                aria-label={t('pages.hr.attendance.review.viewDailyLogs')}
              />
            </Tooltip>
          </div>
        ),
      },
    ],
    [t],
  );

  function handleMarkReviewed(): void {
    if (!approval) {
      return;
    }
    markReviewed.mutate(approval.id, {
      onSuccess: () => {
        message.success(t('pages.hr.attendance.review.markReviewedSuccess'));
      },
      onError: (error) => {
        message.error(
          error instanceof ApiRequestError
            ? error.message
            : t('pages.hr.attendance.review.actionFailed'),
        );
      },
    });
  }

  function handleApprove(): void {
    if (!approval) {
      return;
    }
    modal.confirm({
      title: t('pages.hr.attendance.review.approveTitle', {
        month: monthName,
        year: String(year),
      }),
      content: t('pages.hr.attendance.review.approveBody'),
      okText: t('pages.hr.attendance.review.approveConfirm'),
      cancelText: t('common.cancel'),
      onOk: () =>
        approveMonth.mutateAsync(approval.id).then(
          () => {
            message.success(t('pages.hr.attendance.review.approveSuccess'));
          },
          (error: unknown) => {
            message.error(
              error instanceof ApiRequestError
                ? error.message
                : t('pages.hr.attendance.review.actionFailed'),
            );
            return Promise.reject(error);
          },
        ),
    });
  }

  async function handleUnlockSubmit(): Promise<void> {
    if (!approval) {
      return;
    }
    const values = await unlockForm.validateFields();
    try {
      await unlockMonth.mutateAsync({
        monthlyApprovalId: approval.id,
        dto: { unlockReason: values.unlockReason },
      });
      message.success(t('pages.hr.attendance.review.unlockSuccess'));
      setUnlockOpen(false);
      unlockForm.resetFields();
    } catch (error) {
      message.error(
        error instanceof ApiRequestError
          ? error.message
          : t('pages.hr.attendance.review.actionFailed'),
      );
    }
  }

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <Alert
          type="error"
          showIcon
          title={t('pages.hr.attendance.review.hrOnly')}
        />
      </div>
    );
  }

  if (
    (listQuery.isLoading && !listQuery.data) ||
    (approvalQuery.isLoading && approvalQuery.data === undefined)
  ) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page">
        <div
          className="flex justify-center rounded-xl p-12"
          style={{
            border: '1px solid var(--color-border-tertiary)',
            background: 'var(--color-surface-secondary)',
          }}
        >
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-review-page flex flex-col gap-4">
      <div className="erp-pro-card" style={{ marginBottom: 0 }}>
        <div style={{ padding: '20px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push('/hr/attendance')}
              style={{ padding: '4px 8px' }}
              aria-label={t('common.back')}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 650,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {t('pages.hr.attendance.review.title', {
                    month: monthName,
                    year: String(year),
                  })}
                </h1>
                {approval ? (
                  <Tag
                    color={STATUS_COLORS[approval.status]}
                    style={{ fontWeight: 600, borderRadius: 999 }}
                  >
                    {t(`pages.hr.attendance.review.status.${approval.status}`)}
                  </Tag>
                ) : null}
              </div>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 13,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {t('pages.hr.attendance.review.importMeta', {
                  date: importedAt,
                  file: fileName,
                  count: String(totalRows),
                })}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexShrink: 0,
                flexWrap: 'wrap',
              }}
            >
              {approval?.status === 'PENDING_REVIEW' ? (
                <Button
                  icon={<EditOutlined />}
                  loading={markReviewed.isPending}
                  onClick={handleMarkReviewed}
                >
                  {t('pages.hr.attendance.review.markReviewed')}
                </Button>
              ) : null}
              {approval &&
              (approval.status === 'PENDING_REVIEW' ||
                approval.status === 'REVIEWED') ? (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={approveMonth.isPending}
                  onClick={handleApprove}
                >
                  {t('pages.hr.attendance.review.approveMonth')}
                </Button>
              ) : null}
              {approval?.status === 'APPROVED' ? (
                <Button
                  icon={<UnlockOutlined />}
                  onClick={() => setUnlockOpen(true)}
                >
                  {t('pages.hr.attendance.review.unlockMonth')}
                </Button>
              ) : null}
            </div>
          </div>

          {listQuery.isError || approvalQuery.isError ? (
            <Alert
              type="error"
              showIcon
              style={{ borderRadius: 8, marginBottom: banner ? 12 : 0 }}
              title={
                listQuery.error instanceof ApiRequestError
                  ? listQuery.error.message
                  : approvalQuery.error instanceof ApiRequestError
                    ? approvalQuery.error.message
                    : t('pages.hr.attendance.loadFailed')
              }
            />
          ) : null}

          {!approval && !approvalQuery.isLoading ? (
            <Alert
              type="warning"
              showIcon
              style={{ borderRadius: 8 }}
              title={t('pages.hr.attendance.review.noApproval')}
            />
          ) : null}

          {banner ? (
            <Alert
              type={banner.type}
              showIcon
              icon={banner.icon}
              title={banner.message}
              style={{ borderRadius: 8 }}
            />
          ) : null}
        </div>
      </div>

      <div className="erp-users-stat-bar">
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background: 'var(--color-blue-50)',
              color: 'var(--color-blue-400)',
            }}
          >
            <TeamOutlined />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.employees')}
            </p>
            <p className="erp-users-stat-value">{summary.totalEmployees}</p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {t('pages.hr.attendance.review.stats.employeesHint')}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background: 'var(--color-amber-50)',
              color: 'var(--color-amber-400)',
            }}
          >
            <WarningOutlined />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.employeesWithFlags')}
            </p>
            <p className="erp-users-stat-value">
              {summary.employeesWithFlags}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 400,
                  color: 'var(--color-text-tertiary)',
                  marginLeft: 4,
                }}
              >
                / {summary.totalEmployees}
              </span>
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {t('pages.hr.attendance.review.stats.employeesWithFlagsHint')}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background: 'var(--color-amber-50)',
              color: 'var(--color-amber-400)',
            }}
          >
            <WarningOutlined />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.totalFlagged')}
            </p>
            <p className="erp-users-stat-value">{summary.totalFlagged}</p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {t('pages.hr.attendance.review.stats.totalFlaggedHint')}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background: 'var(--color-teal-50)',
              color: 'var(--color-teal-400)',
            }}
          >
            <CheckCircleOutlined />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.resolved')}
            </p>
            <p className="erp-users-stat-value">
              {summary.totalResolved}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 400,
                  color: 'var(--color-text-tertiary)',
                  marginLeft: 4,
                }}
              >
                / {summary.totalFlagged}
              </span>
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {t('pages.hr.attendance.review.stats.resolvedHint')}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-table-card-body">
          <DataTable<AttendanceRecord>
            className="erp-data-table erp-pro-table"
            rowKey="id"
            columns={columns}
            dataSource={records}
            loading={listQuery.isFetching}
            scroll={{ x: 1100 }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<TeamOutlined />}
                  title={t('pages.hr.attendance.emptyTitle', {
                    month: monthName,
                    year,
                  })}
                  description={t('pages.hr.attendance.emptyDescription')}
                />
              ),
            }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
            }}
          />
        </div>
      </div>

      <AttendanceDailyLogsDrawer
        employeeId={drawerEmployeeId}
        month={month}
        year={year}
        canCorrect={canCorrect}
        onClose={() => setDrawerEmployeeId(undefined)}
      />

      <Modal
        title={t('pages.hr.attendance.review.unlockTitle')}
        open={unlockOpen}
        onCancel={() => {
          setUnlockOpen(false);
          unlockForm.resetFields();
        }}
        onOk={() => void handleUnlockSubmit()}
        confirmLoading={unlockMonth.isPending}
        okText={t('pages.hr.attendance.review.unlockConfirm')}
        destroyOnHidden
      >
        <Form form={unlockForm} layout="vertical" className="mt-2">
          <Form.Item
            name="unlockReason"
            label={t('pages.hr.attendance.review.unlockReason')}
            rules={[
              {
                required: true,
                message: t('pages.hr.attendance.review.unlockReasonRequired'),
              },
              { min: 5 },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
