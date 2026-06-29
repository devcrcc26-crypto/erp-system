'use client';

import { Input } from 'antd';
import { useEffect, useState } from 'react';
import type { SearchProps } from 'antd/es/input/Search';

type ListSearchInputProps = Omit<
  SearchProps,
  'value' | 'onChange' | 'onSearch'
> & {
  /** Committed filter value from parent state (e.g. after reset filters). */
  committedValue?: string;
  /** Called when the user searches or clears the field. */
  onCommit: (value: string) => void;
  /** When true, commits on every keystroke (client-side filtering). */
  live?: boolean;
};

/**
 * Controlled search input for paginated lists.
 * Keeps a local draft while typing; commits on Enter/search button or clear.
 */
export default function ListSearchInput({
  committedValue = '',
  onCommit,
  live = false,
  allowClear = true,
  ...rest
}: ListSearchInputProps): React.ReactNode {
  const [draft, setDraft] = useState(committedValue);

  useEffect(() => {
    setDraft(committedValue);
  }, [committedValue]);

  return (
    <Input.Search
      allowClear={allowClear}
      value={draft}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        if (value === '') {
          onCommit('');
          return;
        }
        if (live) {
          onCommit(value);
        }
      }}
      onSearch={(value: string) => {
        setDraft(value);
        onCommit(value);
      }}
      {...rest}
    />
  );
}
