# Responsive rulebook (Ant Design 6 + Tailwind 4 + Next.js App Router)

Use this when fixing a page that overflows, overlaps or breaks on small screens. It works
**with** Ant Design components. Prefer Tailwind utilities, and the shared primitives that
already exist, over new CSS.

**Already in the repo. Use these, don't re-create them:**

| Need | Use |
| --- | --- |
| Viewport checks that match the shell | `useIsMdUp()` / `useIsLgUp()` in `frontend/hooks/useMediaQuery.ts` (Tailwind px) |
| A list table | `DataTable` (`components/ui/DataTable`). Defaults to `scroll={{ x: 'max-content' }}`, an `overflow-x-auto` wrapper, `small` size below lg and simple pagination below md |
| "More columns →" cue | `HorizontalScrollHint` wrapped around a scrolling table |
| Form/page card with a responsive header | `FormLayout` (`components/ui/FormLayout`) |
| Shell (sidebar, header, scroll area) | `components/ui/shell/AppShell.tsx` + `components/sidebar/` (see `SIDEBAR.md`) |

---

## 0. Breakpoints: two scales, know which one you're using

| | xs | sm | md | lg | xl | xxl |
| --- | --- | --- | --- | --- | --- | --- |
| **Ant Design** (`Col`, `Grid.useBreakpoint`, `column.responsive`, `Modal width`) | <576 | ≥576 | ≥768 | **≥992** | **≥1200** | ≥1600 |
| **Tailwind** (`sm:` `md:` …, `useIsMdUp`, `useIsLgUp`) | | ≥640 | ≥768 | **≥1024** | **≥1280** | ≥1536 (`2xl`) |

Rules:

- **R0.1** Only `md` (768) is the same on both scales. Use **md as the main phone→desktop
  switch** whenever you can.
- **R0.2** Anything tied to the shell (sidebar drawer vs rail) switches at **1024**. Use
  `useIsLgUp()` or Tailwind `lg:`, never AntD `screens.lg` (992). Between 992 and 1023 the
  sidebar is still a drawer.
- **R0.3** All of these are **viewport** breakpoints, not content-width breakpoints. The
  sidebar takes 72px (rail) to 344px (rail plus pinned panel), so at a 1280px viewport the
  content can be only ~900px wide. **Go one breakpoint later than feels natural** for
  multi-column layouts (see §3), or use container queries (§3.4).
- **R0.4** Both hooks report "not matched" on the first client render. `useBreakpoint()`
  returns `{}`, so `screens.md` is `undefined`, and `useMediaQuery` returns `false`. Write
  checks so the *unknown* state gives the **mobile-safe** result:

```ts
const screens = Grid.useBreakpoint();
const isMobile = screens.md === false;   // undefined → not mobile → no flash on desktop
const isMdUp   = screens.md === true;    // undefined → treat as small → safe layout first
```

---

## 1. Forms: horizontal vs vertical labels

**House default is `layout="vertical"`.** About 180 forms already use it, and none use
`labelCol`. Most forms need no breakpoint logic at all.

- **R1.1** New and existing forms: `layout="vertical"`. Labels above fields never overflow,
  handle long Chinese/English labels, and work at every width.
- **R1.2** Use horizontal (label-left) **only** for short, dense, read-mostly forms (settings
  panels, a filter bar on a wide page) and **only from `lg` up** (AntD ≥992, i.e. content
  wide enough for a label column plus a ≥280px field). Below that, switch to vertical
  automatically with the hook below.
- **R1.3** When the layout is vertical, **drop `labelCol`/`wrapperCol`**. If they stay,
  AntD still applies them and squeezes the label into a 1/3-width column above the field.
- **R1.4** Put multi-column fields in `Row`/`Col` *inside* the form (see §3.2). Never use
  `layout="inline"` for forms with more than 2–3 fields: it does not wrap cleanly. Use a
  vertical form with a `Row` of filters instead.
- **R1.5** Inputs fill their column: no `style={{ width: 400 }}`. Use `className="w-full"`
  (or `sm:max-w-sm` to cap it). `Select`, `DatePicker` and `InputNumber` don't stretch by
  default, so give them `className="w-full"` (or `!w-full` if AntD wins, see §4 R4.9).
- **R1.6** Action buttons: full width and stacked on mobile, inline from `sm`:
  `<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">`.

### Hook: switch form layout automatically

Proposed `frontend/hooks/use-responsive-form-layout.ts` (not in the repo yet):

