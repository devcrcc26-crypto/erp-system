import type { PrismaClient } from '@prisma/client';
import type { AttendanceNameLink } from './employee-matching';

/**
 * MAPPED attendance identities (Deli device name → user), as decided in the attendance
 * import review. IGNORED identities and deleted rows are skipped.
 */
export async function loadAttendanceNameLinks(
  prisma: PrismaClient,
  companyId: string,
): Promise<AttendanceNameLink[]> {
  const identities = await prisma.attendanceIdentity.findMany({
    where: { companyId, deletedAt: null, status: 'MAPPED', userId: { not: null } },
    select: { attendanceName: true, userId: true },
  });
  return identities.map((identity) => ({
    attendanceName: identity.attendanceName,
    userId: identity.userId!,
  }));
}
