# Work Schedule & Public Holidays

This module is the **only** source of working days and working hours in CCECC PWF.

Do **not** hardcode weekends, Saturdays as half days, or public holidays in leave, overtime, attendance, or any new module. HR manages schedules and holidays from the UI.

## Where it lives

| Layer | Path |
|-------|------|
| Schema | `backend/prisma/schema.prisma` — `WorkSchedule`, `WorkScheduleDay`, `EmployeeScheduleAssignment`, `PublicHoliday`, `LeaveRequestPeriod` |
| Seed | `backend/prisma/seed/work-schedules.seed.ts` — **CRCC Standard** only (no holidays) |
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

- Created and deactivated by HR — never seeded
- `DELETE` deactivates (`isActive: false`); HR can reactivate
- Daily 07:00 cron notifies all **HR Officer** users when `daysUntil <= notifyDaysBefore`
- Duplicates are skipped if a notification with the same holiday link was already created today

## Adding this to a new module

1. Import `WorkScheduleModule` (or use the exported `WorkScheduleService` from a module that already imports it)
2. Resolve `employeeId` and `companyId` from the JWT / employee record — never from an untrusted body field for tenancy
3. Call `calculateWorkingDays` or `calculateWorkingHours`
4. Persist the numeric result your module needs (leave days, overtime eligibility, attendance expected hours)
5. Do not copy CRCC Standard hours into application code
