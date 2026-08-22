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
    <div className="overflow-hidden rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5">
        <h3 className="m-0 min-w-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {title}
        </h3>
        {action ? <div className="min-w-0 shrink-0">{action}</div> : null}
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
          className="min-w-0 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-4"
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
