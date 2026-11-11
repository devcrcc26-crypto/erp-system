'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input, Select } from 'antd';
import { City, Country } from 'country-state-city';

export interface CitySelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Country name used to load cities from country-state-city. */
  countryName?: string;
  /** Static city list (e.g. Ethiopia domestic flights). */
  staticCities?: readonly string[];
}

/**
 * Searchable city select - either from a static list or country-state-city.
 * Falls back to a plain text input when the library has no cities for the country.
 */
export default function CitySelector({
  value,
  onChange,
  placeholder,
  countryName,
  staticCities,
}: CitySelectorProps): React.ReactNode {
  const libraryCities = useMemo(() => {
    if (staticCities || !countryName) {
      return [];
    }
    const country = Country.getAllCountries().find(
      (entry) => entry.name === countryName,
    );
    if (!country) {
      return [];
    }
    const cities = City.getCitiesOfCountry(country.isoCode) ?? [];
    return cities.map((city) => city.name).sort((a, b) => a.localeCompare(b));
  }, [countryName, staticCities]);

  const cities = staticCities
    ? ([...staticCities] as string[])
    : libraryCities;

  const isOther = Boolean(value && !cities.includes(value));
  const [showCustom, setShowCustom] = useState(isOther);
  const [selectValue, setSelectValue] = useState<string | undefined>(
    isOther ? '__other__' : (value ?? undefined),
  );
  const [customValue, setCustomValue] = useState(isOther ? (value ?? '') : '');

  useEffect(() => {
    const nextIsOther = Boolean(value && !cities.includes(value));
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

  if (!staticCities && cities.length === 0) {
    return (
      <Input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder ?? 'Enter city name'}
        maxLength={100}
      />
    );
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
        notFoundContent="No cities found - type to search"
        filterOption={(input, option) =>
          String(option?.label ?? '')
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        options={[
          ...cities.map((city) => ({ value: city, label: city })),
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
            <span className="text-[11px] text-[var(--color-amber-500,#F59E0B)]">
              Manual entry
            </span>
          }
        />
      ) : null}
    </div>
  );
}
