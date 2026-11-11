'use client';

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  slate: { bg: '#F1F5F9', fg: '#64748B' },
} as const;

export type OrgListStatAccent = keyof typeof STAT_ACCENT;

/**
 * Clickable (or static) stat chip for organization list pages - Users chrome.
 */
export function OrgListStat({
  label,
  value,
  accent,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent: OrgListStatAccent;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  const className = `erp-users-stat erp-contract-stat${active ? ' erp-contract-stat--active' : ''}${onClick ? '' : ' erp-contract-stat--static'}`;

  const body = (
    <>
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
      </div>
    </>
  );

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  );
}
