# Work Schedule & Public Holidays

This module is the **only** source of working days and working hours in CCECC PWF.

Do **not** hardcode weekends, Saturdays as half days, or public holidays in leave, overtime, attendance, or any new module. HR manages schedules and holidays from the UI.

## Where it lives

| Layer | Path |
|-------|------|
| Schema | `backend/prisma/schema.prisma` - `WorkSchedule`, `WorkScheduleDay`, `EmployeeScheduleAssignment`, `PublicHoliday`, `LeaveRequestPeriod` |
| Seed | `backend/prisma/seed/work-schedules.seed.ts` - **CRCC Standard** only (no holidays) |
| Engine | `backend/src/modules/work-schedule/application/services/work-schedule.service.ts` |
| UI | `/hr/work-schedules`, `/hr/public-holidays` |

## How to count working days

Inject `WorkScheduleService` and call:

```ts
const result = await this.workScheduleService.calculateWorkingDays(
  employeeId,
  companyId,
  startDate, // UTC date-only
  endDate,   // inclusive
);

result.totalDays; // Prisma.Decimal, e.g. 4.5
result.breakdown; // each calendar day: working | half | weekend | holiday
```

Rules already applied by the engine:

- Employee assignment for that date, else the company **default** schedule
- Public holiday matching the employee's nationality (or `ALL`); `nationality: null` only gets `ALL`
- Holiday weight is **0** and takes priority over a Saturday half day
- Half working day weight is **0.5**
- Inactive holidays (`isActive: false`) are ignored
- Recurring holidays match **month and day only**

For a single date's expected hours:

```ts
const hours = await this.workScheduleService.calculateWorkingHours(
  employeeId,
  companyId,
  date,
);
```

To preview several ranges (leave form):

`POST /hr/work-schedules/preview-days`

```json
{
  "employeeId": "<uuid>",
  "periods": [{ "startDate": "2026-09-14", "endDate": "2026-09-18" }]
}
```

## Leave requests

Leave no longer uses a single client-supplied `days` value.

1. Client sends `periods: [{ startDate, endDate }, ...]`
2. Backend calls `resolveLeavePeriods` (overlap check + `calculateWorkingDays` per period)
3. A period with `totalDays === 0` (only weekends/holidays) is rejected
4. Sum of period days is stored on `LeaveRequest.days` (denormalized until those columns are dropped)
5. Each range is stored on `LeaveRequestPeriod`

Legacy `startDate` + `endDate` on submit is still accepted and treated as one period (imports).

## Assigning schedules

- One **active** assignment per employee: creating a new one sets `effectiveTo` on the previous row
- `User.workScheduleId` is a convenience FK and is independent of `leavePolicyId`
- Employees with no assignment use `WorkSchedule.isDefault = true`

## Public holidays

- Created and deactivated by HR - never seeded
- `DELETE` deactivates (`isActive: false`); HR can reactivate
- Daily 07:00 cron notifies all **HR Officer** users when `daysUntil <= notifyDaysBefore`
- Duplicates are skipped if a notification with the same holiday link was already created today

## Adding this to a new module

1. Import `WorkScheduleModule` (or use the exported `WorkScheduleService` from a module that already imports it)
2. Resolve `employeeId` and `companyId` from the JWT / employee record - never from an untrusted body field for tenancy
3. Call `calculateWorkingDays` or `calculateWorkingHours`
4. Persist the numeric result your module needs (leave days, overtime eligibility, attendance expected hours)
5. Do not copy CRCC Standard hours into application code

## Overtime integration

Overtime hour buckets (`regularHours`, `nightHours`, `weekendHours`, `holidayHours`) are classified by `OvertimeEntryService`, which loads the employee's active `WorkSchedule` and `PublicHoliday` calendar for the entry date.

### Hour-splitting (15-minute blocks)

Priority, first match wins:

1. **Holiday** - `PublicHoliday` is active and `appliesToNationality` matches the employee (`ALL` for everyone; `ETHIOPIAN` / `CHINESE` only for that nationality; `nationality: null` only gets `ALL`)
2. **Weekend** - that weekday has `WorkScheduleDay.isWorkingDay = false`, **or** `isHalfDay` (e.g. CRCC Standard Saturday — the entire day is Weekend OT, including morning)
3. **Night** - 22:00–06:00 on a full working day (hardcoded; not schedule-dependent)
4. **Regular** - everything else on a full working day

Interactive save **ignores** client `isHoliday`. The calendar sets `OvertimeEntry.isHoliday`. The column is kept for historical rows; those rows are not retroactively reclassified.

Live preview (no duplicated client logic):

`POST /hr/overtime/preview-entry`

```json
{
  "employeeId": "<uuid>",
  "date": "2026-09-14",
  "startTime": "18:00",
  "endTime": "21:00"
}
```

### Import `isHoliday` override

Excel still accepts `isHoliday`. If it is true and the date **is** a registered holiday for that nationality, the row is accepted silently. If it is true and the date **is not** in the calendar, the row is still imported as holiday hours with status **`warning`** (yellow). If the column is absent or false, the calendar is used.

### Approval `unregisteredHolidayDates`

On submit (and resubmit), overtime writes `ApprovalRequest.formData.unregisteredHolidayDates: string[]` - unique `YYYY-MM-DD` values where `isHoliday` is true but the date is not in `PublicHoliday` for that employee. The approvals inbox (and sheet detail) show a warning banner when the array is non-empty. Every tier sees the same `formData`.

### Calling `WorkScheduleService` from a new module

1. Import `WorkScheduleModule`
2. Inject `WorkScheduleService`
3. For working-day counts: `calculateWorkingDays` / `resolveLeavePeriods`
4. For a single date's holiday: `isHolidayForEmployee(companyId, nationality, date)`
5. For expected hours: `calculateWorkingHours`
6. For overtime buckets: inject `OvertimeEntryService.classifyEntry` - do not copy the splitter

## Integration status

| Module | Status | Notes |
|--------|--------|-------|
| Leave | ✅ Integrated | Uses `calculateWorkingDays` / `resolveLeavePeriods` |
| Overtime | ✅ Integrated | Schedule-aware hour splitter + calendar holidays |
| Attendance | ⏳ Not yet | `calculateWorkingHours` exists, nothing calls it |
| Payroll | ⏳ Not yet | No link |
| Project schedule | ➖ Not applicable | Different schedule concept (`schedule.service.ts` has a TODO) |
| Dashboard week charts | ➖ Not applicable | ISO week-start math, not HR working days |
