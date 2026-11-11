import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FieldMovementEntryFields from './FieldMovementEntryFields';
import type {
  FieldMovementFieldKey,
  FieldMovementReasonType,
  ForgotDirection,
} from '@/lib/generated/field-movement-field-rules';

beforeAll(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

const labels = {
  date: 'Date',
  timeOut: 'Time out',
  returnTime: 'Return time',
  clockInTime: 'Stated clock-in time',
  clockOutTime: 'Stated clock-out time',
  forgotDirection: 'Forgot which scan',
  location: 'Location / destination',
  reasonNote: 'Reason / note',
  attachment: 'Attachment',
} satisfies Record<FieldMovementFieldKey, string>;

const reasonTypeLabels = {
  FIELD_VISIT: 'Field / site visit',
  EARLY_LEAVE: 'Left early',
  FORGOT: 'Forgot to clock',
} satisfies Record<FieldMovementReasonType, string>;

const forgotDirectionLabels = {
  IN: 'In',
  OUT: 'Out',
  BOTH: 'Both',
} satisfies Record<ForgotDirection, string>;

describe('FieldMovementEntryFields', () => {
  it('shows required asterisk on location and (optional) on returnTime for FIELD_VISIT', () => {
    render(
      <FieldMovementEntryFields
        idPrefix="test"
        hideDate
        availableReasonTypes={['FIELD_VISIT', 'EARLY_LEAVE', 'FORGOT']}
        availableForgotDirections={['IN', 'OUT', 'BOTH']}
        selection={{ reasonType: 'FIELD_VISIT' }}
        values={{ location: '', timeOut: '', returnTime: '', reasonNote: '' }}
        labels={labels}
        reasonTypeLabels={reasonTypeLabels}
        forgotDirectionLabels={forgotDirectionLabels}
        optionalSuffix="(optional)"
        reasonTypeLegend="Reason"
        forgotDirectionLegend="Direction"
        onSelectionChange={vi.fn()}
        onValuesChange={vi.fn()}
      />,
    );

    const locationLabel = screen.getByText('Location / destination').closest('label');
    expect(locationLabel?.querySelector('.fm-field__required')).toBeTruthy();
    expect(locationLabel?.textContent).not.toContain('(optional)');

    const returnLabel = screen.getByText('Return time').closest('label');
    expect(returnLabel?.querySelector('.fm-field__optional')?.textContent).toBe(
      '(optional)',
    );
    expect(returnLabel?.querySelector('.fm-field__required')).toBeNull();

    expect(screen.queryByText('Stated clock-in time')).toBeNull();
    expect(screen.queryByText('Forgot which scan')).toBeNull();
  });

  it('shows forgotDirection only for FORGOT and clears hidden values on reason change', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onValuesChange = vi.fn();

    render(
      <FieldMovementEntryFields
        idPrefix="test2"
        hideDate
        availableReasonTypes={['FIELD_VISIT', 'FORGOT']}
        availableForgotDirections={['IN', 'OUT', 'BOTH']}
        selection={{ reasonType: 'FIELD_VISIT' }}
        values={{
          location: 'Site A',
          timeOut: '10:00',
          returnTime: '12:00',
          reasonNote: 'Visit',
        }}
        labels={labels}
        reasonTypeLabels={reasonTypeLabels}
        forgotDirectionLabels={forgotDirectionLabels}
        optionalSuffix="(optional)"
        reasonTypeLegend="Reason"
        forgotDirectionLegend="Direction"
        onSelectionChange={onSelectionChange}
        onValuesChange={onValuesChange}
      />,
    );

    expect(screen.queryByText('Direction')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Forgot to clock' }));
    expect(onSelectionChange).toHaveBeenCalledWith({
      reasonType: 'FORGOT',
      forgotDirection: null,
    });
    expect(onValuesChange).toHaveBeenCalled();
    const cleared = onValuesChange.mock.calls.at(-1)?.[0] as {
      location?: string;
      timeOut?: string;
    };
    expect(cleared.location).toBe('');
    expect(cleared.timeOut).toBe('');
  });
});
