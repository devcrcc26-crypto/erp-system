'use client';

import { useEffect, useState } from 'react';
import { Input, Select } from 'antd';

export interface CitySelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  cities: readonly string[];
}

/**
 * Searchable city select with an "Other (specify)" free-text fallback.
 */
export default function CitySelector({
  value,
  onChange,
  placeholder,
  cities,
}: CitySelectorProps): React.ReactNode {
  const isOther = Boolean(
    value && !(cities as readonly string[]).includes(value),
  );
  const [showCustom, setShowCustom] = useState(isOther);
  const [selectValue, setSelectValue] = useState<string | undefined>(
    isOther ? '__other__' : (value ?? undefined),
  );
  const [customValue, setCustomValue] = useState(isOther ? (value ?? '') : '');

  useEffect(() => {
    const nextIsOther = Boolean(
      value && !(cities as readonly string[]).includes(value),
    );
    setShowCustom(nextIsOther);
    setSelectValue(nextIsOther ? '__other__' : (value || undefined));
    setCustomValue(nextIsOther ? (value ?? '') : '');
  }, [value, cities]);

  function handleSelect(val: string): void {
    setSelectValue(val);
    if (val === '__other__') {
      setShowCustom(true);
      setCustomValue('');
      onChange?.('');
      return;
    }
    setShowCustom(false);
    setCustomValue('');
    onChange?.(val);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={selectValue}
        onChange={handleSelect}
        placeholder={placeholder}
        showSearch
        optionFilterProp="label"
        className="w-full"
        filterOption={(input, option) =>
          String(option?.label ?? '')
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        options={[
          ...(cities as readonly string[]).map((city) => ({
            value: city,
            label: city,
          })),
          { value: '__other__', label: 'Other (specify)' },
        ]}
      />
      {showCustom ? (
        <Input
          placeholder="Enter city name"
          value={customValue}
          onChange={(event) => {
            setCustomValue(event.target.value);
            onChange?.(event.target.value);
          }}
          suffix={
            <span className="text-[11px] text-[var(--color-text-tertiary,#9CA3AF)]">
              Manual entry
            </span>
          }
        />
      ) : null}
    </div>
  );
}
