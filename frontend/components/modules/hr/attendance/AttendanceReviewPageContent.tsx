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
  Progress,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  LockOutlined,
  TeamOutlined,
  UnlockOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
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
  '#F47B20',
  '#1B2B4B',
  '#185FA5',
  '#639922',
  '#BA7517',
  '#7F77DD',
  '#D32F2F',
  '#0F6E56',
] as const;

const STAT_ACCENT = {
  blue: { bg: '#E8F1FB', fg: '#185FA5' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

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

  const columns: ColumnsType<AttendanceRecord> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: 240,
        fixed: 'left',
        render: (_: unknown, row: AttendanceRecord) => {
          const name = formatUserName(row.employee);
          const erpId = row.employee.employeeId?.trim() || '—';
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar
                size={32}
                style={{
                  backgroundColor: avatarColor(row.employee.id),
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {initialsOf(row.employee.firstName, row.employee.lastName)}
              </Avatar>
              <div className="min-w-0">
                <p className="erp-users-cell-strong m-0 truncate">{name}</p>
                <span className="erp-users-id-chip">{erpId}</span>
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
          <span className="erp-users-cell-sub">
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
          <span className="erp-users-cell-sub">
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
          const absent = toNumber(row.absentDays);
          return (
            <span
              className="erp-users-cell-sub"
              style={
                absent > 0 ? { color: '#D32F2F', fontWeight: 600 } : undefined
              }
            >
              {formatNumber(row.absentDays)}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.flaggedDays'),
        key: 'flaggedDays',
        width: 140,
        align: 'center',
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = toNumber(row.flaggedDays);
          if (flagged > 0) {
            return (
              <Tag
                color="warning"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                ⚠ {flagged} flag{flagged !== 1 ? 's' : ''}
              </Tag>
            );
          }
          return <Tag color="success">✓ No flags</Tag>;
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.resolved'),
        key: 'resolved',
        width: 110,
        align: 'center',
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = toNumber(row.flaggedDays);
          const resolved = toNumber(row.resolvedDays);
          if (flagged <= 0) {
            return <span style={{ color: '#94a3b8' }}>—</span>;
          }
          const percent = Math.round((resolved / flagged) * 100);
          return (
            <Progress
              type="circle"
              percent={percent}
              size={28}
              strokeColor="#1d9e75"
              format={() => `${resolved}/${flagged}`}
            />
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.status'),
        key: 'flagStatus',
        width: 150,
        render: (_: unknown, row: AttendanceRecord) => {
          const flagged = toNumber(row.flaggedDays);
          const resolved = toNumber(row.resolvedDays);
          if (flagged === 0) {
            return (
              <Tag color="success">
                {t('pages.hr.attendance.review.flagStatus.complete')}
              </Tag>
            );
          }
          if (resolved >= flagged) {
            return (
              <Tag color="success">
                {t('pages.hr.attendance.review.flagStatus.allResolved')}
              </Tag>
            );
          }
          if (resolved > 0) {
            return (
              <Tag color="processing">
                {t('pages.hr.attendance.review.flagStatus.partial')}
              </Tag>
            );
          }
          return (
            <Tag color="warning">
              {t('pages.hr.attendance.review.flagStatus.needsAttention')}
            </Tag>
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
          <Tooltip title={t('pages.hr.attendance.review.viewDailyLogs')}>
            <Button
              type="text"
              size="small"
              icon={<CalendarOutlined />}
              onClick={() => setDrawerEmployeeId(row.employeeId)}
              aria-label={t('pages.hr.attendance.review.viewDailyLogs')}
            />
          </Tooltip>
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
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-review-page flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#6B7280]">
        <Link href="/hr/attendance" className="text-[#185FA5] hover:underline">
          {t('nav.hr.attendance')}
        </Link>
        <span>/</span>
        <span>
          {t('pages.hr.attendance.review.breadcrumb', {
            month: monthName,
            year: String(year),
          })}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Space align="center" size={10}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push('/hr/attendance')}
              aria-label={t('common.back')}
            />
            <Typography.Title level={3} className="!mb-0">
              {t('pages.hr.attendance.review.title', {
                month: monthName,
                year: String(year),
              })}
            </Typography.Title>
          </Space>
        </div>
        <Space wrap>
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
          {approval?.status === 'APPROVED' ? (
            <Tag icon={<LockOutlined />} color="green">
              {t('pages.hr.attendance.review.locked')}
            </Tag>
          ) : null}
        </Space>
      </div>

      {listQuery.isError || approvalQuery.isError ? (
        <Alert
          type="error"
          showIcon
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
          title={t('pages.hr.attendance.review.noApproval')}
        />
      ) : null}

      {banner ? (
        <Alert
          type={banner.type}
          showIcon
          icon={banner.icon}
          title={banner.message}
          className="mb-0"
        />
      ) : null}

      <div className="erp-users-stats-row grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background: STAT_ACCENT.blue.bg,
              color: STAT_ACCENT.blue.fg,
            }}
          >
            <TeamOutlined />
          </span>
          <div>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.employees')}
            </p>
            <p className="erp-users-stat-value">{summary.totalEmployees}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background:
                summary.employeesWithFlags > 0
                  ? STAT_ACCENT.amber.bg
                  : STAT_ACCENT.green.bg,
              color:
                summary.employeesWithFlags > 0
                  ? STAT_ACCENT.amber.fg
                  : STAT_ACCENT.green.fg,
            }}
          >
            <WarningOutlined />
          </span>
          <div>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.employeesWithFlags')}
            </p>
            <p className="erp-users-stat-value">{summary.employeesWithFlags}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background:
                summary.totalFlagged > 0
                  ? STAT_ACCENT.amber.bg
                  : STAT_ACCENT.green.bg,
              color:
                summary.totalFlagged > 0
                  ? STAT_ACCENT.amber.fg
                  : STAT_ACCENT.green.fg,
            }}
          >
            <WarningOutlined />
          </span>
          <div>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.totalFlagged')}
            </p>
            <p className="erp-users-stat-value">{summary.totalFlagged}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <span
            className="erp-users-stat-chip"
            style={{
              background: STAT_ACCENT.green.bg,
              color: STAT_ACCENT.green.fg,
            }}
          >
            <CheckCircleOutlined />
          </span>
          <div>
            <p className="erp-users-stat-label">
              {t('pages.hr.attendance.review.stats.resolved')}
            </p>
            <p className="erp-users-stat-value">{summary.totalResolved}</p>
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
