'use client';

import { Badge, Tabs } from 'antd';

export type ListStatusTabKey = 'active' | 'closed' | 'withdrawn';

export interface ListStatusTabsProps {
  activeKey: ListStatusTabKey;
  onChange: (key: ListStatusTabKey) => void;
  activeLabel: string;
  closedLabel: string;
  activeCount?: number;
  closedCount?: number;
  /** Optional third tab label (e.g. "Withdrawn" or "Verified") */
  thirdLabel?: string;
  thirdCount?: number;
  /**
   * Where to place the third tab. Default `end` keeps Active | Closed | Third.
   * Use `middle` for Active | Third | Closed (e.g. Open | Verified | Closed).
   */
  thirdTabPosition?: 'middle' | 'end';
  className?: string;
}

/**
 * Shared Active/Closed (or Open/Resolved) list tabs with count badges.
 * Supports an optional third tab via thirdLabel prop.
 */
export default function ListStatusTabs({
  activeKey,
  onChange,
  activeLabel,
  closedLabel,
  activeCount,
  closedCount,
  thirdLabel,
  thirdCount,
  thirdTabPosition = 'end',
  className = '!mb-4',
}: ListStatusTabsProps): React.ReactNode {
  const activeItem = {
    key: 'active',
    label: (
      <span>
        {activeLabel}
        {activeCount !== undefined ? (
          <Badge
            count={activeCount}
            showZero
            color="var(--color-text-tertiary)"
            className="ml-2"
          />
        ) : null}
      </span>
    ),
    children: null,
  };

  const closedItem = {
    key: 'closed',
    label: (
      <span>
        {closedLabel}
        {closedCount !== undefined ? (
          <Badge
            count={closedCount}
            showZero
            color="var(--color-text-tertiary)"
            className="ml-2"
          />
        ) : null}
      </span>
    ),
    children: null,
  };

  const thirdItem = thirdLabel
    ? {
        key: 'withdrawn',
        label: (
          <span>
            {thirdLabel}
            {thirdCount !== undefined ? (
              <Badge
                count={thirdCount}
                showZero
                color="var(--color-text-tertiary)"
                className="ml-2"
              />
            ) : null}
          </span>
        ),
        children: null,
      }
    : null;

  const items = thirdItem
    ? thirdTabPosition === 'middle'
      ? [activeItem, thirdItem, closedItem]
      : [activeItem, closedItem, thirdItem]
    : [activeItem, closedItem];

  return (
    <Tabs
      className={className}
      activeKey={activeKey}
      onChange={(key) => onChange(key as ListStatusTabKey)}
      items={items}
    />
  );
}
