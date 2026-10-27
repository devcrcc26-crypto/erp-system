'use client';

import type { OvertimeEditDiff } from '@/lib/api/overtime.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Approver-facing summary of OT fields changed since the last approval.
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

  const lines = editDiff.summaryLines ?? [];
  const reasonOnly =
    editDiff.reasonOnly ||
    (lines.length === 1 && lines[0]?.to === 'Only the reason was updated.');

  return (
    <div
      className="rounded-xl border border-[#F5D0AE] bg-[#FEF6EE] px-4 py-3 text-[13px] text-[#1A1A1A]"
      role="status"
    >
      <p className="m-0 mb-2 font-semibold text-[#9A3412]">
        {t('pages.hr.overtime.editDiffTitle')}
      </p>
      {reasonOnly ? (
        <p className="m-0 text-[var(--color-text-secondary)]">
          {t('pages.hr.overtime.editDiffReasonOnly')}
        </p>
      ) : lines.length > 0 ? (
        <dl className="m-0 grid gap-1.5 font-mono text-[12px] leading-relaxed sm:grid-cols-[auto_1fr]">
          {lines.map((line) => (
            <div
              key={`${line.label}-${line.from}-${line.to}`}
              className="contents"
            >
              <dt className="pr-3 font-sans font-medium text-[var(--color-text-secondary)]">
                {line.label}
              </dt>
              <dd className="m-0 font-sans text-[var(--color-text-primary)]">
                {line.from ? (
                  <>
                    <span className="text-[var(--color-text-secondary)]">
                      {line.from}
                    </span>
                    <span className="mx-2 text-[var(--color-text-secondary)]" aria-hidden>
                      →
                    </span>
                    <span className="font-medium">{line.to}</span>
                  </>
                ) : (
                  <span className="font-medium">{line.to}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
