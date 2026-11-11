'use client';

/**
 * Shared visual chrome for HR / approval detail sections.
 */

export function SectionCard({
  title,
  children,
  action,
  bodyClassName = '',
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
        {action ? (
          <div className="erp-employee-section-extra">{action}</div>
        ) : null}
      </div>
      <div
        className={
          bodyClassName.includes('p-0')
            ? bodyClassName
            : `erp-employee-section-body ${bodyClassName}`.trim()
        }
      >
        {children}
      </div>
    </div>
  );
}

export function SubsectionHeader({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}): React.ReactNode {
  return (
    <div className="mb-3">
      <div className="mb-0.5 flex items-center gap-2">
        {icon ? (
          <span className="flex-shrink-0 text-[var(--color-text-tertiary)]">
            {icon}
          </span>
        ) : null}
        <h4 className="m-0 text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </h4>
      </div>
      {description ? (
        <p
          className={`m-0 text-xs text-[var(--color-text-tertiary)] ${icon ? 'ml-[23px]' : ''}`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p className="erp-users-stat-label m-0 mb-1">{label}</p>
      <div className="text-sm text-[var(--color-text-primary)]">{children}</div>
    </div>
  );
}

export function SummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode; emphasize?: boolean }>;
}): React.ReactNode {
  const cols =
    items.length >= 5
      ? 'sm:grid-cols-3 lg:grid-cols-5'
      : items.length === 4
        ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'sm:grid-cols-3';

  return (
    <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${cols}`}>
      {items.map(({ label, value, emphasize }) => (
        <div
          key={label}
          className="min-w-0 rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] sm:px-5 sm:py-4"
        >
          <p className="erp-users-stat-label m-0 mb-1">{label}</p>
          <div
            className={`leading-snug ${
              emphasize
                ? 'text-base font-bold text-[var(--color-text-primary)]'
                : 'text-sm font-semibold text-[var(--color-text-primary)]'
            }`}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
