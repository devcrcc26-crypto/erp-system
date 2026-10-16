'use client';

import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';

/** Two-column label/value grid used by the employee detail pages. */
export const PROFILE_FIELD_GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

/** Shows `-` for null, undefined, or blank text. */
export function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '-';
}

/**
 * Bordered section - same chrome as the HR employee detail sections.
 */
export function ProfileSection({
  title,
  extra,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  /** Modifier on the section, e.g. `erp-employee-section--docs`. */
  className?: string;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <section className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
        {extra ? <div className="erp-employee-section-extra">{extra}</div> : null}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}

/** One read-only label/value pair inside a `PROFILE_FIELD_GRID`. */
export function ProfileField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}): React.ReactNode {
  const item = <MetaItem label={label}>{children}</MetaItem>;
  return wide ? <div className="sm:col-span-2">{item}</div> : item;
}

/** Icon + message empty state (profile documents styling). */
export function ProfileEmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}): React.ReactNode {
  return (
    <div className="erp-profile-docs-empty">
      <div className="erp-profile-docs-empty-icon" aria-hidden>
        {icon}
      </div>
      <p className="erp-profile-docs-empty-title">{message}</p>
    </div>
  );
}
