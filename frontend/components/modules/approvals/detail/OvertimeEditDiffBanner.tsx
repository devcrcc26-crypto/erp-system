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
};

/**
 * Approver-facing table of OT entries changed since last approval.
 * Shows each entry as a whole (previous vs current), not field-by-field.
 */
export default function OvertimeEditDiffBanner({
  editDiff,
}: {
  editDiff: OvertimeEditDiff | null | undefined;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (!editDiff?.editedAfterApproval) {
    return null;
  }

  const rows = buildTableRows(editDiff);

  const columns: ColumnsType<DiffTableRow> = [
    {
      title: t('pages.hr.overtime.editDiffChange'),
      dataIndex: 'kind',
      key: 'kind',
      width: 120,
      render: (kind: DiffTableRow['kind']) => {
        if (kind === 'added') {
          return (
            <Tag color="success" className="!m-0">
              {t('pages.hr.overtime.editDiffKindAdded')}
            </Tag>
          );
        }
        if (kind === 'removed') {
          return (
            <Tag color="error" className="!m-0">
              {t('pages.hr.overtime.editDiffKindRemoved')}
            </Tag>
          );
        }
        return (
          <Tag color="warning" className="!m-0">
            {t('pages.hr.overtime.editDiffKindUpdated')}
          </Tag>
        );
      },
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
        />
      ),
    },
  ];

  return (
    <div
      className="rounded-xl border border-[#F5D0AE] bg-[#FEF6EE] px-4 py-3 text-[13px] text-[#1A1A1A]"
      role="status"
    >
      <p className="m-0 mb-1 font-semibold text-[#9A3412]">
        {t('pages.hr.overtime.editDiffTitle')}
      </p>
      <p className="m-0 mb-3 text-[12px] text-[var(--color-text-secondary)]">
        {editDiff.reasonOnly
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
}: {
  summary: OvertimeEntryDiffSummary | null;
  muted?: boolean;
  strike?: boolean;
  emptyLabel: string;
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
