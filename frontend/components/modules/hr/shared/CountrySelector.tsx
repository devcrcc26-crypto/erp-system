'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input, Select } from 'antd';
import { Country } from 'country-state-city';
import { getPerDiemCategoryForCountry } from '@/lib/constants/world-countries';
import type { PerDiemDestinationCategory } from '@/lib/constants/per-diem-destination-categories';

export interface CountrySelectorProps {
  value?: string;
  onChange?: (
    value: string,
    category: PerDiemDestinationCategory | null,
  ) => void;
  placeholder?: string;
  defaultCountry?: string;
  /** Country names to omit from the dropdown (e.g. Ethiopia on international destinations). */
  excludeCountries?: readonly string[];
}

/**
 * Searchable country select backed by country-state-city, with an "Other" free-text fallback.
 */
export default function CountrySelector({
  value,
  onChange,
  placeholder = 'Select country',
  defaultCountry,
  excludeCountries = [],
}: CountrySelectorProps): React.ReactNode {
  const countries = useMemo(() => {
    const excluded = new Set(excludeCountries);
    const list = Country.getAllCountries()
      .map((country) => ({
        value: country.name,
        label: country.name,
        isoCode: country.isoCode,
      }))
      .filter((country) => !excluded.has(country.value));

    if (
      defaultCountry &&
      !excluded.has(defaultCountry) &&
      !list.some((country) => country.value === defaultCountry)
    ) {
      return [
        { value: defaultCountry, label: defaultCountry, isoCode: '' },
        ...list,
      ];
    }
    return list;
  }, [defaultCountry, excludeCountries]);

  const isOther = Boolean(
    value && !countries.some((country) => country.value === value),
  );
  const [showCustom, setShowCustom] = useState(isOther);
  const [selectValue, setSelectValue] = useState<string | undefined>(
    isOther ? '__other__' : (value ?? undefined),
  );
  const [customValue, setCustomValue] = useState(isOther ? (value ?? '') : '');

  useEffect(() => {
    const nextIsOther = Boolean(
      value && !countries.some((country) => country.value === value),
    );
    setShowCustom(nextIsOther);
    setSelectValue(nextIsOther ? '__other__' : (value || undefined));
    setCustomValue(nextIsOther ? (value ?? '') : '');
  }, [value, countries]);

  function handleSelect(val: string): void {
    setSelectValue(val);
    if (val === '__other__') {
      setShowCustom(true);
      setCustomValue('');
      onChange?.('', null);
      return;
    }
    setShowCustom(false);
    setCustomValue('');
    onChange?.(val, getPerDiemCategoryForCountry(val));
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
        virtual
        filterOption={(input, option) =>
          String(option?.label ?? '')
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        options={[
          ...countries,
          { value: '__other__', label: 'Other (specify)', isoCode: '' },
        ]}
      />
      {showCustom ? (
        <Input
          placeholder="Enter country name"
          value={customValue}
          onChange={(event) => {
            setCustomValue(event.target.value);
            onChange?.(event.target.value, null);
          }}
          suffix={
            <span className="text-[11px] text-[var(--color-amber-500,#F59E0B)]">
              Manual entry - per diem category needs manual selection
            </span>
          }
        />
      ) : null}
    </div>
  );
}
