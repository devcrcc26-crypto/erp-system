'use client';

interface ScoreInputProps {
  value?: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
}

const SCORE_OPTIONS = [
  { value: 1, label: '1', tooltip: 'Unsatisfactory' },
  { value: 2, label: '2', tooltip: 'Needs Improvement' },
  { value: 3, label: '3', tooltip: 'Meets Expectations' },
  { value: 4, label: '4', tooltip: 'Exceeds Expectations' },
  { value: 5, label: '5', tooltip: 'Outstanding' },
] as const;

const SCORE_COLORS: Record<number, string> = {
  1: '#f5222d',
  2: '#fa8c16',
  3: '#faad14',
  4: '#1677ff',
  5: '#52c41a',
};

export default function ScoreInput({
  value,
  onChange,
  disabled,
}: ScoreInputProps): React.ReactNode {
  const isNaSelected = value === null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {SCORE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            title={opt.tooltip}
            onClick={() => onChange?.(selected ? null : opt.value)}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `2px solid ${
                selected ? SCORE_COLORS[opt.value] : 'var(--color-border)'
              }`,
              background: selected ? SCORE_COLORS[opt.value] : 'transparent',
              color: selected ? '#fff' : 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        title="Not Applicable"
        onClick={() => onChange?.(null)}
        style={{
          padding: '0 10px',
          height: 32,
          borderRadius: 16,
          border: `2px solid ${
            isNaSelected
              ? 'var(--color-text-tertiary)'
              : 'var(--color-border)'
          }`,
          background: 'transparent',
          color: 'var(--color-text-tertiary)',
          fontSize: 11,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        N/A
      </button>
    </div>
  );
}
