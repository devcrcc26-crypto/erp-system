'use client';

import { useMemo, useState } from 'react';
import { App, Button, Input, Modal, Segmented, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClockCircleOutlined } from '@ant-design/icons';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  AttendanceScanReviewDecision,
  AttendanceScanReviewItem,
  AttendanceScanReviewStatusFilter,
} from '@/lib/api/attendance.types';
import {
  useAttendanceScanReviews,
  useReviewAttendanceScanFlag,
} from '@/lib/query/attendance';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const DECISION_COLORS: Record<AttendanceScanReviewDecision, string> = {
  EXCUSED: 'green',
  MARKED_LATE: 'orange',
};

const KEY = 'pages.hr.attendance.review.scanReview';

/**
 * SCAN_ONLY schedules: days whose earliest scan was after the schedule's latest
 * scan time. HR can excuse or mark late (with a note); neither affects pay.
 * Hidden when the month has no such flags.
 */
export default function AttendanceScanReviewSection({
  month,
  year,
  enabled,
}: {
  month: number;
  year: number;
  enabled: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const { message } = App.useApp();
  const query = useAttendanceScanReviews(month, year, enabled);
  const review = useReviewAttendanceScanFlag(month, year);
  const [filter, setFilter] = useState<AttendanceScanReviewStatusFilter>('ALL');
  const [target, setTarget] = useState<{
    item: AttendanceScanReviewItem;
    decision: AttendanceScanReviewDecision;
  } | null>(null);
  const [note, setNote] = useState('');

  const items = query.data?.items ?? [];
  const employees = query.data?.employees ?? [];

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (filter === 'PENDING') {
          return item.decision == null;
        }
        if (filter === 'REVIEWED') {
          return item.decision != null;
        }
        return true;
      }),
    [items, filter],
  );

  function openReview(
    item: AttendanceScanReviewItem,
    decision: AttendanceScanReviewDecision,
  ): void {
    setTarget({ item, decision });
    setNote(item.note ?? '');
  }

  async function saveReview(): Promise<void> {
    if (!target) {
      return;
    }
    try {
      await review.mutateAsync({
        dailyLogId: target.item.dailyLogId,
        dto: { decision: target.decision, note: note.trim() || undefined },
      });
      message.success(t(`${KEY}.saved`));
      setTarget(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.saveFailed`), message, t);
    }
  }

  const columns: ColumnsType<AttendanceScanReviewItem> = [
    {
      title: t(`${KEY}.colEmployee`),
      key: 'employee',
      render: (_: unknown, row) => (
        <div className="min-w-0">
          <div className="erp-users-name">{row.employeeName}</div>
          <span className="erp-users-id-chip">{row.employeeCode ?? '-'}</span>
        </div>
      ),
    },
    {
      title: t(`${KEY}.colDate`),
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: t(`${KEY}.colScanTime`),
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 110,
      render: (value: string | null) => (
        <span className="erp-att-num erp-att-num--warn">{value ?? '-'}</span>
      ),
    },
    {
      title: t(`${KEY}.colDecision`),
      key: 'decision',
      width: 130,
      render: (_: unknown, row) =>
        row.decision ? (
          <Tag color={DECISION_COLORS[row.decision]} className="m-0 rounded-full">
            {t(`${KEY}.decision${row.decision}`)}
          </Tag>
        ) : (
          <Tag color="blue" className="m-0 rounded-full">
            {t(`${KEY}.pending`)}
          </Tag>
        ),
    },
    {
      title: t(`${KEY}.colNote`),
      dataIndex: 'note',
      key: 'note',
      render: (value: string | null) =>
        value ? <span className="text-[13px]">{value}</span> : <span className="erp-att-dash">-</span>,
    },
    {
      title: t(`${KEY}.colReviewedBy`),
      key: 'reviewedBy',
      width: 170,
      render: (_: unknown, row) =>
        row.reviewedBy ? (
          <div className="text-[13px]">
            <div>{row.reviewedBy.name}</div>
            {row.reviewedAt ? (
              <div className="erp-att-stat-hint">
                {new Date(row.reviewedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="erp-att-dash">-</span>
        ),
    },
    {
      title: t(`${KEY}.colActions`),
      key: 'actions',
      width: 200,
      render: (_: unknown, row) => (
        <Space size={6}>
          <Button
            size="small"
            disabled={row.decision === 'EXCUSED'}
            onClick={() => openReview(row, 'EXCUSED')}
          >
            {t(`${KEY}.excuse`)}
          </Button>
          <Button
            size="small"
            disabled={row.decision === 'MARKED_LATE'}
            onClick={() => openReview(row, 'MARKED_LATE')}
          >
            {t(`${KEY}.markLate`)}
          </Button>
        </Space>
      ),
    },
  ];

  if (!enabled || (!query.isLoading && items.length === 0)) {
    return null;
  }

  return (
    <div className="erp-pro-card">
      <div className="erp-pro-card-toolbar erp-users-toolbar">
        <div className="erp-users-toolbar-title flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{t(`${KEY}.title`)}</h3>
            <span className="erp-users-count-pill">{items.length}</span>
          </div>
          <p className="m-0 text-[13px] text-slate-600">{t(`${KEY}.subtitle`)}</p>
        </div>
        <Segmented<AttendanceScanReviewStatusFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: t(`${KEY}.filterAll`) },
            { value: 'PENDING', label: t(`${KEY}.filterPending`) },
            { value: 'REVIEWED', label: t(`${KEY}.filterReviewed`) },
          ]}
        />
      </div>

      {employees.length > 0 ? (
        <div className="px-5 pt-3 pb-1">
          <p className="m-0 mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
            {t(`${KEY}.monthlyCounts`)}
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {employees.map((row) => (
              <li
                key={row.employeeId}
                className="rounded-lg bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700"
              >
                <span className="font-medium text-slate-900">{row.employeeName}</span>
                {' · '}
                {t(`${KEY}.countSummary`, {
                  total: String(row.total),
                  pending: String(row.pending),
                  excused: String(row.excused),
                  markedLate: String(row.markedLate),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="erp-pro-table-card-body">
        <Table<AttendanceScanReviewItem>
          className="erp-data-table erp-pro-table erp-users-table"
          rowKey="dailyLogId"
          columns={columns}
          dataSource={visible}
          loading={query.isFetching}
          pagination={visible.length > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<ClockCircleOutlined />}
                title={t(`${KEY}.empty`)}
              />
            ),
          }}
        />
      </div>

      <Modal
        open={target != null}
        title={
          target
            ? t(`${KEY}.reviewTitle`, {
                decision: t(`${KEY}.decision${target.decision}`),
                name: target.item.employeeName,
                date: target.item.date,
              })
            : null
        }
        okText={t(`${KEY}.save`)}
        cancelText={t('common.cancel')}
        confirmLoading={review.isPending}
        onOk={() => void saveReview()}
        onCancel={() => setTarget(null)}
        destroyOnHidden
      >
        <label htmlFor="scan-review-note" className="mb-1.5 block text-[13px] text-slate-600">
          {t(`${KEY}.colNote`)}
        </label>
        <Input.TextArea
          id="scan-review-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t(`${KEY}.notePlaceholder`)}
          autoSize={{ minRows: 2, maxRows: 5 }}
          maxLength={1000}
        />
      </Modal>
    </div>
  );
}
