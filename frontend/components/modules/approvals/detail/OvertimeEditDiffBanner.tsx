'use client';

import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  OvertimeEditDiff,
  OvertimeEntryDiffSummary,
} from '@/lib/api/overtime.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

type DiffTableRow = {
  key: string;
  kind: 'added' | 'removed' | 'updated';
  before: OvertimeEntryDiffSummary | null;
  after: OvertimeEntryDiffSummary | null;
  increasedByApprover?: boolean;
  reason?: string;
};

/**
 * Approver-facing table of OT entries changed since last approval,
 * or adjusted by the Reports-to approver during approve-with-changes.
 */
export default function OvertimeEditDiffBanner({
  editDiff,
}: {
  editDiff: OvertimeEditDiff | null | undefined;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const showEmployeeEdit = Boolean(editDiff?.editedAfterApproval);
  const showApproverEdit = Boolean(editDiff?.editedByApprover);
  if (!editDiff || (!showEmployeeEdit && !showApproverEdit)) {
    return null;
  }

  const rows = buildTableRows(editDiff);

  const columns: ColumnsType<DiffTableRow> = [
    {
      title: t('pages.hr.overtime.editDiffChange'),
      dataIndex: 'kind',
      key: 'kind',
      width: 160,
      render: (kind: DiffTableRow['kind'], row) => (
        <div className="flex flex-col gap-1">
          {kind === 'added' ? (
            <Tag color="success" className="!m-0 w-fit">
              {t('pages.hr.overtime.editDiffKindAdded')}
            </Tag>
          ) : kind === 'removed' ? (
            <Tag color="error" className="!m-0 w-fit">
              {t('pages.hr.overtime.editDiffKindRemoved')}
            </Tag>
          ) : (
            <Tag color="warning" className="!m-0 w-fit">
              {t('pages.hr.overtime.editDiffKindUpdated')}
            </Tag>
          )}
          {row.increasedByApprover ? (
            <Tag color="orange" className="!m-0 w-fit">
              {t('pages.hr.overtime.increasedByApprover')}
            </Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: t('pages.hr.overtime.editDiffPrevious'),
      dataIndex: 'before',
      key: 'before',
      render: (before: OvertimeEntryDiffSummary | null) => (
        <EntryWhole summary={before} muted={!before} emptyLabel={t('pages.hr.overtime.editDiffEmpty')} />
      ),
    },
    {
      title: t('pages.hr.overtime.editDiffCurrent'),
      dataIndex: 'after',
      key: 'after',
      render: (after: OvertimeEntryDiffSummary | null, row) => (
        <EntryWhole
          summary={after}
          muted={!after}
          strike={row.kind === 'removed'}
          emptyLabel={t('pages.hr.overtime.editDiffEmpty')}
          reason={row.reason}
        />
      ),
    },
  ];

  return (
    <div
      className="rounded-xl border border-[#F5D0AE] bg-[#FEF6EE] px-4 py-3 text-[13px] text-slate-900"
      role="status"
    >
      <p className="m-0 mb-1 font-semibold text-[#9A3412]">
        {showApproverEdit
          ? t('pages.hr.overtime.editDiffTitleByApprover')
          : t('pages.hr.overtime.editDiffTitle')}
      </p>
      {editDiff.approverHoursSummary ? (
        <p className="m-0 mb-2 text-[12px] font-medium text-[#9A3412]">
          {editDiff.approverHoursSummary}
        </p>
      ) : null}
      <p className="m-0 mb-3 text-[12px] text-[var(--color-text-secondary)]">
        {showApproverEdit
          ? t('pages.hr.overtime.editDiffSubtitleByApprover')
          : editDiff.reasonOnly
            ? t('pages.hr.overtime.editDiffReasonOnlyExact')
            : t('pages.hr.overtime.editDiffSubtitle')}
      </p>
      {rows.length > 0 ? (
        <Table<DiffTableRow>
          size="small"
          pagination={false}
          rowKey="key"
          columns={columns}
          dataSource={rows}
          className="overflow-hidden rounded-lg border border-[#F5D0AE]/70 bg-white [&_.ant-table]:bg-white"
          scroll={{ x: true }}
        />
      ) : (
        <p className="m-0 text-[var(--color-text-secondary)]">
          {t('pages.hr.overtime.editDiffNoFieldDetails')}
        </p>
      )}
    </div>
  );
}

function EntryWhole({
  summary,
  muted = false,
  strike = false,
  emptyLabel,
  reason,
}: {
  summary: OvertimeEntryDiffSummary | null;
  muted?: boolean;
  strike?: boolean;
  emptyLabel: string;
  reason?: string;
}): React.ReactNode {
  if (!summary) {
    return (
      <span className="text-[var(--color-text-secondary)]">{emptyLabel}</span>
    );
  }

  return (
    <div
      className={`min-w-[180px] max-w-[360px] space-y-0.5 leading-snug ${
        muted || strike ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'
      } ${strike ? 'line-through' : ''}`}
    >
      <p className="m-0 font-medium">
        {summary.date}
        <span className="mx-1.5 text-[var(--color-text-secondary)]">·</span>
        {summary.otType}
      </p>
      <p className="m-0">
        {summary.startTime}
        <span className="mx-1 text-[var(--color-text-secondary)]" aria-hidden>
          →
        </span>
        {summary.endTime}
        <span className="mx-1.5 text-[var(--color-text-secondary)]">·</span>
        {summary.hours}
      </p>
      <p className="m-0 break-words whitespace-pre-wrap">{summary.reason}</p>
      {reason ? (
        <p className="m-0 break-words text-[12px] text-[#9A3412] whitespace-pre-wrap">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

function buildTableRows(editDiff: OvertimeEditDiff): DiffTableRow[] {
  const entryChanges = editDiff.entryChanges ?? [];
  if (entryChanges.length > 0) {
    return entryChanges.map((entry) => ({
      key: entry.entryId,
      kind: entry.added ? 'added' : entry.removed ? 'removed' : 'updated',
      before: entry.before ?? null,
      after: entry.after ?? null,
      increasedByApprover: entry.increasedByApprover,
      reason: entry.reason,
    }));
  }

  // Fallback for older payloads that only have summaryLines.
  return (editDiff.summaryLines ?? []).map((line, index) => {
    const kind: DiffTableRow['kind'] = line.label.startsWith('Added')
      ? 'added'
      : line.label.startsWith('Removed')
        ? 'removed'
        : 'updated';
    return {
      key: `summary-${index}`,
      kind,
      before:
        line.from && line.from !== '—'
          ? parseWholeFallback(line.from)
          : null,
      after:
        line.to && line.to !== '—' ? parseWholeFallback(line.to) : null,
    };
  });
}

function parseWholeFallback(text: string): OvertimeEntryDiffSummary {
  const lines = text.split('\n');
  const head = lines[0] ?? '';
  const mid = lines[1] ?? '';
  const reason = lines.slice(2).join('\n') || '—';
  const [date = '—', otType = '—'] = head.split(' · ');
  const timeMatch = mid.match(/^(.+?)\s*→\s*(.+?)\s*·\s*(.+)$/);
  return {
    date: date.trim(),
    otType: (otType ?? '—').trim(),
    startTime: timeMatch?.[1]?.trim() ?? '—',
    endTime: timeMatch?.[2]?.trim() ?? '—',
    hours: timeMatch?.[3]?.trim() ?? '—',
    reason,
  };
}
