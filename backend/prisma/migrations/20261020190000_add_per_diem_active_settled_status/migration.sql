-- Per-diem lifecycle: ACTIVE after first disbursement, SETTLED after request settlement
ALTER TYPE "PerDiemStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "PerDiemStatus" ADD VALUE IF NOT EXISTS 'SETTLED';
