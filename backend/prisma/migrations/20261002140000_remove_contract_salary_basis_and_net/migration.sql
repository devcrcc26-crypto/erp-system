-- Drop EmployeeContract salary basis / stored net (gross components only)
ALTER TABLE "employee_contract" DROP COLUMN IF EXISTS "salary_basis";
ALTER TABLE "employee_contract" DROP COLUMN IF EXISTS "net_salary";

-- DropEnum SalaryBasis
DROP TYPE IF EXISTS "SalaryBasis";
