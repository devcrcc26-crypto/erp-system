-- Leave balance ledger: append-only entries per employee / leave type / leave
-- year (employment anniversary). leave_balance stays as a cache of the sums
-- (plus pending days), so existing rows are not modified here.

-- CreateEnum
CREATE TYPE "LeaveBalanceEntryKind" AS ENUM ('ENTITLEMENT', 'CARRY_OVER', 'ADJUSTMENT', 'OPENING_BALANCE', 'USED', 'EXPIRED');

-- CreateTable
CREATE TABLE "leave_balance_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "leave_year_start" DATE NOT NULL,
    "leave_year_end" DATE NOT NULL,
    "kind" "LeaveBalanceEntryKind" NOT NULL,
    "days" DECIMAL(6,1) NOT NULL,
    "reason" TEXT,
    "dedupe_key" TEXT,
    "source_contract_id" TEXT,
    "source_leave_request_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balance_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_entry_dedupe_key_key" ON "leave_balance_entry"("dedupe_key");
CREATE INDEX "idx_leave_balance_entry_employee_year" ON "leave_balance_entry"("employee_id", "leave_type", "leave_year_start");
CREATE INDEX "idx_leave_balance_entry_company" ON "leave_balance_entry"("company_id");
CREATE INDEX "idx_leave_balance_entry_contract" ON "leave_balance_entry"("source_contract_id");
CREATE INDEX "idx_leave_balance_entry_leave" ON "leave_balance_entry"("source_leave_request_id");

-- AddForeignKey
ALTER TABLE "leave_balance_entry" ADD CONSTRAINT "leave_balance_entry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balance_entry" ADD CONSTRAINT "leave_balance_entry_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balance_entry" ADD CONSTRAINT "leave_balance_entry_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_balance_entry" ADD CONSTRAINT "leave_balance_entry_source_contract_id_fkey" FOREIGN KEY ("source_contract_id") REFERENCES "employee_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_balance_entry" ADD CONSTRAINT "leave_balance_entry_source_leave_request_id_fkey" FOREIGN KEY ("source_leave_request_id") REFERENCES "leave_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: each existing leave_balance row (calendar-labelled year Y) becomes
--   OPENING_BALANCE = entitled + brought_forward   (when non-zero)
--   USED            = -used                        (when non-zero)
-- in the leave year that starts on the employee's employment anniversary in Y
-- (Feb 29 → Feb 28 in non-leap years), or Jan 1–Dec 31 when employment_date is
-- null. remaining (= sum − pending) is unchanged. Pending stays on leave_balance.
WITH src AS (
    SELECT
        b.id,
        b.company_id,
        b.employee_id,
        b.leave_type,
        b.year,
        b.entitled,
        b.brought_forward,
        b.used,
        u.employment_date AS ed
    FROM "leave_balance" b
    JOIN "user" u ON u.id = b.employee_id
),
anchored AS (
    SELECT
        s.*,
        EXTRACT(MONTH FROM s.ed)::int AS m,
        EXTRACT(DAY FROM s.ed)::int AS d
    FROM src s
),
years AS (
    SELECT
        a.*,
        CASE
            WHEN a.ed IS NULL THEN make_date(a.year, 1, 1)
            ELSE make_date(
                a.year,
                a.m,
                LEAST(a.d, EXTRACT(DAY FROM (make_date(a.year, a.m, 1) + INTERVAL '1 month - 1 day'))::int)
            )
        END AS ys,
        CASE
            WHEN a.ed IS NULL THEN make_date(a.year, 12, 31)
            ELSE (
                make_date(
                    a.year + 1,
                    a.m,
                    LEAST(a.d, EXTRACT(DAY FROM (make_date(a.year + 1, a.m, 1) + INTERVAL '1 month - 1 day'))::int)
                ) - 1
            )
        END AS ye
    FROM anchored a
)
INSERT INTO "leave_balance_entry" (
    "id", "company_id", "employee_id", "leave_type", "leave_year_start", "leave_year_end",
    "kind", "days", "reason", "dedupe_key", "created_at"
)
SELECT
    gen_random_uuid()::text,
    y.company_id,
    y.employee_id,
    y.leave_type,
    y.ys,
    y.ye,
    'OPENING_BALANCE'::"LeaveBalanceEntryKind",
    (y.entitled + y.brought_forward),
    'Migrated balance ' || y.year || ': entitled ' || y.entitled || ', brought forward ' || y.brought_forward,
    'MIGRATED:OPENING:' || y.id,
    CURRENT_TIMESTAMP
FROM years y
WHERE (y.entitled + y.brought_forward) <> 0
UNION ALL
SELECT
    gen_random_uuid()::text,
    y.company_id,
    y.employee_id,
    y.leave_type,
    y.ys,
    y.ye,
    'USED'::"LeaveBalanceEntryKind",
    -y.used,
    'Migrated used days ' || y.year,
    'MIGRATED:USED:' || y.id,
    CURRENT_TIMESTAMP
FROM years y
WHERE y.used <> 0;
