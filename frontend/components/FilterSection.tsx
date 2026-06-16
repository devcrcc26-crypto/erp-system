"use client";

import { layout } from '@/lib/theme/layout';

const filters = [
    {label: "Status", defaultValue: "All Statuses"},
    { label: "Date Range", defaultValue: "All Time" },
    {label: "Priority", defaultValue: "All Priorities"},
    {label: "Project", defaultValue: "All Projects"},
    {label: "Discipline", defaultValue: "All Disciplines"}
];

export default function FilterSection() {
    return (
        <section className={`${layout.cardSurface} ${layout.cardPadding}`}>
            <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">Filters & Search</h2>
                <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                    Clear Filters
                </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                {
                    filters.map((filter) =>(
                        <label key={filter.label} className="flex flex-col gap-2 text-sm">
                            <span className="font-medium text-slate-700">{filter.label}</span>
                            <select className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-slate-300">
                                <option value={filter.defaultValue}>{filter.defaultValue}</option>
                            </select>
                        </label>
                    ))
                }
            </div>

        </section>
    )
}