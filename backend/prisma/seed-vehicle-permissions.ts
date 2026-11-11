/**
 * Upserts vehicle-related permissions and grants them to roles.
 * Also seeds 5 sample company vehicles.
 * Usage: npx ts-node --transpile-only prisma/seed-vehicle-permissions.ts
 */
import { PrismaClient, VehicleStatus, VehicleType, FuelType } from '@prisma/client';
import { randomUUID } from 'crypto';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

// vehicles.* — flat grant to all roles (unchanged)
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
] as const;

// vehicle-application.* and vehicle-refueling.* — role-differentiated grants
type Flags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
};

const viewOnly: Flags = { canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };
const viewCreate: Flags = { canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false, canExport: false };
const manage: Flags = { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false };

const VA_GRANTS: Array<{ module: string; action: string; roles: string[]; flags: Flags }> = [
  {
    module: 'vehicle-application', action: 'view',
    roles: [
      'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
      'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
      'Managing Director', 'System Administrator',
    ],
    flags: viewOnly,
  },
  {
    module: 'vehicle-application', action: 'create',
    roles: [
      'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
      'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
      'Managing Director', 'System Administrator',
    ],
    flags: viewCreate,
  },
  {
    module: 'vehicle-application', action: 'manage',
    roles: ['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator'],
    flags: manage,
  },
];

const VR_GRANTS: Array<{ module: string; action: string; roles: string[]; flags: Flags }> = [
  {
    module: 'vehicle-refueling', action: 'view',
    roles: [
      'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
      'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
      'Managing Director', 'System Administrator',
    ],
    flags: viewOnly,
  },
  {
    module: 'vehicle-refueling', action: 'create',
    roles: [
      'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
      'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
      'Managing Director', 'System Administrator',
    ],
    flags: viewCreate,
  },
  {
    module: 'vehicle-refueling', action: 'manage',
    roles: ['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator'],
    flags: manage,
  },
];

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
    // ── Flat permissions (vehicles.*) ────────────────────────────────────────

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

    const editRoles = new Set(['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator']);

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

    // ── Vehicle-application grants (role-differentiated) ─────────────────────

    const allVaRoleNames = [...new Set(VA_GRANTS.flatMap((g) => g.roles))];
    const vaRoles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null, name: { in: allVaRoleNames } },
      select: { id: true, name: true },
    });
    const roleMap = new Map(vaRoles.map((r) => [r.name, r.id]));

    for (const { module, action, roles: grantRoles, flags } of VA_GRANTS) {
      const perm = await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action, description: `${action} vehicle applications` },
        select: { id: true },
      });
      for (const roleName of grantRoles) {
        const roleId = roleMap.get(roleName);
        if (!roleId) {
          console.warn(`Role not found: ${roleName}`);
          continue;
        }
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: perm.id } },
          update: { ...flags, deletedAt: null, deletedBy: null, updatedBy: SYSTEM_USER_ID },
          create: { roleId, permissionId: perm.id, ...flags, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
        });
      }
    }

    console.log(`Vehicle application permissions seeded for ${vaRoles.length} role(s): ${vaRoles.map((r) => r.name).join(', ')}`);

    // ── Vehicle-refueling grants (role-differentiated) ────────────────────────

    const allVrRoleNames = [...new Set(VR_GRANTS.flatMap((g) => g.roles))];
    const vrRoles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null, name: { in: allVrRoleNames } },
      select: { id: true, name: true },
    });
    const vrRoleMap = new Map(vrRoles.map((r) => [r.name, r.id]));

    for (const { module, action, roles: grantRoles, flags } of VR_GRANTS) {
      const perm = await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action, description: `${action} vehicle refueling requests` },
        select: { id: true },
      });
      for (const roleName of grantRoles) {
        const roleId = vrRoleMap.get(roleName);
        if (!roleId) {
          console.warn(`Role not found: ${roleName}`);
          continue;
        }
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: perm.id } },
          update: { ...flags, deletedAt: null, deletedBy: null, updatedBy: SYSTEM_USER_ID },
          create: { roleId, permissionId: perm.id, ...flags, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
        });
      }
    }

    console.log(`Vehicle refueling permissions seeded for ${vrRoles.length} role(s): ${vrRoles.map((r) => r.name).join(', ')}`);

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