```ts
'use client';

import { Grid } from 'antd';
import type { FormProps } from 'antd';

type Bp = 'md' | 'lg' | 'xl';

/**
 * Horizontal labels at `from` and up; vertical (labels above) below it.
 * Unknown first render → vertical (mobile-safe). Spread onto <Form>.
 */
export function useResponsiveFormLayout(
  from: Bp = 'lg',
  labelSpan = 8,
): Pick<FormProps, 'layout' | 'labelCol' | 'wrapperCol' | 'labelWrap' | 'labelAlign'> {
  const screens = Grid.useBreakpoint();
  if (screens[from] !== true) return { layout: 'vertical' }; // R1.3: no labelCol
  return {
    layout: 'horizontal',
    labelCol: { flex: `0 0 ${(labelSpan / 24) * 100}%` },
    wrapperCol: { flex: '1 1 0', style: { minWidth: 0 } }, // R4.1, field can shrink
    labelWrap: true,   // long zh/en labels wrap instead of overflowing
    labelAlign: 'left',
  };
}
```

```tsx
const formLayout = useResponsiveFormLayout('lg');

<Form form={form} {...formLayout} requiredMark onFinish={onFinish}>
  <Form.Item name="name" label={t('form.name')} rules={[{ required: true }]}>
    <Input className="w-full" />
  </Form.Item>
</Form>
```

Per-item override: `Form.Item` also takes `layout="vertical"`. Use it for a full-width
`TextArea` or `Upload` inside an otherwise horizontal form.

---

## 2. Tables on small screens

### Which pattern?

| Situation | Pattern |
| --- | --- |
| Back-office lists (HR, admin, reports), people compare values **across rows**, editable/line-item tables | **A. Horizontal scroll** (`DataTable` default) + `HorizontalScrollHint` |
| Same, but 7+ columns and a few are secondary | **A + B. Hide secondary columns** below md with `responsive` |
| Lists employees open **on phones** (My requests, Approvals inbox, Leave, Exit permits, notifications), each row is "a thing with a status and an action", or 8+ columns | **C. Cards below md**, table from md |

Never: shrink fonts below 12px to fit columns, or set `tableLayout="fixed"` with no widths
(columns collapse to unreadable slivers).

### A. Horizontal scroll (default)

```tsx
<HorizontalScrollHint>
  <DataTable<Row> rowKey="id" columns={columns} dataSource={rows} loading={isLoading} />
</HorizontalScrollHint>
```

- **R2.1** Use `DataTable`, not a raw `<Table>`. It already applies `scroll={{ x: 'max-content' }}`
  inside `<div className="erp-table-scroll min-w-0 w-full overflow-x-auto">`. With a raw
  `<Table>` you must add **both** the wrapper and `scroll.x`.
- **R2.2** Use `x: 'max-content'` (columns size to content). Use a **number** (`x: 1200`)
  only when columns have `ellipsis: true`, which needs a known total width, and then give
  every column a `width`.
- **R2.3** `fixed: 'left'` / `'right'` columns only from md. On a phone a pinned column
  eats half the screen:
  ```ts
  const isMdUp = useIsMdUp();
  { title: t('table.name'), dataIndex: 'name', fixed: isMdUp ? 'left' : undefined, width: 200 }
  ```
- **R2.4** Long text in a cell: `render: (v) => <span className="block max-w-[240px] truncate" title={v}>{v}</span>`,
  or `whitespace-normal break-words` for content that must be read in full. Dates and money:
  `whitespace-nowrap`.
- **R2.5** Page-level scroll only: `scroll={false}` on `DataTable` (for example when a
  table is the whole page and has a sticky header via `sticky`).

### B. Hide secondary columns below a breakpoint

AntD hides these itself (AntD breakpoints, §0):

```ts
const columns: ColumnsType<Row> = [
  { title: t('table.employee'), dataIndex: 'name' },                          // always
  { title: t('table.status'),   dataIndex: 'status' },                        // always
  { title: t('table.department'), dataIndex: 'dept', responsive: ['md'] },    // ≥768
  { title: t('table.createdAt'),  dataIndex: 'createdAt', responsive: ['xl'] }, // ≥1200
  { title: '', key: 'actions', render: renderActions },                       // always
];
```

Keep ≤ 3–4 columns visible below md. Anything hidden must still be reachable on the detail
page.

### C. Cards below md, table from md

Proposed reusable component, `components/ui/ResponsiveDataTable/ResponsiveDataTable.tsx`
(not in the repo yet):

