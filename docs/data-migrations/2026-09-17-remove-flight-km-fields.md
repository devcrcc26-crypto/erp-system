# Data removed by migration `20260917090100_remove_km_fields_from_flight_business_trip`

**Captured:** 2026-09-17, read-only query against the production Supabase database, before the migration was applied.

**Why the data is dropped:** `km_at_departure` / `km_at_return` are vehicle odometer readings. They do not apply to air travel (flight applications, third-country business trips), so the columns are removed from both tables.

## `flight_application` rows with km values

| id | application_number | km_at_departure | km_at_return | created_at (UTC) |
|---|---|---|---|---|
| `3fd14a6a-50ea-43c9-9480-e1db7952ea07` | FA-0167 | 45678 | 45794 | 2026-09-17 07:38:49 |
| `85b84bfb-1c80-4f85-9dc2-b3c082b60955` | FA-0168 | 2344 | 2444 | 2026-09-17 07:40:27 |

Both rows were created within two minutes of each other on 2026-09-17 and look like test entries.

## `business_trip` rows with km values

None.

## Query used

```sql
SELECT id, application_number, km_at_departure, km_at_return, created_at
FROM flight_application
WHERE km_at_departure IS NOT NULL OR km_at_return IS NOT NULL
ORDER BY created_at;

SELECT id, trip_number, km_at_departure, km_at_return
FROM business_trip
WHERE km_at_departure IS NOT NULL OR km_at_return IS NOT NULL;
```
