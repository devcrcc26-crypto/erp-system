'use client';

import { useMemo } from 'react';
import type { Risk } from '@/lib/api/project-management.types';
import {
  RISK_IMPACT_OPTIONS,
  RISK_LIKELIHOOD_OPTIONS,
} from '@/lib/utils/pm-status-display';

export interface RiskMatrixCell {
  likelihood: number;
  impact: number;
}

type MatrixRisk = Pick<
  Risk,
  | 'probability'
  | 'impact'
  | 'residualLikelihood'
  | 'residualImpact'
  | 'status'
>;

/**
 * Matrix grid position for a risk: residual when present, else inherent.
 * Closed risks are omitted from the matrix.
 */
export function getRiskMatrixPosition(
  risk: MatrixRisk,
): RiskMatrixCell | null {
  if (risk.status === 'CLOSED') {
    return null;
  }

  const likelihood =
    risk.residualLikelihood != null
      ? risk.residualLikelihood
      : risk.probability;
  const impact =
    risk.residualImpact != null ? risk.residualImpact : risk.impact;

  return { likelihood, impact };
}

/** True when the risk belongs on the given matrix cell (same residual/inherent rules). */
export function matchesRiskMatrixCell(
  risk: MatrixRisk,
  cell: RiskMatrixCell,
): boolean {
  const pos = getRiskMatrixPosition(risk);
  if (!pos) {
    return false;
  }
  return pos.likelihood === cell.likelihood && pos.impact === cell.impact;
}

function cellColor(score: number): string {
  if (score >= 20) return '#fef2f2';
  if (score >= 10) return '#fff7ed';
  if (score >= 5) return '#fefce8';
  return '#f0fdf4';
}

/**
 * 5x5 likelihood/impact grid with per-cell risk counts. Purely presentational
 * - counting is done by the caller passing in the risk set the matrix should
 * summarize (should be the full project/portfolio set, not a paginated page).
 */
export default function RiskMatrix({
  risks,
  selectedCell,
  onCellClick,
}: {
  risks: MatrixRisk[];
  selectedCell: RiskMatrixCell | null;
  onCellClick: (cell: RiskMatrixCell | null) => void;
}): React.ReactNode {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const risk of risks) {
      const pos = getRiskMatrixPosition(risk);
      if (!pos) {
        continue;
      }
      const key = `${pos.likelihood}-${pos.impact}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [risks]);

  const likelihoodRows = useMemo(
    () => [...RISK_LIKELIHOOD_OPTIONS].reverse(),
    [],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-center">
        <thead>
          <tr>
            <th className="w-28" />
            <th
              colSpan={RISK_IMPACT_OPTIONS.length}
              className="pb-1 text-[11px] font-medium text-slate-500"
            >
              Impact
            </th>
          </tr>
          <tr>
            <th className="pr-2 text-right text-[11px] font-medium text-slate-500">
              Likelihood
            </th>
            {RISK_IMPACT_OPTIONS.map((impact) => (
              <th
                key={impact.value}
                className="px-2 py-1 text-[11px] font-medium text-slate-600"
              >
                {impact.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {likelihoodRows.map((likelihood) => (
            <tr key={likelihood.value}>
              <th className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-medium text-slate-600">
                {likelihood.label}
              </th>
              {RISK_IMPACT_OPTIONS.map((impact) => {
                const score = likelihood.value * impact.value;
                const count =
                  counts.get(`${likelihood.value}-${impact.value}`) ?? 0;
                const isSelected =
                  selectedCell?.likelihood === likelihood.value &&
                  selectedCell?.impact === impact.value;
                return (
                  <td key={impact.value} className="p-1">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        onCellClick(
                          isSelected
                            ? null
                            : {
                                likelihood: likelihood.value,
                                impact: impact.value,
                              },
                        )
                      }
                      className="flex h-12 w-full flex-col items-center justify-center rounded transition-shadow"
                      style={{
                        backgroundColor: cellColor(score),
                        boxShadow: isSelected
                          ? 'inset 0 0 0 2px #1677ff'
                          : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                      }}
                    >
                      <span className="text-sm font-semibold text-slate-800">
                        {count > 0 ? count : ''}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
