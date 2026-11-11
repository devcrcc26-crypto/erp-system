/**
 * v2 list-page look (floating stat tiles, borderless 16px cards, quiet
 * filter row, clean table header) for pages built on the shared
 * `erp-users-*` / `erp-pro-card` list chrome - in Tailwind, applied once on
 * the page root. Matches the Employees, Payroll and Field Movement lists.
 *
 * The legacy rules live unlayered in globals.css and antd's styles are
 * unlayered too, so every utility here uses the `!` modifier to win. Class
 * names are written out in full (no string building) so Tailwind finds them.
 *
 * Usage: <div className={`erp-pro-list-page erp-users-page ${LIST_PAGE_V2}`}>
 */
export const LIST_PAGE_V2 = [
  'gap-5',

  // Stat tiles: separate floating cards instead of one joined strip.
  '[&_.erp-users-stat-bar]:!gap-4 [&_.erp-users-stat-bar]:!overflow-visible [&_.erp-users-stat-bar]:!rounded-none',
  '[&_.erp-users-stat-bar]:!border-0 [&_.erp-users-stat-bar]:!bg-transparent [&_.erp-users-stat-bar]:!shadow-none',
  '[&_.erp-users-stat]:!gap-3.5 [&_.erp-users-stat]:!rounded-2xl [&_.erp-users-stat]:!border-0 [&_.erp-users-stat]:!bg-white',
  '[&_.erp-users-stat]:!px-5 [&_.erp-users-stat]:!py-[18px]',
  '[&_.erp-users-stat]:!shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]',
  '[&_.erp-contract-stat:hover]:!bg-[#fbfcfd]',
  '[&_.erp-contract-stat:focus-visible]:!outline-2 [&_.erp-contract-stat:focus-visible]:!outline-offset-2 [&_.erp-contract-stat:focus-visible]:!outline-emerald-600',
  '[&_.erp-contract-stat--active]:!bg-[#f0faf6]',
  '[&_.erp-contract-stat--active]:!shadow-[inset_0_0_0_2px_#1d9e75,0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]',
  '[&_.erp-users-stat-chip]:!size-10 [&_.erp-users-stat-chip]:!rounded-xl [&_.erp-users-stat-chip]:!text-[17px]',
  '[&_.erp-users-stat-label]:!text-xs [&_.erp-users-stat-label]:!tracking-[0.06em] [&_.erp-users-stat-label]:!text-gray-600',
  '[&_.erp-users-stat-value]:!mt-1 [&_.erp-users-stat-value]:!text-[26px] [&_.erp-users-stat-value]:!font-semibold',
  'max-[900px]:[&_.erp-users-stat-bar]:!grid-cols-2 max-[900px]:[&_.erp-users-stat-bar]:!gap-3',

  // Main card and toolbar.
  '[&_.erp-pro-card]:!rounded-2xl [&_.erp-pro-card]:!border-0',
  '[&_.erp-pro-card]:!shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]',
  '[&_.erp-users-toolbar]:!border-b-0 [&_.erp-users-toolbar]:!px-5 [&_.erp-users-toolbar]:!pt-[18px] [&_.erp-users-toolbar]:!pb-3.5',
  '[&_.erp-pro-card-toolbar-title]:!text-base [&_.erp-pro-card-toolbar-title]:!font-semibold [&_.erp-pro-card-toolbar-title]:!text-slate-900',
  '[&_.erp-users-count-pill]:!bg-emerald-600/10 [&_.erp-users-count-pill]:!px-2.5 [&_.erp-users-count-pill]:!text-[#0f6e56]',

  // Filters: one quiet row on white, wrapping instead of squeezing.
  '[&_.erp-users-filter-bar]:!flex-wrap [&_.erp-users-filter-bar]:!gap-x-3 [&_.erp-users-filter-bar]:!gap-y-2.5 [&_.erp-users-filter-bar]:!overflow-visible',
  '[&_.erp-users-filter-bar]:!bg-transparent [&_.erp-users-filter-bar]:!px-5 [&_.erp-users-filter-bar]:!pt-0 [&_.erp-users-filter-bar]:!pb-4',
  '[&_.erp-users-filter-bar]:!border-x-0 [&_.erp-users-filter-bar]:!border-t-0 [&_.erp-users-filter-bar]:!border-b [&_.erp-users-filter-bar]:!border-solid [&_.erp-users-filter-bar]:!border-[#eef1f4]',
  '[&_.erp-users-filter-spacer]:!hidden',
  '[&_.erp-users-search-input]:!max-w-[420px] [&_.erp-users-search-input]:!flex-[1_1_280px]',
  '[&_.erp-users-filter-bar_.ant-select-selector]:!rounded-[10px] [&_.erp-users-filter-bar_.ant-picker]:!rounded-[10px]',
  '[&_.erp-users-filter-bar_.ant-input-affix-wrapper]:!rounded-[10px] [&_.erp-users-filter-bar_.ant-input-number]:!rounded-[10px]',

  // Table: no blank band under the header (antd measure row), quiet header.
  '[&_.ant-table-tbody>tr.ant-table-measure-row]:!h-0 [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!h-0',
  '[&_.ant-table-tbody>tr.ant-table-measure-row>td]:!border-0 [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!p-0 [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!leading-[0]',
  '[&_.ant-table-thead>tr>th]:!bg-[#f7f8fa] [&_.ant-table-thead>tr>th]:!text-xs [&_.ant-table-thead>tr>th]:!tracking-[0.06em] [&_.ant-table-thead>tr>th]:!text-gray-600',
  '[&_.ant-table-thead>tr>th]:!border-b [&_.ant-table-thead>tr>th]:!border-[#eef1f4]',
  '[&_.ant-table-tbody>tr.ant-table-row:hover>td]:!bg-[#f7f8fa]',
  '[&_.ant-table-pagination.ant-pagination]:!m-0 [&_.ant-table-pagination.ant-pagination]:!px-5 [&_.ant-table-pagination.ant-pagination]:!py-3.5',

  // Muted text at readable contrast (#4B5563 = 7.6:1 on white).
  '[&_.erp-users-cell-sub]:!text-gray-600',
].join(' ');

