/**
 * Standalone verification for attendance Excel parse + employee matching.
 *
 * Run from backend/:
 *   npx ts-node src/modules/attendance/utils/attendance-test.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { parseAttendanceExcel } from './attendance-excel.parser';
import {
  AttendanceMatchingService,
  type AttendanceMatchResult,
  type MatchConfidence,
} from '../application/services/attendance-matching.service';

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: resolve(__dirname, '../../../../.env') });
} catch {
  // dotenv is optional for this standalone script
}

const AUGUST_ATTENDANCE_FILE =
  process.env.ATTENDANCE_TEST_FILE ??
  'C:\\Users\\PAVILION\\Downloads\\Telegram Desktop\\August Attendance (2).xlsx';

const DEFAULT_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

function pad(value: string, width: number): string {
  if (value.length >= width) {
    return value.slice(0, width - 1) + '…';
  }
  return value + ' '.repeat(width - value.length);
}

function printTable(results: AttendanceMatchResult[]): void {
  const header =
    `${pad('Attendance name', 28)} | ${pad('ERP name', 28)} | ${pad('ERP ID', 14)} | ${pad('Confidence', 12)} | Days | Score`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const row of results) {
    console.log(
      `${pad(row.attendanceName, 28)} | ${pad(row.matchedEmployeeName ?? '-', 28)} | ${pad(row.matchedEmployeeErpId ?? '-', 14)} | ${pad(row.confidence, 12)} | ${String(row.data.dailyData.length).padStart(4)} | ${row.score ?? '-'}`,
    );
  }
}

function countByConfidence(
  results: AttendanceMatchResult[],
): Record<MatchConfidence, number> {
  return {
    IDENTITY: results.filter((r) => r.confidence === 'IDENTITY').length,
    ID_MATCH: results.filter((r) => r.confidence === 'ID_MATCH').length,
    NAME_HIGH: results.filter((r) => r.confidence === 'NAME_HIGH').length,
    NAME_REVIEW: results.filter((r) => r.confidence === 'NAME_REVIEW').length,
    MAPPED_INACTIVE: results.filter((r) => r.confidence === 'MAPPED_INACTIVE')
      .length,
    MANUAL: results.filter((r) => r.confidence === 'MANUAL').length,
    NO_MATCH: results.filter((r) => r.confidence === 'NO_MATCH').length,
    IGNORED: results.filter((r) => r.confidence === 'IGNORED').length,
  };
}

async function main(): Promise<void> {
  const companyId = process.env.COMPANY_ID ?? DEFAULT_COMPANY_ID;
  const filePath = AUGUST_ATTENDANCE_FILE;
  const fileName = filePath.split(/[/\\]/).pop() ?? 'attendance.xlsx';

  console.log(`File: ${filePath}`);
  console.log(`Company: ${companyId}`);

  const buffer = readFileSync(filePath);
  const parsed = await parseAttendanceExcel(buffer, fileName);

  console.log(
    `Parsed ${parsed.rows.length} rows for ${parsed.year}-${String(parsed.month).padStart(2, '0')}`,
  );
  if (parsed.rows[0]) {
    console.log(
      `Sample daily columns: ${parsed.rows[0].dailyData.length}, payableHours=${parsed.rows[0].payableHours}`,
    );
    const sample = parsed.rows[0].dailyData.find((d) => d.clockInMachine);
    if (sample) {
      console.log(
        `Sample clock: machine ${sample.clockInMachine} → local ${sample.clockInLocal}`,
      );
    }
  }

  const prisma = new PrismaClient() as unknown as PrismaService;
  const matching = new AttendanceMatchingService(prisma);

  try {
    const results = await matching.matchRows(parsed.rows, companyId);
    printTable(results);

    const counts = countByConfidence(results);
    const matched = counts.ID_MATCH + counts.NAME_HIGH;
    const review = counts.NAME_REVIEW;
    const rejected = counts.NO_MATCH;

    console.log('');
    console.log('Summary');
    console.log(`  ID_MATCH:     ${counts.ID_MATCH}`);
    console.log(`  NAME_HIGH:    ${counts.NAME_HIGH}`);
    console.log(`  NAME_REVIEW:  ${counts.NAME_REVIEW}`);
    console.log(`  NO_MATCH:     ${counts.NO_MATCH}`);
    console.log(`  matched (ID+HIGH): ${matched}`);
    console.log(`  review:            ${review}`);
    console.log(`  rejected:          ${rejected}`);
  } finally {
    await (prisma as unknown as PrismaClient).$disconnect();
  }
}

void main();
