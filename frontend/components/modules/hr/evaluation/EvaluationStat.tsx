'use client';

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
  slate: { bg: '#F1F3F5', fg: '#5F6B7A' },
} as const;

export type EvaluationStatAccent = keyof typeof STAT_ACCENT;

interface EvaluationStatProps {
  label: string;
  value: number;
  accent: EvaluationStatAccent;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

/**
 * Segmented KPI chip used on evaluation list pages (Users / Leave chrome).
 */
export default function EvaluationStat({
  label,
  value,
  accent,
  icon,
  active = false,
  onClick,
}: EvaluationStatProps): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  const className = `erp-users-stat erp-contract-stat${
    active ? ' erp-contract-stat--active' : ''
  }${onClick ? '' : ' erp-contract-stat--static'}`;

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
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
      </button>
    );
  }

  return (
    <div className={className}>
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
    </div>
  );
}
