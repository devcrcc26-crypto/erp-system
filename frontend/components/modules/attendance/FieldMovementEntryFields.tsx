'use client';

import { Input, Radio, Select } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import {
  clearHiddenFieldValues,
  getVisibleFieldRules,
  type FieldMovementFieldKey,
  type FieldMovementFieldValues,
  type FieldMovementReasonType,
  type FieldMovementSelection,
  type ForgotDirection,
} from '@/lib/generated/field-movement-field-rules';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, '0');
  return { value, label: value };
});

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => {
  const value = String(minute).padStart(2, '0');
  return { value, label: value };
});

function splitHhMm(value: string | undefined | null): {
  hour: string | null;
  minute: string | null;
} {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return { hour: null, minute: null };
  }
  const [hour, minute] = value.split(':');
  return { hour: hour ?? null, minute: minute ?? null };
}

/** 24h HH:mm via hour + minute dropdowns (drawer-friendly). */
export function HourMinuteSelects({
  id,
  value,
  disabled,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  onChange,
}: {
  id: string;
  value: string | undefined | null;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  onChange: (next: string) => void;
}): React.ReactNode {
  const parsed = splitHhMm(value);
  const [hour, setHour] = useState<string | null>(parsed.hour);
  const [minute, setMinute] = useState<string | null>(parsed.minute);

  useEffect(() => {
    const next = splitHhMm(value);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

  function commit(nextHour: string | null, nextMinute: string | null): void {
    setHour(nextHour);
    setMinute(nextMinute);
    if (nextHour && nextMinute) {
      onChange(`${nextHour}:${nextMinute}`);
      return;
    }
    // Keep partial local selection; only clear the parent when both cleared.
    if (!nextHour && !nextMinute) {
      onChange('');
    }
  }

  return (
    <div className="fm-time-selects" role="group" aria-labelledby={id}>
      <Select
        id={id}
        size="large"
        className="fm-time-selects__hour"
        placeholder="HH"
        options={HOUR_OPTIONS}
        value={hour ?? undefined}
        allowClear
        disabled={disabled}
        status={ariaInvalid ? 'error' : undefined}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        getPopupContainer={() => document.body}
        onChange={(next) =>
          commit(typeof next === 'string' ? next : null, minute)
        }
      />
      <span className="fm-time-selects__sep" aria-hidden>
        :
      </span>
      <Select
        id={`${id}-minute`}
        size="large"
        className="fm-time-selects__minute"
        placeholder="mm"
        options={MINUTE_OPTIONS}
        value={minute ?? undefined}
        allowClear
        disabled={disabled}
        status={ariaInvalid ? 'error' : undefined}
        aria-invalid={ariaInvalid}
        getPopupContainer={() => document.body}
        onChange={(next) =>
          commit(hour, typeof next === 'string' ? next : null)
        }
      />
    </div>
  );
}

export type FieldMovementEntryErrors = Partial<
  Record<FieldMovementFieldKey | 'reasonType', string>
>;

export interface FieldMovementEntryFieldsProps {
  idPrefix: string;
  /** When true, date is not rendered (row already shows the day). */
  hideDate?: boolean;
  availableReasonTypes: FieldMovementReasonType[];
  availableForgotDirections: ForgotDirection[];
  selection: FieldMovementSelection;
  values: FieldMovementFieldValues;
  errors?: FieldMovementEntryErrors;
  labels: Record<FieldMovementFieldKey, string>;
  reasonTypeLabels: Record<FieldMovementReasonType, string>;
  forgotDirectionLabels: Record<ForgotDirection, string>;
  optionalSuffix: string;
  reasonTypeLegend: string;
  forgotDirectionLegend: string;
  onSelectionChange: (next: FieldMovementSelection) => void;
  onValuesChange: (next: FieldMovementFieldValues) => void;
}

function FieldShell({
  id,
  label,
  required,
  optional,
  optionalSuffix,
  error,
  children,
}: {
  id: string;
  label: string;
  required: boolean;
  optional: boolean;
  optionalSuffix: string;
  error?: string;
  children: (a11y: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
    status?: 'error';
  }) => ReactNode;
}): React.ReactNode {
  return (
    <div className="fm-field">
      <label className="fm-field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="fm-field__required" aria-hidden>
            *
          </span>
        ) : null}
        {optional ? (
          <span className="fm-field__optional">{optionalSuffix}</span>
        ) : null}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        status: error ? 'error' : undefined,
      })}
      {error ? (
        <p className="fm-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared field-movement entry fields driven by field-movement-field-rules.
 * Used by self, on-behalf, bulk, and per-row override UIs.
 */
export default function FieldMovementEntryFields({
  idPrefix,
  hideDate = false,
  availableReasonTypes,
  availableForgotDirections,
  selection,
  values,
  errors = {},
  labels,
  reasonTypeLabels,
  forgotDirectionLabels,
  optionalSuffix,
  reasonTypeLegend,
  forgotDirectionLegend,
  onSelectionChange,
  onValuesChange,
}: FieldMovementEntryFieldsProps): React.ReactNode {
  const rules = getVisibleFieldRules(selection).filter(
    (rule) => !(hideDate && rule.key === 'date'),
  );

  function setReasonType(reasonType: FieldMovementReasonType): void {
    const nextSelection: FieldMovementSelection = {
      reasonType,
      forgotDirection:
        reasonType === 'FORGOT' ? selection.forgotDirection ?? null : null,
    };
    onSelectionChange(nextSelection);
    onValuesChange(clearHiddenFieldValues(nextSelection, values));
  }

  function setForgotDirection(forgotDirection: ForgotDirection): void {
    const nextSelection: FieldMovementSelection = {
      reasonType: 'FORGOT',
      forgotDirection,
    };
    onSelectionChange(nextSelection);
    onValuesChange(clearHiddenFieldValues(nextSelection, values));
  }

  function patchValues(patch: Partial<FieldMovementFieldValues>): void {
    onValuesChange({ ...values, ...patch });
  }

  return (
    <div className="fm-stack">
      <fieldset className="fm-choices">
        <legend className="fm-choices__legend">{reasonTypeLegend}</legend>
        <Radio.Group
          name={`${idPrefix}-reason-type`}
          value={selection.reasonType ?? undefined}
          onChange={(event) =>
            setReasonType(event.target.value as FieldMovementReasonType)
          }
          className="fm-choices__list"
        >
          {availableReasonTypes.map((type) => (
            <Radio key={type} value={type} className="fm-choice">
              {reasonTypeLabels[type]}
            </Radio>
          ))}
        </Radio.Group>
        {errors.reasonType ? (
          <p className="fm-field__error" role="alert">
            {errors.reasonType}
          </p>
        ) : null}
      </fieldset>

      {selection.reasonType === 'FORGOT' ? (
        <fieldset className="fm-choices">
          <legend className="fm-choices__legend">{forgotDirectionLegend}</legend>
          <Radio.Group
            name={`${idPrefix}-forgot-direction`}
            value={selection.forgotDirection ?? undefined}
            onChange={(event) =>
              setForgotDirection(event.target.value as ForgotDirection)
            }
            className="fm-choices__list"
          >
            {availableForgotDirections.map((direction) => (
              <Radio key={direction} value={direction} className="fm-choice">
                {forgotDirectionLabels[direction]}
              </Radio>
            ))}
          </Radio.Group>
          {errors.forgotDirection ? (
            <p className="fm-field__error" role="alert">
              {errors.forgotDirection}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {rules.map((rule) => {
        if (rule.key === 'forgotDirection' || rule.key === 'attachment') {
          return null;
        }
        const required = rule.presence === 'required';
        const optional = rule.presence === 'optional';
        const label = labels[rule.key];
        const fieldId = `${idPrefix}-${rule.key}`;
        const error = errors[rule.key];

        if (rule.key === 'date') {
          return (
            <FieldShell
              key={rule.key}
              id={fieldId}
              label={label}
              required={required}
              optional={optional}
              optionalSuffix={optionalSuffix}
              error={error}
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  size="large"
                  value={values.date ?? ''}
                  onChange={(event) =>
                    patchValues({ date: event.target.value })
                  }
                />
              )}
            </FieldShell>
          );
        }

        if (
          rule.key === 'timeOut' ||
          rule.key === 'returnTime' ||
          rule.key === 'clockInTime' ||
          rule.key === 'clockOutTime'
        ) {
          const valueKey = rule.key;
          return (
            <FieldShell
              key={rule.key}
              id={fieldId}
              label={label}
              required={required}
              optional={optional}
              optionalSuffix={optionalSuffix}
              error={error}
            >
              {(a11y) => (
                <HourMinuteSelects
                  id={a11y.id}
                  aria-invalid={a11y['aria-invalid']}
                  aria-required={a11y['aria-required']}
                  value={values[valueKey]}
                  onChange={(next) =>
                    patchValues({
                      [valueKey]: next,
                    })
                  }
                />
              )}
            </FieldShell>
          );
        }

        if (rule.key === 'location') {
          return (
            <FieldShell
              key={rule.key}
              id={fieldId}
              label={label}
              required={required}
              optional={optional}
              optionalSuffix={optionalSuffix}
              error={error}
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  size="large"
                  value={values.location ?? ''}
                  onChange={(event) =>
                    patchValues({ location: event.target.value })
                  }
                />
              )}
            </FieldShell>
          );
        }

        if (rule.key === 'reasonNote') {
          return (
            <FieldShell
              key={rule.key}
              id={fieldId}
              label={label}
              required={required}
              optional={optional}
              optionalSuffix={optionalSuffix}
              error={error}
            >
              {(a11y) => (
                <Input.TextArea
                  {...a11y}
                  rows={3}
                  value={values.reasonNote ?? ''}
                  onChange={(event) =>
                    patchValues({ reasonNote: event.target.value })
                  }
                />
              )}
            </FieldShell>
          );
        }

        return null;
      })}
    </div>
  );
}

/**
 * Builds Ant Design required mark props from presence.
 * Required → asterisk only; optional → "(optional)" suffix; never both/neither for visible fields.
 */
export function labelModeFromPresence(
  presence: 'required' | 'optional' | 'hidden',
): { required: boolean; optional: boolean } {
  if (presence === 'required') {
    return { required: true, optional: false };
  }
  if (presence === 'optional') {
    return { required: false, optional: true };
  }
  return { required: false, optional: false };
}
