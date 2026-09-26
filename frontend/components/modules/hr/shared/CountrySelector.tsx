'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input, Select } from 'antd';
import { WORLD_COUNTRIES } from '@/lib/constants/world-countries';

export interface CountrySelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  defaultCountry?: string;
}

/**
 * Searchable country select with an "Other (specify)" free-text fallback.
 */
export default function CountrySelector({
  value,
  onChange,
  placeholder = 'Select country',
  defaultCountry,
}: CountrySelectorProps): React.ReactNode {
  const countries = useMemo(() => {
    if (defaultCountry && !WORLD_COUNTRIES.includes(defaultCountry)) {
      return [defaultCountry, ...WORLD_COUNTRIES];
    }
    return WORLD_COUNTRIES;
  }, [defaultCountry]);

  const isOther = Boolean(value && !countries.includes(value));
  const [showCustom, setShowCustom] = useState(isOther);
  const [selectValue, setSelectValue] = useState<string | undefined>(
    isOther ? '__other__' : (value ?? undefined),
  );
  const [customValue, setCustomValue] = useState(isOther ? (value ?? '') : '');

  useEffect(() => {
    const nextIsOther = Boolean(value && !countries.includes(value));
    setShowCustom(nextIsOther);
    setSelectValue(nextIsOther ? '__other__' : (value || undefined));
    setCustomValue(nextIsOther ? (value ?? '') : '');
  }, [value, countries]);

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
          ...countries.map((country) => ({
            value: country,
            label: country,
          })),
          { value: '__other__', label: 'Other (specify)' },
        ]}
      />
      {showCustom ? (
        <Input
          placeholder="Enter country name"
          value={customValue}
          onChange={(event) => {
            setCustomValue(event.target.value);
            onChange?.(event.target.value);
          }}
          suffix={
            <span className="text-[11px] text-[var(--color-text-tertiary,#9CA3AF)]">
              Manual entry — per diem category needs manual selection
            </span>
          }
        />
      ) : null}
    </div>
  );
}
