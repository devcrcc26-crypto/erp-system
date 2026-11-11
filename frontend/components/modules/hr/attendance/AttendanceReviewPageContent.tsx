'use client';

import './attendance-v2.css';

import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  TeamOutlined,
  UnlockOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AttendanceDailyLogsDrawer from '@/components/modules/hr/attendance/AttendanceDailyLogsDrawer';
import AttendanceMissingScheduleDrawer from '@/components/modules/hr/attendance/AttendanceMissingScheduleDrawer';
import AttendanceScanReviewSection from '@/components/modules/hr/attendance/AttendanceScanReviewSection';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsMdUp } from '@/hooks/useMediaQuery';
import {
  getAttendanceImportBatchDetails,
  resolveAttendanceImportMissing,
} from '@/lib/api/attendance.api';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceImportMissing,
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
            : '-',
          name: meta.approverName ?? '-',
        }),
      };
    case 'UNLOCKED':
      return {
        type: 'warning',
        icon: <UnlockOutlined />,
        message: t('pages.hr.attendance.review.banner.unlocked', {
          date: meta.unlockedAt
            ? new Date(meta.unlockedAt).toLocaleString()
            : '-',
          reason: meta.unlockReason ?? '-',
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
  const canViewHr = useCanViewHr();
  const queryClient = useQueryClient();

  const [drawerEmployeeId, setDrawerEmployeeId] = useState<string | undefined>();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockForm] = Form.useForm<{ unlockReason: string }>();
  const [missingNotes, setMissingNotes] = useState<Record<string, string>>({});
  const [missingResolvingId, setMissingResolvingId] = useState<string | null>(
    null,
  );
  const [missingScheduleTarget, setMissingScheduleTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const monthName = t(`hr.months.${month}`);
  const listQuery = useAttendanceRecordsAll({ month, year }, canViewHr);
  const approvalQuery = useAttendanceMonthlyApproval(month, year, canViewHr);
  const markReviewed = useMarkAttendanceMonthReviewed();
  const approveMonth = useApproveAttendanceMonth();
  const unlockMonth = useUnlockAttendanceMonth();

  const records = listQuery.data ?? [];
  const approval = approvalQuery.data ?? null;
  const batchId = approval?.importBatchId;

  const batchDetailsQuery = useQuery({
    queryKey: ['attendance-import-batch-details', batchId],
    queryFn: () => getAttendanceImportBatchDetails(batchId as string),
    enabled: Boolean(canViewHr && batchId),
  });

  const missingRows = batchDetailsQuery.data?.missing ?? [];
  const unmatchedRows = batchDetailsQuery.data?.unmatched ?? [];
  const pendingMissing = missingRows.filter(
    (row) => row.resolution === 'PENDING' || row.resolution === 'NEEDS_ENROLMENT',
  );

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
      totalLeaveDays: records.reduce(
        (sum, row) => sum + toNumber(row.leaveDaysThisMonth),
        0,
      ),
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
    : '-';
  const fileName = approval?.importBatch?.fileName ?? '-';
  const totalRows =
    approval?.importBatch?.matchedRows ??
    approval?.importBatch?.totalRows ??
    records.length;

  const isMdUp = useIsMdUp();

  const columns: ColumnsType<AttendanceRecord> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: isMdUp ? 260 : 160,
        fixed: isMdUp ? 'left' : undefined,
        render: (_: unknown, row: AttendanceRecord) => {
          const name = formatUserName(row.employee);
          const erpId = row.employee.employeeId?.trim() || '-';
          return (
            <div className="flex items-center gap-2.5">
              <Avatar
                size={36}
                className="erp-users-avatar"
                style={{
                  background: avatarColor(row.employee.id),
                  flexShrink: 0,
                }}
              >
                {initialsOf(row.employee.firstName, row.employee.lastName)}
              </Avatar>
              <div className="min-w-0">
                <div className="erp-users-name">{name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="erp-users-id-chip">{erpId}</span>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.paidDays'),
        key: 'paidDays',
        width: 130,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-att-num erp-att-num--teal">
            {formatNumber(row.paidDays ?? 0)}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.presentDays'),
        key: 'presentDays',
        width: 120,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => (
          <span className="erp-att-num">{formatNumber(row.presentDays)}</span>
        ),
      },
      {
        title: t('pages.hr.attendance.columns.absentDays'),
        key: 'absentDays',
        width: 100,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const absent = toNumber(row.absentDays);
          if (absent === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <span className="erp-att-num erp-att-num--danger">
              {formatNumber(absent)}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.unpaidLeaveDays'),
        key: 'unpaidLeaveDays',
        width: 120,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const unpaid = toNumber(row.unpaidLeaveDays ?? 0);
          if (unpaid === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <span className="erp-att-num erp-att-num--danger">
              {formatNumber(unpaid)}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.leaveDays'),
        key: 'leaveDays',
        width: 100,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const leaveDays = row.leaveDaysThisMonth ?? 0;
          if (leaveDays === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <span className="erp-att-num">{formatNumber(leaveDays)}</span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.scheduleCoverage'),
        key: 'scheduleCoverage',
        width: 180,
        render: (_: unknown, row: AttendanceRecord) => {
          if (row.matchMethod === 'COVERED') {
            return (
              <Tag color="blue" className="m-0 rounded-full">
                {t('pages.hr.attendance.importModal.matchMethodCovered')}
              </Tag>
            );
          }
          const siteDays = row.siteDaysThisMonth ?? [];
          const wfhDays = row.workFromHomeDaysThisMonth ?? 0;
          if (siteDays.length === 0 && wfhDays === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <div className="flex flex-col gap-0.5 text-[12px]">
              {siteDays.map((entry) => (
                <Tag key={entry.siteName} className="m-0 w-fit">
                  {entry.siteName}: {entry.days}d
                </Tag>
              ))}
              {wfhDays > 0 ? (
                <Tag color="geekblue" className="m-0 w-fit">
                  WFH: {wfhDays}d
                </Tag>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.columns.lateDays'),
        key: 'lateDays',
        width: 100,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const value = row.lateDays;
          return (
            <span
              className={
                value > 0 ? 'erp-att-num erp-att-num--warn' : 'erp-att-dash'
              }
            >
              {value > 0 ? value : '-'}
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.earlyDeparture'),
        key: 'earlyDeparture',
        width: 140,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const count = toNumber(row.earlyDepartureCount);
          const would = toNumber(row.earlyDepartureWouldDeductDays);
          const deducted = toNumber(row.earlyDepartureDeductedDays);
          if (count === 0 && would === 0 && deducted === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <div className="flex flex-col items-end gap-0.5 text-[12px]">
              <span className="erp-att-num">{count}</span>
              {would > 0 ? (
                <span className="erp-att-stat-hint text-amber-700">
                  {t('pages.hr.attendance.review.wouldDeduct', {
                    days: formatNumber(would),
                  })}
                </span>
              ) : null}
              {deducted > 0 ? (
                <span className="erp-att-stat-hint text-red-700">
                  {t('pages.hr.attendance.review.deducted', {
                    days: formatNumber(deducted),
                  })}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.fieldMovements'),
        key: 'approvedFieldMovements',
        width: 110,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const value = toNumber(row.approvedFieldMovementCount);
          return value > 0 ? (
            <span className="erp-att-num">{value}</span>
          ) : (
            <span className="erp-att-dash">-</span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.columns.forgotToClock'),
        key: 'forgotToClock',
        width: 120,
        align: 'right',
        render: (_: unknown, row: AttendanceRecord) => {
          const value = toNumber(row.forgotToClockCount);
          const threshold =
            row.forgotToClockFlagThreshold ?? 3;
          if (value === 0) {
            return <span className="erp-att-dash">-</span>;
          }
          return (
            <Tag
              color={value >= threshold ? 'error' : 'default'}
              className="m-0 rounded-full"
            >
              {value}
              {value >= threshold
                ? ` ≥ ${threshold}`
                : ''}
            </Tag>
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
              <Tag color="success" className="rounded-full">
                ✓ No flags
              </Tag>
            );
          }
          if (resolved === flagged) {
            return (
              <Tag color="success" className="rounded-full">
                ✓ All resolved
              </Tag>
            );
          }
          return (
            <div className="flex items-center gap-2">
              <Tag color="warning" className="m-0 rounded-full">
                ⚠ {flagged}
              </Tag>
              {resolved > 0 ? (
                <span className="erp-att-stat-hint">{resolved} resolved</span>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: isMdUp ? 72 : 80,
        align: 'center',
        fixed: isMdUp ? 'right' : undefined,
        render: (_: unknown, row: AttendanceRecord) => (
          <div className="erp-table-row-actions flex items-center justify-center">
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
    [t, isMdUp],
  );

  // Keep scroll.x equal to the column total so fixed columns stay aligned.
  const scrollX = columns.reduce(
    (sum, column) => sum + (typeof column.width === 'number' ? column.width : 0),
    0,
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
      <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-review-page erp-attendance-v2">
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
      <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-review-page erp-attendance-v2">
        <div className="erp-att-loading">
          <Spin />
        </div>
      </div>
    );
  }

  const reviewStats = [
    {
      key: 'employees',
      label: t('pages.hr.attendance.review.stats.employees'),
      hint: t('pages.hr.attendance.review.stats.employeesHint'),
      value: String(summary.totalEmployees),
      chipBg: '#E6F1FB',
      chipFg: '#185FA5',
      icon: <TeamOutlined />,
    },
    {
      key: 'withFlags',
      label: t('pages.hr.attendance.review.stats.employeesWithFlags'),
      hint: t('pages.hr.attendance.review.stats.employeesWithFlagsHint'),
      value: `${summary.employeesWithFlags}`,
      suffix: `/ ${summary.totalEmployees}`,
      chipBg: '#FAEEDA',
      chipFg: '#BA7517',
      icon: <WarningOutlined />,
    },
    {
      key: 'flagged',
      label: t('pages.hr.attendance.review.stats.totalFlagged'),
      hint: t('pages.hr.attendance.review.stats.totalFlaggedHint'),
      value: String(summary.totalFlagged),
      chipBg: '#FAEEDA',
      chipFg: '#BA7517',
      icon: <WarningOutlined />,
    },
    {
      key: 'resolved',
      label: t('pages.hr.attendance.review.stats.resolved'),
      hint: t('pages.hr.attendance.review.stats.resolvedHint'),
      value: String(summary.totalResolved),
      suffix: `/ ${summary.totalFlagged}`,
      chipBg: '#E1F5EE',
      chipFg: '#1D9E75',
      icon: <CheckCircleOutlined />,
    },
    {
      key: 'leave',
      label: t('pages.hr.attendance.review.stats.onLeave'),
      hint: t('pages.hr.attendance.review.stats.onLeaveHint'),
      value: formatNumber(summary.totalLeaveDays),
      chipBg: '#EAF3DE',
      chipFg: '#639922',
      icon: <CalendarOutlined />,
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-review-page erp-attendance-v2">
      <section className="erp-att-review-hero">
        <div className="erp-att-review-hero-top">
          <div className="min-w-0">
            <Link href="/hr/attendance" className="erp-att-review-back">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {t('hr.buttons.backToList')}
            </Link>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="erp-att-review-title">
                {t('pages.hr.attendance.review.reviewButton', {
                  month: monthName,
                  year: String(year),
                })}
              </h1>
              {approval ? (
                <Tag
                  className="erp-att-status-tag"
                  color={STATUS_COLORS[approval.status]}
                >
                  {t(`pages.hr.attendance.review.status.${approval.status}`)}
                </Tag>
              ) : null}
            </div>
            <p className="erp-att-review-meta break-words">
              {t('pages.hr.attendance.review.importMeta', {
                date: importedAt,
                file: fileName,
                count: String(totalRows),
              })}
            </p>
          </div>
          <div className="erp-att-review-actions w-full md:w-auto">
            <Space.Compact
              block={!isMdUp}
              orientation={isMdUp ? 'horizontal' : 'vertical'}
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
            </Space.Compact>
          </div>
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
          />
        ) : null}

        {approval?.attendanceRecalcStale ? (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            title={t('pages.hr.attendance.review.banner.recalcStale')}
          />
        ) : null}
      </section>

      <div className="erp-users-stat-bar">
        {reviewStats.map((stat) => (
          <div
            key={stat.key}
            className="erp-users-stat erp-contract-stat erp-contract-stat--static"
          >
            <span
              className="erp-users-stat-chip"
              style={{ background: stat.chipBg, color: stat.chipFg }}
            >
              {stat.icon}
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="erp-users-stat-label">{stat.label}</p>
              <p className="erp-users-stat-value">
                {stat.value}
                {stat.suffix ? (
                  <span className="erp-att-stat-hint ml-1 text-sm font-normal">
                    {stat.suffix}
                  </span>
                ) : null}
              </p>
              <p className="erp-att-stat-hint">{stat.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.hr.attendance.listTitle')}
            </h3>
            <span className="erp-users-count-pill">
              {records.length.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="erp-pro-table-card-body">
          <DataTable<AttendanceRecord>
            className="erp-data-table erp-pro-table erp-users-table"
            rowKey="id"
            columns={columns}
            dataSource={records}
            loading={listQuery.isFetching}
            scroll={{ x: scrollX }}
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

      {pendingMissing.length > 0 || unmatchedRows.length > 0 ? (
        <div className="erp-pro-card mt-4">
          <div className="erp-pro-card-toolbar">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.hr.attendance.importModal.missingSection')} (
              {pendingMissing.length})
            </h3>
          </div>
          <div className="erp-pro-table-card-body space-y-4 py-3">
            {pendingMissing.length > 0 ? (
              <div className="min-w-0 overflow-x-auto">
                <Table<AttendanceImportMissing>
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={pendingMissing}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    {
                      title: t('pages.hr.attendance.importModal.colErpName'),
                      key: 'name',
                      render: (_: unknown, row: AttendanceImportMissing) =>
                        formatUserName(row.user),
                    },
                    {
                      title: t('pages.hr.attendance.importModal.colEmployeeId'),
                      key: 'employeeId',
                      render: (_: unknown, row: AttendanceImportMissing) =>
                        row.user.employeeId ?? '-',
                    },
                    {
                      title: t(
                        'pages.hr.attendance.importModal.missingCoverageColumn',
                      ),
                      key: 'coverage',
                      width: 200,
                      render: (_: unknown, row: AttendanceImportMissing) => {
                        const note = row.note?.trim();
                        if (note) {
                          return (
                            <Tag className="m-0 rounded-full">{note}</Tag>
                          );
                        }
                        return '-';
                      },
                    },
                    {
                      title: t('pages.hr.attendance.importModal.colPresence'),
                      key: 'actions',
                      width: 360,
                      render: (_: unknown, row: AttendanceImportMissing) => (
                        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                          <Select
                            size="small"
                            style={{ width: '100%' }}
                            placeholder={t(
                              'pages.hr.attendance.importModal.missingActionNone',
                            )}
                            options={[
                              {
                                value: 'MARKED_EXEMPT',
                                label: t(
                                  'pages.hr.attendance.importModal.missingActionExempt',
                                ),
                              },
                              {
                                value: 'MANUAL_PRESENT',
                                label: t(
                                  'pages.hr.attendance.importModal.missingActionPresent',
                                ),
                              },
                              {
                                value: 'NEEDS_ENROLMENT',
                                label: t(
                                  'pages.hr.attendance.importModal.missingActionEnrolment',
                                ),
                              },
                            ]}
                            loading={missingResolvingId === row.id}
                            onChange={(resolution) => {
                              void (async () => {
                                if (!batchId) {
                                  return;
                                }
                                const note = missingNotes[row.id]?.trim() ?? '';
                                if (
                                  resolution === 'MANUAL_PRESENT' &&
                                  note.length < 3
                                ) {
                                  message.error(
                                    t(
                                      'pages.hr.attendance.importModal.missingPresentReasonRequired',
                                    ),
                                  );
                                  return;
                                }
                                setMissingResolvingId(row.id);
                                try {
                                  await resolveAttendanceImportMissing(
                                    batchId,
                                    row.id,
                                    {
                                      resolution,
                                      ...(note ? { note } : {}),
                                    },
                                  );
                                  message.success('Resolved');
                                  await queryClient.invalidateQueries({
                                    queryKey: [
                                      'attendance-import-batch-details',
                                      batchId,
                                    ],
                                  });
                                  await listQuery.refetch();
                                } catch (error) {
                                  message.error(
                                    error instanceof ApiRequestError
                                      ? error.message
                                      : 'Resolve failed',
                                  );
                                } finally {
                                  setMissingResolvingId(null);
                                }
                              })();
                            }}
                          />
                          <Input
                            size="small"
                            placeholder={t(
                              'pages.hr.attendance.importModal.missingPresentReasonPlaceholder',
                            )}
                            value={missingNotes[row.id] ?? ''}
                            onChange={(event) => {
                              const note = event.target.value;
                              setMissingNotes((prev) => ({
                                ...prev,
                                [row.id]: note,
                              }));
                            }}
                          />
                          <Button
                            type="link"
                            size="small"
                            className="h-auto p-0 text-[12px]"
                            onClick={() => {
                              setMissingScheduleTarget({
                                id: row.userId,
                                name: formatUserName(row.user),
                              });
                            }}
                          >
                            {t(
                              'pages.hr.attendance.importModal.submitSiteAssignment',
                            )}
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            ) : null}
            {unmatchedRows.length > 0 ? (
              <div>
                <p className="mb-2 px-3 text-sm font-medium">
                  {t('pages.hr.attendance.importModal.rejectedSection')} (
                  {unmatchedRows.length})
                </p>
                <div className="min-w-0 overflow-x-auto">
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={unmatchedRows}
                    scroll={{ x: 'max-content' }}
                    columns={[
                      {
                        title: t(
                          'pages.hr.attendance.importModal.colAttendanceName',
                        ),
                        dataIndex: 'attendanceName',
                        key: 'attendanceName',
                      },
                      {
                        title: t(
                          'pages.hr.attendance.importModal.colIdInSystem',
                        ),
                        dataIndex: 'attendanceId',
                        key: 'attendanceId',
                      },
                      {
                        title: t('pages.hr.attendance.importModal.colReason'),
                        dataIndex: 'status',
                        key: 'status',
                      },
                    ]}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <AttendanceScanReviewSection
        month={month}
        year={year}
        enabled={Boolean(canViewHr && approval)}
      />

      <AttendanceDailyLogsDrawer
        employeeId={drawerEmployeeId}
        month={month}
        year={year}
        canCorrect={canCorrect}
        onClose={() => setDrawerEmployeeId(undefined)}
      />

      {missingScheduleTarget ? (
        <AttendanceMissingScheduleDrawer
          open
          employeeId={missingScheduleTarget.id}
          employeeName={missingScheduleTarget.name}
          month={month}
          year={year}
          onClose={() => setMissingScheduleTarget(null)}
          onSubmitted={() => {
            void batchDetailsQuery.refetch();
            void listQuery.refetch();
          }}
        />
      ) : null}

      <Modal
        rootClassName="erp-att-correct-modal"
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