```tsx
'use client';

import { Empty, Pagination, Spin } from 'antd';
import type { TableProps } from 'antd';
import type { ReactNode } from 'react';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useIsMdUp } from '@/hooks/useMediaQuery';

type Props<T extends object> = Omit<TableProps<T>, 'scroll'> & {
  /** Mobile rendering of one row. */
  renderCard: (row: T, index: number) => ReactNode;
  rowKey: keyof T & string | ((row: T) => string);
};

export default function ResponsiveDataTable<T extends object>({
  renderCard,
  ...tableProps
}: Props<T>): ReactNode {
  const isMdUp = useIsMdUp();
  if (isMdUp) return <DataTable<T> {...tableProps} />;

  const { dataSource = [], loading, pagination, rowKey } = tableProps;
  const keyOf = (row: T): string =>
    typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey]);

  return (
    <Spin spinning={Boolean(loading)}>
      {dataSource.length === 0 ? (
        <Empty className="py-8" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {dataSource.map((row, i) => (
            <li key={keyOf(row)} className="min-w-0">{renderCard(row, i)}</li>
          ))}
        </ul>
      )}
      {pagination !== false && pagination && (
        <div className="mt-4 flex justify-center">
          {/* Same server-side props as the table: current, pageSize, total, onChange */}
          <Pagination simple {...pagination} />
        </div>
      )}
    </Spin>
  );
}
```

A card for one row: identity and status on top, 2–4 key facts, actions at the bottom.

```tsx
function LeaveRequestCard({ row }: { row: LeaveRow }): ReactNode {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.employeeName}</p>
          <p className="truncate text-xs text-slate-600">{row.requestNo}</p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-600">{t('table.type')}</dt>
        <dd className="m-0 min-w-0 break-words">{row.leaveType}</dd>
        <dt className="text-slate-600">{t('table.dates')}</dt>
        <dd className="m-0 whitespace-nowrap">{row.range}</dd>
      </dl>
      <div className="mt-3 flex gap-2 [&>.ant-btn]:flex-1">
        <Button onClick={() => router.push(`/hr/leave/${row.id}`)}>{t('common.view')}</Button>
      </div>
    </div>
  );
}

<ResponsiveDataTable<LeaveRow>
  rowKey="id"
  columns={columns}
  dataSource={rows}
  loading={isLoading}
  pagination={pagination}          // the same object you pass to DataTable today
  renderCard={(row) => <LeaveRequestCard row={row} />}
/>
```

- **R2.6** Use the JS switch (`useIsMdUp`), not CSS `hidden md:block` on both trees. Data
  arrives after mount, so there's no visible flash, and you avoid rendering the list twice.
- **R2.7** Row selection and expandable rows have no card equivalent. Keep pattern A
  for those tables.
- **R2.8** Clickable cards are `<button>`/`<Link>` or contain one: keyboard reachable,
  visible focus.

---

## 3. Grid (`Row` / `Col`)

### 3.1 Standard spans

Every layout is full width (`24`) at xs. **Copy these; don't invent per-page spans.**

| Layout | `Col` props | Tailwind grid equivalent |
| --- | --- | --- |
| 1 column | `span={24}` | `grid grid-cols-1` |
| 2 columns | `xs={24} md={12}` | `grid grid-cols-1 md:grid-cols-2` |
| 3 columns | `xs={24} md={12} xl={8}` | `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3` |
| 4 columns (KPI cards) | `xs={24} sm={12} xl={6}` | `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` |
| Main + aside (detail page) | main `xs={24} xl={16}`, aside `xs={24} xl={8}` | `grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` |
| Form: 2 fields per row | `xs={24} md={12}` | |
| Form: 3 short fields per row (dates, numbers) | `xs={24} md={12} xl={8}` | |
| Form: full-width field (textarea, upload) | `span={24}` | `col-span-full` |

Why `xl` for 3/4 columns: AntD `lg` starts at 992, where the sidebar is still a drawer at
992–1023 and the content can be ~650px when pinned (R0.3).

Gutter constant (put it in `lib/theme/` and reuse):

```ts
export const GRID_GUTTER: [Partial<Record<Breakpoint, number>>, Partial<Record<Breakpoint, number>>] =
  [{ xs: 12, md: 16, xl: 24 }, { xs: 12, md: 16 }];

<Row gutter={GRID_GUTTER}>
  <Col xs={24} sm={12} xl={6}><KPICard … /></Col>
  …
</Row>
```

### 3.2 Fields in a form

