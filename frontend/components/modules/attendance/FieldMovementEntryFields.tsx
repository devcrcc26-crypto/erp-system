'use client';

import { Input, Radio, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import {
  clearHiddenFieldValues,
  getVisibleFieldRules,
  type FieldMovementFieldKey,
  type FieldMovementFieldValues,
  type FieldMovementReasonType,
  type FieldMovementSelection,
  type ForgotDirection,
} from '@/lib/field-movement/field-movement-field-rules';

function parseTime(value: string | undefined | null): Dayjs | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value, 'HH:mm', true);
  return parsed.isValid() ? parsed : null;
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
                <TimePicker
                  {...a11y}
                  size="large"
                  format="HH:mm"
                  needConfirm={false}
                  className="w-full sm:max-w-xs"
                  value={parseTime(values[valueKey])}
                  onChange={(value) =>
                    patchValues({
                      [valueKey]: value ? value.format('HH:mm') : '',
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
