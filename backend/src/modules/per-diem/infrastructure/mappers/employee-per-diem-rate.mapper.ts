import type { EmployeePerDiemRate } from '@prisma/client';

export interface EmployeePerDiemRateResponse {
  id: string;
  companyId: string;
  employeeId: string;
  americasRate: number | null;
  asiaRate: number | null;
  domesticRate: number | null;
  eastAfricaRate: number | null;
  europeRate: number | null;
  middleEastRate: number | null;
  otherAfricaRate: number | null;
  americasActive: boolean;
  asiaActive: boolean;
  domesticActive: boolean;
  eastAfricaActive: boolean;
  europeActive: boolean;
  middleEastActive: boolean;
  otherAfricaActive: boolean;
  currency: EmployeePerDiemRate['currency'];
  createdAt: string;
  updatedAt: string;
}

function toNumber(value: EmployeePerDiemRate[keyof EmployeePerDiemRate]): number | null {
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
    americasRate: toNumber(row.americasRate),
    asiaRate: toNumber(row.asiaRate),
    domesticRate: toNumber(row.domesticRate),
    eastAfricaRate: toNumber(row.eastAfricaRate),
    europeRate: toNumber(row.europeRate),
    middleEastRate: toNumber(row.middleEastRate),
    otherAfricaRate: toNumber(row.otherAfricaRate),
    americasActive: row.americasActive,
    asiaActive: row.asiaActive,
    domesticActive: row.domesticActive,
    eastAfricaActive: row.eastAfricaActive,
    europeActive: row.europeActive,
    middleEastActive: row.middleEastActive,
    otherAfricaActive: row.otherAfricaActive,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
