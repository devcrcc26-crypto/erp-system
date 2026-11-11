'use client';

import { UserRoundX } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAwaitingEnrolment } from '@/lib/query/attendance';

/**
 * Open enrolment list on the attendance page: employees marked "Needs
 * enrolment" who have no scan in any later import. The server derives it from
 * current records, so an import with scans removes them automatically.
 */
export default function AttendanceAwaitingEnrolment(): React.ReactNode {
  const { t } = useEpcTranslation();
  const query = useAwaitingEnrolment();
  const rows = query.data ?? [];

  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="att-awaiting-enrolment-title"
      className="mt-4 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]"
    >
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"
          aria-hidden
        >
          <UserRoundX size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2
            id="att-awaiting-enrolment-title"
            className="m-0 flex items-center gap-2 text-[15px] font-semibold text-slate-900"
          >
            {t('pages.hr.attendance.awaitingEnrolment.title')}
            <span className="rounded-full bg-amber-50 px-2 py-px text-xs font-semibold text-amber-800">
              {rows.length}
            </span>
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-slate-600">
            {t('pages.hr.attendance.awaitingEnrolment.description')}
          </p>
        </div>
      </div>
      <ul className="m-0 list-none divide-y divide-slate-100 p-0">
        {rows.map((row) => (
          <li
            key={row.employeeId}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-slate-900">
                {row.name}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {row.employeeCode ? (
                  <span className="rounded-md bg-slate-100 px-1.5 py-px font-mono text-slate-700">
                    {row.employeeCode}
                  </span>
                ) : null}
                {row.departmentName ? <span>{row.departmentName}</span> : null}
              </div>
            </div>
            <span className="text-xs text-slate-600">
              {t('pages.hr.attendance.awaitingEnrolment.since', {
                month: t(`hr.months.${row.since.month}`),
                year: row.since.year,
              })}
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset">
              {t(
                row.months === 1
                  ? 'pages.hr.attendance.awaitingEnrolment.monthsOne'
                  : 'pages.hr.attendance.awaitingEnrolment.monthsMany',
                { count: row.months },
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
