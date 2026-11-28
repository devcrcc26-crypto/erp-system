'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Input,
  Modal,
  Space,
  TimePicker,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApproveWithChangesPayload } from '@/lib/api/approvals.types';
import type { OvertimeEntry, OvertimeSheetDetail } from '@/lib/api/overtime.types';
import { useApproveApprovalTierWithChanges } from '@/lib/query/approvals';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type DraftEntry = {
  key: string;
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  taskDescription: string;
  reason: string;
  /** Snapshot at open for change detection. */
  original?: {
    date: string;
    startTime: string;
    endTime: string;
    taskDescription: string;
  };
};

type RemovedDraft = { id: string; reason: string; label: string };

function entryToDraft(entry: OvertimeEntry): DraftEntry {
  const date = dayjs(entry.date).format('YYYY-MM-DD');
  return {
    key: entry.id,
    id: entry.id,
    date,
    startTime: entry.startTime,
    endTime: entry.endTime,
    taskDescription: entry.taskDescription,
    reason: '',
    original: {
      date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      taskDescription: entry.taskDescription,
    },
  };
}

function isChanged(row: DraftEntry): boolean {
  if (!row.id || !row.original) {
    return true;
  }
  return (
    row.date !== row.original.date ||
    row.startTime !== row.original.startTime ||
    row.endTime !== row.original.endTime ||
    row.taskDescription.trim() !== row.original.taskDescription.trim()
  );
}

/**
 * Reports-to approver edits OT entries locally, then submits approve-with-changes.
 */
