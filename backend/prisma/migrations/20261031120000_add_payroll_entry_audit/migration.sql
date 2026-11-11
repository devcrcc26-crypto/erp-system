-- HR overrides of payroll entry figures (who, when, from/to, why).

CREATE TABLE "payroll_entry_audit" (
    "id" TEXT NOT NULL,
    "payroll_entry_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "reason" TEXT,
    "changed_by_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "company_id" TEXT NOT NULL,

    CONSTRAINT "payroll_entry_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_payroll_entry_audit_entry" ON "payroll_entry_audit"("payroll_entry_id");
CREATE INDEX "idx_payroll_entry_audit_company" ON "payroll_entry_audit"("company_id");
CREATE INDEX "idx_payroll_entry_audit_changed_by" ON "payroll_entry_audit"("changed_by_id");

ALTER TABLE "payroll_entry_audit"
    ADD CONSTRAINT "payroll_entry_audit_payroll_entry_id_fkey"
    FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_entry_audit"
    ADD CONSTRAINT "payroll_entry_audit_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_entry_audit"
    ADD CONSTRAINT "payroll_entry_audit_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
