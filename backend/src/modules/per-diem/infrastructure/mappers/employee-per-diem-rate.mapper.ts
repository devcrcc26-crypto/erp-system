import type { EmployeePerDiemRate } from '@prisma/client';

export interface EmployeePerDiemRateResponse {
  id: string;
  companyId: string;
  employeeId: string;
  domesticRate: number | null;
  regionalRate: number | null;
  internationalRate: number | null;
  domesticActive: boolean;
  regionalActive: boolean;
  internationalActive: boolean;
  currency: EmployeePerDiemRate['currency'];
  createdAt: string;
  updatedAt: string;
}

function toNumber(
  value: EmployeePerDiemRate[keyof EmployeePerDiemRate],
): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Maps a Prisma employee per diem rate row to a JSON-safe API response.
 */
export function mapEmployeePerDiemRateResponse(
  row: EmployeePerDiemRate,
): EmployeePerDiemRateResponse {
  return {
    id: row.id,
    companyId: row.companyId,
    employeeId: row.employeeId,
    domesticRate: toNumber(row.domesticRate),
    regionalRate: toNumber(row.regionalRate),
    internationalRate: toNumber(row.internationalRate),
    domesticActive: row.domesticActive,
    regionalActive: row.regionalActive,
    internationalActive: row.internationalActive,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
