import { randomUUID } from 'crypto';
import type { AttendanceDailyRaw } from '../../../src/modules/attendance/utils/attendance-excel.parser';
import type { AttendanceService } from '../../../src/modules/attendance/application/services/attendance.service';
import type { PrismaService } from '../../../src/shared/prisma/prisma.service';

export function utcDateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isSunday(date: Date): boolean {
  return date.getUTCDay() === 0;
}

export function isSaturday(date: Date): boolean {
  return date.getUTCDay() === 6;
}

export type DayScanPattern =
  | 'normal'
  | 'late'
  | 'absent'
  | 'missing_clock_out'
  | 'early_leave'
  | 'wfh_scan'
  | 'skip';

export function buildDayScan(
  pattern: DayScanPattern,
): AttendanceDailyRaw['clockInLocal'] | null {
  if (pattern === 'absent' || pattern === 'skip') {
    return null;
  }
  return null;
}

export function makeScanRow(
  date: Date,
  pattern: DayScanPattern,
): AttendanceDailyRaw {
  if (pattern === 'absent' || pattern === 'skip') {
    return {
      date,
      clockInMachine: null,
      clockOutMachine: null,
      clockInLocal: null,
      clockOutLocal: null,
    };
  }
  if (pattern === 'missing_clock_out') {
    return {
      date,
      clockInMachine: '13:35',
      clockOutMachine: null,
      clockInLocal: '08:35',
      clockOutLocal: null,
    };
  }
  if (pattern === 'early_leave') {
    return {
      date,
      clockInMachine: '13:30',
      clockOutMachine: '16:00',
      clockInLocal: '08:30',
      clockOutLocal: '11:00',
    };
  }
  if (pattern === 'wfh_scan') {
    return {
      date,
      clockInMachine: '13:30',
      clockOutMachine: '22:30',
      clockInLocal: '08:30',
      clockOutLocal: '17:30',
    };
  }
  const late = pattern === 'late';
  return {
    date,
    clockInMachine: late ? '13:45' : '13:30',
    clockOutMachine: '22:30',
    clockInLocal: late ? '08:45' : '08:30',
    clockOutLocal: '17:30',
  };
}

/**
 * Imports one month of attendance for many employees via calculateDailyLogs.
 */
export async function importAttendanceMonth(
  attendance: AttendanceService,
  prisma: PrismaService,
  params: {
    companyId: string;
    actorUserId: string;
    month: number;
    year: number;
    rows: Array<{ employeeId: string; dailyData: AttendanceDailyRaw[] }>;
    overwrite: boolean;
  },
): Promise<{ batchId: string; recordCount: number; logCount: number }> {
  const { companyId, actorUserId, month, year, rows, overwrite } = params;

  const existing = await prisma.attendanceImportBatch.findUnique({
    where: { companyId_month_year: { companyId, month, year } },
  });
  if (existing && !overwrite) {
    throw new Error(
      `Attendance batch already exists for ${month}/${year}; pass overwrite`,
    );
  }

  let lastExportDate: Date | null = null;
  for (const row of rows) {
    for (const day of row.dailyData) {
      if (!lastExportDate || day.date.getTime() > lastExportDate.getTime()) {
        lastExportDate = day.date;
      }
    }
  }

  const prepared = await Promise.all(
    rows.map(async (row) => {
      const { logs, summary } = await attendance.calculateDailyLogs(
        row.employeeId,
        companyId,
        row.dailyData,
        month,
        year,
        lastExportDate,
      );
      return {
        employeeId: row.employeeId,
        logs,
        summary,
        recordId: randomUUID(),
      };
    }),
  );

  let batchId = '';

  await prisma.$transaction(async (tx) => {
    if (existing && overwrite) {
      const records = await tx.attendanceRecord.findMany({
        where: { importBatchId: existing.id },
        select: { id: true },
      });
      const recordIds = records.map((r) => r.id);
      const dailyLogs =
        recordIds.length > 0
          ? await tx.attendanceDailyLog.findMany({
              where: { attendanceRecordId: { in: recordIds } },
              select: { id: true },
            })
          : [];
      const dailyLogIds = dailyLogs.map((l) => l.id);
      if (dailyLogIds.length > 0) {
        await tx.fieldMovementEntry.deleteMany({
          where: { dailyLogId: { in: dailyLogIds } },
        });
        await tx.attendanceDailyLogCorrection.deleteMany({
          where: { dailyLogId: { in: dailyLogIds } },
        });
      }
      await tx.fieldMovementLog.deleteMany({
        where: { companyId, month, year },
      });
      await tx.attendanceMonthlyApproval.deleteMany({
        where: {
          OR: [{ importBatchId: existing.id }, { companyId, month, year }],
        },
      });
      await tx.attendanceImportBatch.delete({ where: { id: existing.id } });
    }

    const batch = await tx.attendanceImportBatch.create({
      data: {
        id: randomUUID(),
        companyId,
        month,
        year,
        fileName: `seed-payroll-test-${year}-${month}.xlsx`,
        importedBy: actorUserId,
        totalRows: rows.length,
        matchedRows: rows.length,
        reviewRows: 0,
        rejectedRows: 0,
        importedAt: new Date(),
      },
    });
    batchId = batch.id;

    if (prepared.length > 0) {
      await tx.attendanceRecord.createMany({
        data: prepared.map((item) => ({
          id: item.recordId,
          companyId,
          employeeId: item.employeeId,
          importBatchId: batch.id,
          month,
          year,
          scheduledDays: item.summary.scheduledDays,
          presentDays: item.summary.presentDays,
          absentDays: item.summary.absentDays,
          holidayDays: item.summary.holidayDays,
          lateDays: item.summary.lateDays,
          totalLateMinutes: item.summary.totalLateMinutes,
          missingClockInDays: item.summary.missingClockInDays,
          missingClockOutDays: item.summary.missingClockOutDays,
          payableHours: item.summary.payableHours,
          flaggedDays: item.summary.flaggedDays,
          resolvedDays: 0,
          importedAt: new Date(),
        })),
      });

      const dailyRows = prepared.flatMap((item) =>
        item.logs.map((log) => ({
          id: randomUUID(),
          attendanceRecordId: item.recordId,
          date:
            log.date instanceof Date ? log.date : new Date(String(log.date)),
          clockInMachine: log.clockInMachine,
          clockOutMachine: log.clockOutMachine,
          clockInLocal: log.clockInLocal,
          clockOutLocal: log.clockOutLocal,
          isHoliday: log.isHoliday,
          holidayName: log.holidayName,
          isWeekend: log.isWeekend,
          isHalfDay: log.isHalfDay,
          wasPresent: log.wasPresent,
          scheduledHours: log.scheduledHours,
          recordedHours: log.recordedHours,
          isLate: log.isLate,
          lateMinutes: log.lateMinutes,
          missingClockIn: log.missingClockIn,
          missingClockOut: log.missingClockOut,
          flag: log.flag,
          isLastExportDay: log.isLastExportDay,
        })),
      );

      const chunk = 400;
      for (let offset = 0; offset < dailyRows.length; offset += chunk) {
        await tx.attendanceDailyLog.createMany({
          data: dailyRows.slice(offset, offset + chunk),
        });
      }
    }
  });

  await attendance.createMonthlyApproval(batchId, companyId, actorUserId);
  await attendance.recalculateCompanyAttendanceMonth(companyId, month, year);

  const logCount = prepared.reduce((sum, p) => sum + p.logs.length, 0);
  return { batchId, recordCount: prepared.length, logCount };
}
