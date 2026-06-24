// UI polish pass — styles only, no logic changes

"use client";

import { tokens } from '@/lib/theme/tokens';

const filters = [
  { label: "Status", defaultValue: "All Statuses" },
  { label: "Date Range", defaultValue: "All Time" },
  { label: "Priority", defaultValue: "All Priorities" },
  { label: "Project", defaultValue: "All Projects" },
  { label: "Discipline", defaultValue: "All Disciplines" },
];

export default function FilterSection() {
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
        >
          Clear Filters
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {filters.map((filter) => (
          <label key={filter.label} className="flex flex-col">
            <span
              className="mb-1.5 text-[12px] font-medium leading-[1.5]"
              style={{ color: tokens.colorTextSecondary }}
            >
              {filter.label}
            </span>
            <select
              className="h-9 rounded-lg bg-white px-3 text-[13px] font-normal outline-none"
              style={{
                border: `0.5px solid ${tokens.colorBorderSecondary}`,
                color: tokens.colorTextPrimary,
              }}
            >
              <option value={filter.defaultValue}>{filter.defaultValue}</option>
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