export default function OvertimeApproveWithChangesModal({
  open,
  onClose,
  requestId,
  tierId,
  sheet,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string;
  tierId: string;
  sheet: OvertimeSheetDetail | null | undefined;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const mutation = useApproveApprovalTierWithChanges(requestId);

  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [removed, setRemoved] = useState<RemovedDraft[]>([]);
  const [overallNote, setOverallNote] = useState('');

  useEffect(() => {
    if (!open || !sheet) {
      return;
    }
    setEntries(sheet.entries.map(entryToDraft));
    setRemoved([]);
    setOverallNote('');
  }, [open, sheet]);

  const changeCount = useMemo(() => {
    const changed = entries.filter((e) => isChanged(e)).length;
    return changed + removed.length;
  }, [entries, removed]);

  const reasonInvalid = useMemo(() => {
    for (const row of entries) {
      if (isChanged(row) && row.reason.trim().length < 5) {
        return true;
      }
    }
    for (const row of removed) {
      if (row.reason.trim().length < 5) {
        return true;
      }
    }
    return false;
  }, [entries, removed]);

  function updateEntry(key: string, patch: Partial<DraftEntry>): void {
    setEntries((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addEntry(): void {
    const date =
      sheet != null
        ? dayjs(`${sheet.year}-${String(sheet.month).padStart(2, '0')}-01`).format(
            'YYYY-MM-DD',
          )
        : dayjs().format('YYYY-MM-DD');
    setEntries((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        date,
        startTime: '18:00',
        endTime: '20:00',
        taskDescription: '',
        reason: '',
      },
    ]);
  }

  function removeEntry(row: DraftEntry): void {
    if (row.id) {
      setRemoved((prev) => [
        ...prev,
        {
          id: row.id!,
          reason: '',
          label: `${row.date} ${row.startTime}–${row.endTime}`,
        },
      ]);
    }
    setEntries((prev) => prev.filter((e) => e.key !== row.key));
  }

  async function handleSubmit(): Promise<void> {
    if (!sheet || changeCount === 0) {
      messageApi.warning(t('pages.hr.overtime.approveWithChangesNeedChange'));
      return;
    }
    if (reasonInvalid) {
      messageApi.warning(t('pages.approvals.dialog.decisionReasonRequired'));
      return;
    }
    for (const row of entries) {
      if (!row.taskDescription.trim()) {
        messageApi.warning(t('pages.hr.overtime.approveWithChangesTaskRequired'));
        return;
      }
    }

    const payload: ApproveWithChangesPayload = {
      ...(overallNote.trim() ? { note: overallNote.trim() } : {}),
      entries: entries.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        taskDescription: row.taskDescription.trim(),
        ...(isChanged(row) ? { reason: row.reason.trim() } : {}),
      })),
      ...(removed.length > 0
        ? {
            removedEntries: removed.map((r) => ({
              id: r.id,
              reason: r.reason.trim(),
            })),
          }
        : {}),
    };

    try {
      await mutation.mutateAsync({ tierId, payload });
      messageApi.success(t('pages.hr.overtime.approveWithChangesSuccess'));
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        t('pages.hr.overtime.approveWithChangesFailed'),
        messageApi,
      );
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('pages.hr.overtime.approveWithChanges')}
      width={720}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            loading={mutation.isPending}
            disabled={changeCount === 0 || reasonInvalid}
            onClick={() => void handleSubmit()}
          >
            {t('pages.hr.overtime.approveWithChangesConfirm')}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" className="!mt-0">
        {t('pages.hr.overtime.approveWithChangesHint')}
      </Typography.Paragraph>

      <div className="mb-3 flex justify-end">
        <Button icon={<PlusOutlined />} onClick={addEntry}>
          {t('pages.hr.overtime.approveWithChangesAdd')}
        </Button>
      </div>

      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
        {entries.map((row) => {
          const changed = isChanged(row);
          return (
            <div
              key={row.key}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated,#fff)] p-3"
            >
              <div className="mb-2 flex flex-wrap gap-2">
                <DatePicker
                  value={dayjs(row.date)}
                  onChange={(v: Dayjs | null) =>
                    updateEntry(row.key, {
                      date: v ? v.format('YYYY-MM-DD') : row.date,
                    })
                  }
                  allowClear={false}
                />
                <TimePicker
                  format="HH:mm"
                  value={dayjs(row.startTime, 'HH:mm')}
                  onChange={(v) =>
                    updateEntry(row.key, {
                      startTime: v ? v.format('HH:mm') : row.startTime,
                    })
                  }
                  allowClear={false}
                  needConfirm={false}
                />
                <TimePicker
                  format="HH:mm"
                  value={
                    row.endTime === '24:00'
                      ? dayjs('23:59', 'HH:mm')
                      : dayjs(row.endTime, 'HH:mm')
                  }
                  onChange={(v) =>
                    updateEntry(row.key, {
                      endTime: v ? v.format('HH:mm') : row.endTime,
                    })
                  }
                  allowClear={false}
                  needConfirm={false}
                />
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeEntry(row)}
                  aria-label={t('pages.hr.overtime.approveWithChangesRemove')}
                />
              </div>
              <Input.TextArea
                rows={2}
                value={row.taskDescription}
                onChange={(e) =>
                  updateEntry(row.key, { taskDescription: e.target.value })
                }
                placeholder={t('hr.taskDescription')}
                className="!mb-2"
              />
              {changed ? (
                <Input.TextArea
                  rows={2}
                  value={row.reason}
                  status={row.reason.trim().length < 5 ? 'error' : undefined}
                  onChange={(e) =>
                    updateEntry(row.key, { reason: e.target.value })
                  }
                  placeholder={t(
                    'pages.hr.overtime.approveWithChangesReasonPlaceholder',
                  )}
                />
              ) : null}
            </div>
          );
        })}

        {removed.map((row) => (
          <div
            key={row.id}
            className="rounded-lg border border-red-200 bg-red-50 p-3"
          >
            <p className="m-0 mb-2 text-[13px] font-medium text-red-800">
              {t('pages.hr.overtime.approveWithChangesRemoving', {
                label: row.label,
              })}
            </p>
            <Input.TextArea
              rows={2}
              value={row.reason}
              status={row.reason.trim().length < 5 ? 'error' : undefined}
              onChange={(e) =>
                setRemoved((prev) =>
                  prev.map((r) =>
                    r.id === row.id ? { ...r, reason: e.target.value } : r,
                  ),
                )
              }
              placeholder={t(
                'pages.hr.overtime.approveWithChangesReasonPlaceholder',
              )}
            />
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Typography.Text className="mb-1 block text-[12px] text-[var(--color-text-secondary)]">
          {t('pages.hr.overtime.approveWithChangesOverallNote')}
        </Typography.Text>
        <Input.TextArea
          rows={2}
          value={overallNote}
          onChange={(e) => setOverallNote(e.target.value)}
          placeholder={t('pages.approvals.dialog.notePlaceholder')}
        />
      </div>
    </Modal>
  );
}
