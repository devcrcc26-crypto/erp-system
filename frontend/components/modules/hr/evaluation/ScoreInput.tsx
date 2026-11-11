'use client';

interface ScoreInputProps {
  value?: number | null;
  onChange?: (value: number | null | undefined) => void;
  disabled?: boolean;
}

const SCORE_OPTIONS = [
  { value: 1, label: '1', tooltip: 'Unsatisfactory' },
  { value: 2, label: '2', tooltip: 'Needs Improvement' },
  { value: 3, label: '3', tooltip: 'Meets Expectations' },
  { value: 4, label: '4', tooltip: 'Exceeds Expectations' },
  { value: 5, label: '5', tooltip: 'Outstanding' },
] as const;

export default function ScoreInput({
  value,
  onChange,
  disabled,
}: ScoreInputProps): React.ReactNode {
  const isNaSelected = value === null;

  return (
    <div className="erp-score-input" role="group" aria-label="Score">
      {SCORE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            title={opt.tooltip}
            aria-pressed={selected}
            className={`erp-score-btn erp-score-btn--${opt.value}${
              selected ? ' erp-score-btn--selected' : ''
            }`}
            onClick={() => onChange?.(selected ? undefined : opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        title="Not Applicable"
        aria-pressed={isNaSelected}
        className={`erp-score-btn erp-score-btn--na${
          isNaSelected ? ' erp-score-btn--selected' : ''
        }`}
        onClick={() => onChange?.(isNaSelected ? undefined : null)}
      >
        N/A
      </button>
    </div>
  );
}
