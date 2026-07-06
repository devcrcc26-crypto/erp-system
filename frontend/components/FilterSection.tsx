// UI polish pass - styles only, no logic changes

'use client';

import { Select, Space } from 'antd';
import type {
  TaskStatus,
  UrgencyLevel,
} from '@/lib/api/project-management.types';
import {
  DEFAULT_DASHBOARD_FILTERS,
  type DashboardDateRange,
  type DashboardFilters,
} from '@/lib/dashboard/types';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatTaskStatus } from '@/lib/utils/pm-status-display';

const TASK_STATUS_OPTIONS: TaskStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'DELAYED',
  'COMPLETED',
];

const URGENCY_OPTIONS: Array<{ value: UrgencyLevel; label: string }> = [
  { value: 'VERY_URGENT', label: 'Very Urgent (紧急)' },
  { value: 'URGENT', label: 'Urgent (急)' },
  { value: 'NORMAL', label: 'Normal (正常)' },
];

const DATE_RANGE_OPTIONS: Array<{ value: DashboardDateRange; label: string }> = [
  { value: 'ALL_TIME', label: 'All Time' },
  { value: 'THIS_WEEK', label: 'This Week' },
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'LAST_30_DAYS', label: 'Last 30 Days' },
  { value: 'LAST_90_DAYS', label: 'Last 90 Days' },
];

export default function FilterSection({
  filters,
  onChange,
  projectOptions,
  disciplineOptions,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  projectOptions: Array<{ value: string; label: string }>;
  disciplineOptions: string[];
}): React.ReactNode {
  function updateFilters(partial: Partial<DashboardFilters>): void {
    onChange({ ...filters, ...partial });
  }

  function handleClear(): void {
    onChange({ ...DEFAULT_DASHBOARD_FILTERS });
  }

  return (
    <section
      style={{
        borderRadius: tokens.borderRadiusCard,
        border: `0.5px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
        padding: '16px 18px',
      }}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2
          className="text-[13px] font-medium leading-[1.5]"
          style={{ color: tokens.colorTextPrimary }}
        >
          Filters & Search
        </h2>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-secondary)]"
          style={{
            border: `0.5px solid ${tokens.colorBorderSecondary}`,
            color: tokens.colorTextSecondary,
          }}
          onClick={handleClear}
        >
          Clear Filters
        </button>
      </div>

      <Space wrap className="w-full">
        <ListSearchInput
          live
          placeholder="Search tasks or projects"
          className={layout.filterControlLg}
          committedValue={filters.search}
          onCommit={(value: string) => updateFilters({ search: value })}
        />
        <Select
          allowClear
          placeholder="Status"
          className={layout.filterControlMd}
          value={filters.status}
          onChange={(value: TaskStatus | undefined) =>
            updateFilters({ status: value })
          }
          options={TASK_STATUS_OPTIONS.map((status) => ({
            value: status,
            label: formatTaskStatus(status),
          }))}
        />
        <Select
          placeholder="Date Range"
          className={layout.filterControlMd}
          value={filters.dateRange}
          onChange={(value: DashboardDateRange) =>
            updateFilters({ dateRange: value })
          }
          options={DATE_RANGE_OPTIONS}
        />
        <Select
          allowClear
          placeholder="Priority"
          className={layout.filterControlSm}
          value={filters.priority}
          onChange={(value: UrgencyLevel | undefined) =>
            updateFilters({ priority: value })
          }
          options={URGENCY_OPTIONS}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Project"
          className={layout.filterControlLg}
          value={filters.projectId}
          onChange={(value: string | undefined) =>
            updateFilters({ projectId: value, discipline: undefined })
          }
          options={projectOptions}
        />
        <Select
          allowClear
          showSearch
          placeholder="Discipline"
          className={layout.filterControlMd}
          value={filters.discipline}
          onChange={(value: string | undefined) =>
            updateFilters({ discipline: value })
          }
          options={disciplineOptions.map((name) => ({
            value: name,
            label: name,
          }))}
          disabled={disciplineOptions.length === 0}
        />
      </Space>
    </section>
  );
}
