/**
 * Ensures Jinxia (HR Officer) has in-app notification prefs enabled for flight events.
 * Usage: npx ts-node --transpile-only prisma/scripts/ensure-hr-flight-notification-prefs.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const EVENT_TYPES = [
  'flight.approved',
  'flight.booking_required',
  'flight.ticket_attached',
  'flight.tickets_acknowledged',
  'FLIGHT_APPLICATION_APPROVED',
  'FLIGHT_TICKET_BOOKING_REQUIRED',
  'FLIGHT_ALL_TICKETS_ACKNOWLEDGED',
  'approval.pending',
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { firstName: { contains: 'jinxia', mode: 'insensitive' } },
          { lastName: { contains: 'jinxia', mode: 'insensitive' } },
          { email: { contains: 'jinxia', mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (users.length === 0) {
      console.log('No user matching jinxia found');
      return;
    }

    for (const user of users) {
      console.log(
        `Updating prefs for ${user.firstName} ${user.lastName} <${user.email}> (${user.id})`,
      );

      // Re-enable any disabled prefs for this user
      await prisma.notificationPreference.updateMany({
        where: { userId: user.id, deletedAt: null, inApp: false },
        data: { inApp: true, updatedBy: SYSTEM_USER_ID },
      });

      for (const eventType of EVENT_TYPES) {
        await prisma.notificationPreference.upsert({
          where: {
            userId_eventType: { userId: user.id, eventType },
          },
          update: {
            inApp: true,
            email: true,
            updatedBy: SYSTEM_USER_ID,
            deletedAt: null,
            deletedBy: null,
          },
          create: {
            userId: user.id,
            eventType,
            inApp: true,
            email: true,
            sms: false,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    console.log(`Done - ${users.length} user(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
