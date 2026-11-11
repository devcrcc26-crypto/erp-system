import { describe, expect, it } from 'vitest';
import {
  canSelectRow,
  isExplanationStatusLocked,
  selectAllTargetIds,
} from './explain-days-selection';
import type { ExplainDaysTableRow } from './explain-days-selection';

function row(
  partial: Partial<ExplainDaysTableRow> & Pick<ExplainDaysTableRow, 'id'>,
): ExplainDaysTableRow {
  return {
    issueType: 'MISSING_CLOCK_OUT',
    explanationStatus: 'NOT_EXPLAINED',
    selectable: true,
    ...partial,
  };
}

describe('explain-days selection', () => {
  it('submitted rows are not selectable', () => {
    expect(isExplanationStatusLocked('SUBMITTED')).toBe(true);
    const rows = [row({ id: '1', explanationStatus: 'SUBMITTED' })];
    expect(canSelectRow(rows[0]!, new Set(), rows)).toBe(false);
  });

  it('select-all respects issue anchor', () => {
    const rows: ExplainDaysTableRow[] = [
      row({ id: 'a', issueType: 'MISSING_CLOCK_OUT' }),
      row({ id: 'b', issueType: 'MISSING_CLOCK_OUT' }),
      row({ id: 'c', issueType: 'EARLY_DEPARTURE' }),
    ];
    const ids = selectAllTargetIds(rows, new Set(['a']));
    expect(ids).toEqual(['a', 'b']);
  });

  it('select-all skips draft rows and keeps unexplained of preferred issue', () => {
    const rows: ExplainDaysTableRow[] = [
      row({
        id: 'draft-a',
        issueType: 'MISSING_CLOCK_OUT',
        explanationStatus: 'DRAFT',
      }),
      row({ id: 'open-a', issueType: 'MISSING_CLOCK_OUT' }),
      row({ id: 'open-b', issueType: 'EARLY_DEPARTURE' }),
    ];
    const ids = selectAllTargetIds(rows, new Set(), 'MISSING_CLOCK_OUT');
    expect(ids).toEqual(['open-a']);
  });

  it('select-all falls through to next unexplained issue when preferred is exhausted', () => {
    const rows: ExplainDaysTableRow[] = [
      row({
        id: 'draft-a',
        issueType: 'MISSING_CLOCK_OUT',
        explanationStatus: 'DRAFT',
      }),
      row({ id: 'open-b', issueType: 'EARLY_DEPARTURE' }),
      row({ id: 'open-c', issueType: 'EARLY_DEPARTURE' }),
    ];
    const ids = selectAllTargetIds(rows, new Set(), 'MISSING_CLOCK_OUT');
    expect(ids).toEqual(['open-b', 'open-c']);
  });

  it('MISSING_CLOCK_IN and EARLY_DEPARTURE cannot be selected together', () => {
    const rows: ExplainDaysTableRow[] = [
      row({ id: 'in', issueType: 'MISSING_CLOCK_IN' }),
      row({ id: 'early', issueType: 'EARLY_DEPARTURE' }),
    ];
    expect(canSelectRow(rows[1]!, new Set(['in']), rows)).toBe(false);
  });
});
