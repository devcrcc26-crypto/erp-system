'use client';

import type {
  OvertimeEditDiff,
  OvertimeEditDiffLine,
} from '@/lib/api/overtime.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const FIELD_I18N: Record<string, string> = {
  date: 'pages.hr.overtime.editDiffField.date',
  otType: 'pages.hr.overtime.editDiffField.otType',
  startTime: 'pages.hr.overtime.editDiffField.startTime',
  endTime: 'pages.hr.overtime.editDiffField.endTime',
  hours: 'pages.hr.overtime.editDiffField.hours',
  reason: 'pages.hr.overtime.editDiffField.reason',
};

type DiffRow = {
  key: string;
  label: string;
  from: string;
  to: string;
  accent?: 'added' | 'removed' | 'changed';
};

/**
 * Approver-facing list of exact OT field values changed since last approval.
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

  const rows = buildDiffRows(editDiff, t);

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
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map((row) => (
            <li
              key={row.key}
              className="rounded-lg border border-[#F5D0AE]/70 bg-white/70 px-3 py-2"
            >
              <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9A3412]">
                {row.label}
              </p>
              <div className="grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {t('pages.hr.overtime.editDiffPrevious')}
                  </p>
                  <p
                    className={`m-0 mt-0.5 break-words text-[13px] leading-snug ${
                      row.accent === 'added'
                        ? 'text-[var(--color-text-secondary)]'
                        : 'text-[var(--color-text-primary)]'
                    }`}
                  >
                    {displayValue(row.from, t)}
                  </p>
                </div>
                <span
                  className="hidden pt-4 text-[var(--color-text-secondary)] sm:block"
                  aria-hidden
                >
                  →
                </span>
                <div className="min-w-0">
                  <p className="m-0 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {t('pages.hr.overtime.editDiffCurrent')}
                  </p>
                  <p
                    className={`m-0 mt-0.5 break-words text-[13px] font-medium leading-snug ${
                      row.accent === 'removed'
                        ? 'text-[var(--color-text-secondary)] line-through'
                        : 'text-[var(--color-text-primary)]'
                    }`}
                  >
                    {displayValue(row.to, t)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[var(--color-text-secondary)]">
          {t('pages.hr.overtime.editDiffNoFieldDetails')}
        </p>
      )}
    </div>
  );
}

function displayValue(
  value: string,
  t: (key: string) => string,
): string {
  if (!value || value === '—') {
    return t('pages.hr.overtime.editDiffEmpty');
  }
  return value;
}

function buildDiffRows(
  editDiff: OvertimeEditDiff,
  t: (key: string, vars?: Record<string, string | number>) => string,
): DiffRow[] {
  const entryChanges = editDiff.entryChanges ?? [];
  if (entryChanges.length > 0) {
    const multi =
      entryChanges.length > 1 ||
      entryChanges.some((row) => row.added || row.removed);
    const rows: DiffRow[] = [];
    for (const entry of entryChanges) {
      const accent = entry.added
        ? 'added'
        : entry.removed
          ? 'removed'
          : 'changed';
      for (const change of entry.changes) {
        const fieldKey = FIELD_I18N[change.field] ?? change.field;
        const fieldLabel = t(fieldKey);
        let label = fieldLabel;
        if (entry.added) {
          label = multi
            ? t('pages.hr.overtime.editDiffAddedFieldDated', {
                date: entry.entryDate ?? '',
                field: fieldLabel,
              })
            : t('pages.hr.overtime.editDiffAddedField', { field: fieldLabel });
        } else if (entry.removed) {
          label = multi
            ? t('pages.hr.overtime.editDiffRemovedFieldDated', {
                date: entry.entryDate ?? '',
                field: fieldLabel,
              })
            : t('pages.hr.overtime.editDiffRemovedField', {
                field: fieldLabel,
              });
        } else if (multi && entry.entryDate) {
          label = t('pages.hr.overtime.editDiffFieldDated', {
            date: entry.entryDate,
            field: fieldLabel,
          });
        }
        rows.push({
          key: `${entry.entryId}-${change.field}-${change.from}-${change.to}`,
          label,
          from: change.from,
          to: change.to,
          accent,
        });
      }
    }
    return rows;
  }

  return (editDiff.summaryLines ?? []).map((line: OvertimeEditDiffLine, index) => ({
    key: `${line.label}-${line.from}-${line.to}-${index}`,
    label: line.label,
    from: line.from,
    to: line.to,
    accent: 'changed' as const,
  }));
}
