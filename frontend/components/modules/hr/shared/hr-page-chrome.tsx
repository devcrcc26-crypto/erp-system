'use client';

/**
 * Shared visual chrome for HR detail pages (design only).
 */

export function SectionCard({
  title,
  children,
  action,
  bodyClassName = 'p-0',
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] m-0">
          {title}
        </h3>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
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
      <div className="flex items-center gap-2 mb-0.5">
        {icon ? (
          <span className="text-[var(--color-text-tertiary)] flex-shrink-0">
            {icon}
          </span>
        ) : null}
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
          {title}
        </h4>
      </div>
      {description ? (
        <p
          className={`text-xs text-[var(--color-text-tertiary)] m-0 ${icon ? 'ml-[23px]' : ''}`}
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
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
        {label}
      </p>
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
    <div className={`grid grid-cols-2 gap-3 ${cols}`}>
      {items.map(({ label, value, emphasize }) => (
        <div
          key={label}
          className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] px-4 py-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
            {label}
          </p>
          <div
            className={`text-sm leading-snug ${
              emphasize
                ? 'text-base font-bold text-[var(--color-text-primary)]'
                : 'font-semibold text-[var(--color-text-primary)]'
            }`}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
