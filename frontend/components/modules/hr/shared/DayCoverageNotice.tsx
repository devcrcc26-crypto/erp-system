'use client';

import { Alert, Spin } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  DayCover,
  DayCoverModule,
} from '@/lib/api/day-coverage.types';
import { useDayCoverage } from '@/lib/query/day-coverage';

function moduleLabel(
  module: DayCoverModule,
  t: (key: string) => string,
): string {
  switch (module) {
    case 'LEAVE':
      return t('hr.dayCoverage.modules.leave');
    case 'SITE_ASSIGNMENT':
      return t('hr.dayCoverage.modules.siteAssignment');
    case 'WORK_FROM_HOME':
      return t('hr.dayCoverage.modules.workFromHome');
    case 'FIELD_MOVEMENT':
      return t('hr.dayCoverage.modules.fieldMovement');
    case 'ATTENDANCE':
      return t('hr.dayCoverage.modules.attendance');
    default:
      return module;
  }
}

function coverLine(
  cover: DayCover,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  const module = moduleLabel(cover.module, t);
  const ref = cover.reference?.trim()
    ? t('hr.dayCoverage.reference', { ref: cover.reference })
    : '';
  if (cover.state === 'APPROVED') {
    return t('hr.dayCoverage.itemApproved', {
      date: cover.date,
      module,
      ref,
    });
  }
  return t('hr.dayCoverage.itemRequested', {
    date: cover.date,
    module,
    ref,
  });
}

/**
 * Warns when selected dates already have leave / site / WFH / field movement.
 */
export default function DayCoverageNotice({
  employeeId,
  from,
  to,
  focus,
  className,
  extraLines,
}: {
  employeeId: string | undefined;
  from: string | null;
  to: string | null;
  focus?: DayCoverModule;
  className?: string;
  /** Extra module-specific lines (e.g. existing overtime on that date). */
  extraLines?: string[];
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const params =
    employeeId && from && to
      ? { employeeId, from, to, focus }
      : null;
  const query = useDayCoverage(params);

  const covers = query.data?.covers ?? [];
  const lines = [
    ...covers.map((cover) => coverLine(cover, t)),
    ...(extraLines ?? []),
  ];

  if (!params) {
    return null;
  }

  if (query.isLoading || query.isFetching) {
    return (
      <div className={className}>
        <Spin size="small" />
        <span className="ml-2 text-[13px] text-[var(--color-text-secondary)]">
          {t('hr.dayCoverage.checking')}
        </span>
      </div>
    );
  }

  if (lines.length === 0) {
    return null;
  }

  return (
    <Alert
      type="warning"
      showIcon
      className={className}
      title={t('hr.dayCoverage.title')}
      description={
        <ul className="m-0 list-disc pl-4">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      }
    />
  );
}
