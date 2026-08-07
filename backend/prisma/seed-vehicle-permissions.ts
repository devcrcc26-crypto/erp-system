/**
 * Upserts vehicle-related permissions and grants them to all roles.
 * Also seeds 5 sample company vehicles.
 * Usage: npx ts-node --transpile-only prisma/seed-vehicle-permissions.ts
 */
import { PrismaClient, VehicleStatus, VehicleType, FuelType } from '@prisma/client';
import { randomUUID } from 'crypto';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSION_DEFS = [
  {
    module: 'vehicles',
    action: 'view',
    description: 'View company vehicle fleet',
  },
  {
    module: 'vehicles',
    action: 'edit',
    description: 'Create, update and delete company vehicles',
  },
  {
    module: 'vehicle-application',
    action: 'view',
    description: 'View vehicle applications',
  },
  {
    module: 'vehicle-application',
    action: 'create',
    description: 'Submit and cancel vehicle applications',
  },
  {
    module: 'vehicle-refueling',
    action: 'view',
    description: 'View vehicle refueling requests',
  },
  {
    module: 'vehicle-refueling',
    action: 'create',
    description: 'Submit and cancel vehicle refueling requests',
  },
] as const;

const SAMPLE_VEHICLES: Array<{
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  color: string;
  vehicleType: VehicleType;
  fuelType: FuelType;
}> = [
  {
    plateNumber: 'AA-12345',
    make: 'Toyota',
    model: 'Land Cruiser',
    year: 2022,
    color: 'White',
    vehicleType: VehicleType.CAR,
    fuelType: FuelType.DIESEL,
  },
  {
    plateNumber: 'AA-23456',
    make: 'Toyota',
    model: 'Hilux',
    year: 2021,
    color: 'White',
    vehicleType: VehicleType.PICKUP,
    fuelType: FuelType.DIESEL,
  },
  {
    plateNumber: 'AA-34567',
    make: 'Toyota',
    model: 'HiAce',
    year: 2020,
    color: 'White',
    vehicleType: VehicleType.VAN,
    fuelType: FuelType.DIESEL,
  },
  {
    plateNumber: 'AA-45678',
    make: 'Toyota',
    model: 'Coaster',
    year: 2019,
    color: 'White',
    vehicleType: VehicleType.BUS,
    fuelType: FuelType.DIESEL,
  },
  {
    plateNumber: 'AA-56789',
    make: 'Isuzu',
    model: 'NPR',
    year: 2021,
    color: 'Blue',
    vehicleType: VehicleType.TRUCK,
    fuelType: FuelType.DIESEL,
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // ── Permissions ──────────────────────────────────────────────────────────

    const permissions = [];
    for (const def of PERMISSION_DEFS) {
      permissions.push(
        await prisma.permission.upsert({
          where: {
            module_action: { module: def.module, action: def.action },
          },
          update: { description: def.description },
          create: { ...def },
        }),
      );
    }

    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const roles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
    });

    const editRoles = new Set(['HR Officer', 'System Administrator']);

    for (const role of roles) {
      const isEditRole = editRoles.has(role.name);
      for (const permission of permissions) {
        const isEditPerm = permission.action === 'edit';
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {
            canView: true,
            canCreate: true,
            canEdit: isEditRole || !isEditPerm,
            canDelete: isEditRole,
            canApprove: isEditRole,
            canExport: isEditRole,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            canView: true,
            canCreate: true,
            canEdit: isEditRole || !isEditPerm,
            canDelete: isEditRole,
            canApprove: isEditRole,
            canExport: isEditRole,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    console.log(
      `Vehicle permissions seeded for ${roles.length} role(s) (${permissions.length} permissions)`,
    );

    // ── Sample vehicles ──────────────────────────────────────────────────────

    const actor = await prisma.user.findFirst({
      where: {
        companyId: company.id,
        deletedAt: null,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!actor) {
      throw new Error('No user found to seed vehicles');
    }

    let vehiclesCreated = 0;
    for (const v of SAMPLE_VEHICLES) {
      const existing = await prisma.companyVehicle.findFirst({
        where: {
          companyId: company.id,
          plateNumber: v.plateNumber,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.companyVehicle.create({
          data: {
            id: randomUUID(),
            companyId: company.id,
            plateNumber: v.plateNumber,
            make: v.make,
            model: v.model,
            year: v.year,
            color: v.color,
            vehicleType: v.vehicleType,
            fuelType: v.fuelType,
            isActive: true,
            status: VehicleStatus.AVAILABLE,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        });
        vehiclesCreated++;
      }
    }

    console.log(
      `Sample vehicles: ${vehiclesCreated} created, ${SAMPLE_VEHICLES.length - vehiclesCreated} already existed`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
