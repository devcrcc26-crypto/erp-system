'use client';

import { useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Popover,
  Space,
  Spin,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import { EditOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollEntryDetail } from '@/lib/api/payroll.types';
import { usePayrollEntryAudit, useUpdatePayrollEntryDays } from '@/lib/query/payroll';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { parsePayrollMoney } from '@/lib/utils/payroll-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * HR-only paid-days override controls: edit button, "Edited" badge and history.
 * Render only for users with payroll.edit.
 */
export default function PayrollPaidDaysControls({
  runId,
  entry,
  canOverride,
}: {
  runId: string;
  entry: PayrollEntryDetail;
  /** False once the run has left DRAFT / REVIEWED; history stays available. */
  canOverride: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const currentDays = parsePayrollMoney(entry.payrollDays);
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<number | null>(currentDays);
  const [reason, setReason] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const updateDays = useUpdatePayrollEntryDays(runId, entry.id);
  const auditQuery = usePayrollEntryAudit(runId, entry.id, historyOpen);

  function toggleEditing(open: boolean): void {
    if (open) {
      setDays(currentDays);
      setReason('');
    }
    setEditing(open);
  }

  async function save(): Promise<void> {
    if (days == null) {
      return;
    }
    try {
      await updateDays.mutateAsync({
        payrollDays: days,
        reason: reason.trim() || undefined,
      });
      messageApi.success(t('hr.payroll.entry.daysOverride.saved'));
      setEditing(false);
    } catch (error) {
      notifyApiError(error, t('hr.payroll.entry.daysOverride.action'), messageApi, t);
    }
  }

  const editor = (
    <Space orientation="vertical" size="small" className="w-64">
      <label className="block text-xs" htmlFor={`payroll-days-${entry.id}`}>
        {t('hr.payroll.entry.daysOverride.daysLabel')}
      </label>
      <InputNumber
        id={`payroll-days-${entry.id}`}
        min={0}
        max={30}
        step={0.5}
        precision={2}
        className="w-full"
        value={days}
        onChange={(value) => setDays(value)}
      />
      <Input.TextArea
        aria-label={t('hr.payroll.entry.daysOverride.reasonPlaceholder')}
        placeholder={t('hr.payroll.entry.daysOverride.reasonPlaceholder')}
        rows={2}
        maxLength={1000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Space>
        <Button
          size="small"
          type="primary"
          loading={updateDays.isPending}
          disabled={days == null || days === currentDays}
          onClick={() => void save()}
        >
          {t('hr.payroll.entry.daysOverride.save')}
        </Button>
        <Button size="small" onClick={() => toggleEditing(false)}>
          {t('hr.payroll.entry.daysOverride.cancel')}
        </Button>
      </Space>
    </Space>
  );

  return (
    <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
      {entry.hasOverride ? (
        <Tag color="orange" className="m-0">
          {t('hr.payroll.entry.daysOverride.edited')}
        </Tag>
      ) : null}
      {canOverride ? (
        <Popover
          trigger="click"
          placement="bottom"
          open={editing}
          onOpenChange={toggleEditing}
          content={editor}
          title={t('hr.payroll.entry.daysOverride.action')}
          destroyOnHidden
        >
          <Tooltip title={t('hr.payroll.entry.daysOverride.action')}>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              aria-label={t('hr.payroll.entry.daysOverride.action')}
            />
          </Tooltip>
        </Popover>
      ) : null}
      <Tooltip title={t('hr.payroll.entry.daysOverride.historyTitle')}>
        <Button
          size="small"
          type="text"
          icon={<HistoryOutlined />}
          aria-label={t('hr.payroll.entry.daysOverride.historyTitle')}
          onClick={() => setHistoryOpen(true)}
        />
      </Tooltip>
      <Drawer
        title={t('hr.payroll.entry.daysOverride.historyTitle')}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        destroyOnHidden
      >
        {auditQuery.isLoading ? (
          <div className="py-8 text-center">
            <Spin />
          </div>
        ) : (auditQuery.data ?? []).length === 0 ? (
          <Empty description={t('hr.payroll.entry.daysOverride.historyEmpty')} />
        ) : (
          <div className="text-left">
            <Timeline
              items={(auditQuery.data ?? []).map((record) => ({
                key: record.id,
                content: (
                  <>
                    <p className="m-0 font-medium">
                      {t('hr.payroll.entry.daysOverride.historyChange', {
                        from: record.oldValue,
                        to: record.newValue,
                      })}
                    </p>
                    {record.reason ? (
                      <p className="m-0">
                        {t('hr.payroll.entry.daysOverride.historyReason', {
                          reason: record.reason,
                        })}
                      </p>
                    ) : null}
                    <p className="m-0 text-xs">
                      {t('hr.payroll.entry.daysOverride.historyBy', {
                        name: formatUserName(record.changedBy),
                      })}
                      {' | '}
                      {dayjs(record.changedAt).format('D MMM YYYY, HH:mm')}
                    </p>
                  </>
                ),
              }))}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