```tsx
<Form layout="vertical">
  <Row gutter={GRID_GUTTER}>
    <Col xs={24} md={12}><Form.Item name="start" label={t('form.start')}><DatePicker className="w-full" /></Form.Item></Col>
    <Col xs={24} md={12}><Form.Item name="end"   label={t('form.end')}><DatePicker className="w-full" /></Form.Item></Col>
    <Col span={24}><Form.Item name="reason" label={t('form.reason')}><Input.TextArea rows={3} /></Form.Item></Col>
  </Row>
</Form>
```

### 3.3 Other responsive AntD props

```tsx
<Descriptions column={{ xs: 1, md: 2, xl: 3 }} layout={isMdUp ? 'horizontal' : 'vertical'} bordered />
<Steps orientation={isMdUp ? 'horizontal' : 'vertical'} items={steps} />   // v6: `orientation`
<Modal width={{ xs: '100%', md: 720, xl: 960 }} />                         // breakpoint object
<Drawer size={isMdUp ? 720 : '100%'} />                                     // v6: `size`, not `width`
```

### 3.4 When the sidebar makes viewport breakpoints wrong: container queries

Tailwind 4 has container queries built in. Use them for widgets that appear in different
widths (cards in a drawer, a detail aside, a dashboard tile):

```tsx
<section className="@container">
  <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">…</div>
</section>
```

The layout now follows the space it actually has, whether the sidebar is pinned or not.
AntD `Col` cannot do this, so prefer Tailwind grid here.

---

## 4. Overflow: causes and fixes

**Find the culprit first.** Paste into the browser console on the broken page:

```js
[...document.querySelectorAll('#main-content *')]
  .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
  .forEach((el) => console.log(el, el.scrollWidth, el.clientWidth));
```

`AppShell` clips the content area with `overflow-x-hidden`. On a broken page you see
**cut-off content** rather than a page scrollbar. That still means the page overflows.

| # | Cause | Fix |
| --- | --- | --- |
| R4.1 | **Flex child won't shrink.** Flex items default to `min-width: auto`, so a long string or table inside `flex-1` pushes siblings off-screen | `min-w-0` on the flex child (and on each ancestor flex item down to the content) |
| R4.2 | **Grid child won't shrink.** Same thing with custom tracks like `grid-cols-[1fr_300px]` | `grid-cols-[minmax(0,1fr)_300px]`, or `min-w-0` on the item. (`grid-cols-N` is already `minmax(0,1fr)`) |
| R4.3 | **Fixed icon/avatar gets squashed** while text overflows | `shrink-0` on the fixed part, `min-w-0 flex-1` + `truncate` on the text |
| R4.4 | **Table without a scroll wrapper** (raw `<Table>`) | `DataTable`, or `<div className="min-w-0 w-full overflow-x-auto">` + `scroll={{ x: 'max-content' }}` |
| R4.5 | **Fixed widths**: `style={{ width: 400 }}`, `w-[600px]`, `min-w-[800px]` on cards/inputs/selects | `w-full sm:w-64`, `w-full max-w-md`; tables only: `min-w-*` inside a scroll wrapper |
| R4.6 | **Row horizontal gutter** uses negative side margins (−gutter/2) | Parent needs ≥ gutter/2 padding (Card body or page padding has it). Don't put a gutter `Row` directly in a zero-padding `overflow-visible` box |
| R4.7 | **`Space` doesn't wrap**: button/tag rows run off the right edge | `<Space wrap>`, or `<div className="flex flex-wrap gap-2">` (or `<Flex wrap gap="small">`) |
| R4.8 | **Long unbroken strings** (emails, URLs, IDs, file names) | `break-words` (text), `break-all` (IDs/hashes), or `truncate` + `title` (needs `min-w-0` parent) |
| R4.9 | **Tailwind class seems ignored on an AntD component.** AntD's CSS-in-JS is unlayered and Tailwind 4 utilities are in `@layer utilities`, so AntD wins on the same property | Use the important modifier, already used in this repo: `className="!w-full"`. Use it only for the conflicting property |
| R4.10 | **`w-screen` / `100vw`** includes the scrollbar and ignores the sidebar | `w-full` |
| R4.11 | **Page sets its own height** (`h-screen`, `min-h-screen`, `100vh`) inside the shell, so you get double scrollbars and a clipped footer | Remove it. The shell's content div is the scroll container. Use `h-full`/`min-h-0` |
| R4.12 | **Header actions** (`useSetHeaderExtra`, `FormLayout extra`) overflow on phones | `flex flex-wrap gap-2`, full-width buttons below sm (`[&>.ant-btn]:w-full sm:[&>.ant-btn]:w-auto`), or move secondary actions into a `Dropdown` |
| R4.13 | **Images/charts/PDF previews** wider than the container | `max-w-full h-auto` on images; charts: `autoFit` + a `min-w-0` parent |
| R4.14 | **Tabs/Segmented with many items** | `Tabs` scrolls by itself (needs a `min-w-0` parent). `Segmented`: wrap in `overflow-x-auto` or use `block` + a `Select` below md |