/**
 * v2 detail-page look for pages built on the shared `erp-employee-*` detail
 * chrome (hero card, fact strip, section cards, approval chain). Includes the
 * list rules above for stat tiles, cards and tables.
 *
 * Usage: <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
 */
export const DETAIL_PAGE_V2 = [
  LIST_PAGE_V2,

  // Top bar (back link + actions) on the hero card.
  '[&_.erp-employee-toolbar]:!border-b [&_.erp-employee-toolbar]:!border-solid [&_.erp-employee-toolbar]:!border-[#eef1f4] [&_.erp-employee-toolbar]:!px-5 [&_.erp-employee-toolbar]:!py-3',

  // Hero: larger title, roomier padding.
  '[&_.erp-employee-hero]:!px-6 [&_.erp-employee-hero]:!pt-5 [&_.erp-employee-hero]:!pb-6',
  '[&_.erp-employee-hero-name]:!text-2xl [&_.erp-employee-hero-name]:!font-semibold [&_.erp-employee-hero-name]:!tracking-tight [&_.erp-employee-hero-name]:!text-slate-900',

  // Fact strip: floating tiles (the list rules), without the joined cell borders.
  '[&_.erp-employee-meta-bar_.erp-users-stat]:!border-0 [&_.erp-employee-meta-bar_.erp-users-stat]:!py-4',
  // One row however many facts there are (3, 4 or 5), wrapping only when narrow.
  '[&_.erp-employee-meta-bar]:!grid-cols-[repeat(auto-fit,minmax(170px,1fr))]',
  '[&_.erp-employee-meta-value]:!text-[15px] [&_.erp-employee-meta-value]:!font-semibold [&_.erp-employee-meta-value]:!text-slate-900',

  // Sections: white cards with a sentence-case heading instead of a grey
  // uppercase bar. Inside the main card they lose their own card chrome.
  '[&_.erp-employee-section]:!rounded-2xl [&_.erp-employee-section]:!border-0 [&_.erp-employee-section]:!bg-white',
  '[&_.erp-employee-section]:!shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]',
  '[&_.erp-pro-card_.erp-employee-section]:!rounded-none [&_.erp-pro-card_.erp-employee-section]:!shadow-none',
  '[&_.erp-employee-section-header]:!border-b [&_.erp-employee-section-header]:!border-solid [&_.erp-employee-section-header]:!border-[#eef1f4] [&_.erp-employee-section-header]:!bg-white',
  '[&_.erp-employee-section-header]:!px-5 [&_.erp-employee-section-header]:!pt-4 [&_.erp-employee-section-header]:!pb-3',
  '[&_.erp-employee-section-title]:!text-[15px] [&_.erp-employee-section-title]:!font-semibold [&_.erp-employee-section-title]:!normal-case',
  '[&_.erp-employee-section-title]:!tracking-normal [&_.erp-employee-section-title]:!text-slate-900',
  '[&_.erp-employee-section-body]:!px-5 [&_.erp-employee-section-body]:!py-4',
  // Flush bodies (tables / row lists) must beat the padding utilities above.
  '[&_.erp-employee-section-body.erp-employee-section-body--flush]:!p-0',
  '[&_.erp-pro-card_.erp-employee-tab-panel]:!p-0',

  // Chips and tags: soft fills instead of outlines.
  '[&_.erp-users-id-chip]:!rounded-lg [&_.erp-users-id-chip]:!border-0 [&_.erp-users-id-chip]:!bg-[#f2f4f7] [&_.erp-users-id-chip]:!text-[#344054]',
  '[&_.erp-users-role-tag]:!border-0 [&_.erp-users-role-tag]:!bg-emerald-600/10 [&_.erp-users-role-tag]:!font-semibold [&_.erp-users-role-tag]:!text-[#0f6e56]',
].join(' ');
