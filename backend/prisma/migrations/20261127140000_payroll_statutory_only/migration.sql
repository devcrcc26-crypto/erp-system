-- Corrections with zero net difference but changed tax / pension: a
-- statutory-only reconciliation item (no payment) declared by the next run.
ALTER TYPE "payroll_reconciliation_direction" ADD VALUE 'STATUTORY_ONLY';