Utility cheat sheet:

```
min-w-0          let flex/grid child shrink below its content
shrink-0         keep icons/avatars/badges at size
flex-1 min-w-0   "take remaining space, but allow shrinking"
truncate         one line + ellipsis (needs a width limit, i.e. min-w-0 parent)
break-words      wrap long words
overflow-x-auto  local horizontal scroll (tables, code, wide timelines)
flex-wrap gap-2  rows of buttons/tags
w-full sm:w-auto full-width controls on phones
max-w-full       never wider than the parent
```

---

## 5. Sidebar + header

**Already done in this repo. Don't rebuild it.** `AppShell` renders
`<div class="flex h-full min-h-0 w-full overflow-hidden">` → `SidebarShell` (desktop rail,
`hidden lg:flex shrink-0`; below 1024 an AntD `Drawer` with a close button) + `<main
class="flex min-w-0 flex-1 flex-col overflow-hidden">` → header + scroll area (`px-3 sm:px-4
lg:px-6`, `overflow-y-auto overflow-x-hidden`).

The sidebar is a **flex sibling** of `<main>`, not `position: fixed` with a matching
`margin-left`. That's why the content never needs per-breakpoint padding or margin
adjustments: when the rail hides below lg, `flex-1` simply takes the full width. When the
panel is pinned, the content shrinks. When unpinned, the flyout overlays without reflow.

Rules for pages and for anyone touching the shell:

- **R5.1** No AntD `Layout`/`Sider`, no second sidebar, no `fixed left-0` nav. AGENTS.md
  forbids parallel navigation. Navigation changes go in `sidebar.config.ts` (see `SIDEBAR.md`).
- **R5.2** Never offset page content by the sidebar width (`ml-[72px]`, `pl-[344px]`,
  `calc(100vw - …)`). The flex layout already accounts for it.
- **R5.3** Shell-relative decisions use **1024** (`useIsLgUp()` / `lg:`), per R0.2.
- **R5.4** Sticky elements inside a page (`FormPageFooter`, toolbars) use `sticky top-0` /
  `sticky bottom-0`. They stick to the shell's scroll container. `fixed bottom-0 left-0`
  would slide under the sidebar on desktop.
- **R5.5** Page-level drawers/modals go full width on phones (§3.3) and keep a visible
  close control.
- **R5.6** Keep `min-w-0` on every wrapper between `<main>` and your table/grid. Removing
  it from the shell's `<div className="min-w-0">{children}</div>` breaks every page.

For reference only (a layout **outside** `AppShell`, such as a public portal), the same
pattern in brief:

```tsx
<div className="flex h-dvh min-h-0 overflow-hidden">
  <aside className="hidden w-64 shrink-0 border-r lg:block">{nav}</aside>
  <Drawer open={open} onClose={() => setOpen(false)} placement="left" size={280}
          rootClassName="lg:hidden" title={t('nav.menu')}>{nav}</Drawer>
  <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <Button className="lg:hidden" icon={<MenuOutlined />} aria-label={t('nav.openMenu')}
              onClick={() => setOpen(true)} />
      <h1 className="min-w-0 flex-1 truncate text-base">{title}</h1>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-4 lg:px-6">
      <div className="min-w-0">{children}</div>
    </div>
  </main>
</div>
```

---

## Page-fix checklist

1. Test at **360, 768, 1024 (pinned and unpinned) and 1440px** wide. Run the §4 console
   snippet at each width.
2. Form: `layout="vertical"` (or `useResponsiveFormLayout`), inputs `w-full`, no fixed widths.
3. Grid: spans from §3.1 only. 3+ columns start at `xl`.
4. Table: `DataTable` + `HorizontalScrollHint`. `responsive` on secondary columns. Cards below
   md for employee-facing lists. `fixed` columns only from md.
5. Flex rows: `min-w-0` on growing children, `shrink-0` on icons, `flex-wrap` on button rows.
6. Modals/drawers: responsive width, full width on phones.
7. Nothing sets `h-screen`, `100vw` or a sidebar offset.
