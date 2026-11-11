/**
 * Wipes and reseeds consumables requisitions, vehicle applications, and
 * vehicle refueling requests (10 each) with 1-tier HR Officer approval chains.
 *
 * Prerequisites:
 * - HR users (Wei Chen, Xiaoming Li, Jinxia, David Wu)
 * - Approval categories CONSUMABLES_REQUISITION, VEHICLE_APPLICATION, VEHICLE_REFUELING
 * - Company vehicles seeded (run seed-vehicle-permissions.ts first)
 *
 * Run: npx ts-node --transpile-only prisma/seeds/hr-vehicles-consumables.seed.ts
 */
import { randomUUID } from 'crypto';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  ConsumablesRequisitionStatus,
  DriveType,
  FuelType,
  PrismaClient,
  User,
  VehicleApplicationStatus,
  VehicleRefuelingStatus,
  VehicleStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

type HrRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

const CATEGORY_CODES = [
  'CONSUMABLES_REQUISITION',
  'VEHICLE_APPLICATION',
  'VEHICLE_REFUELING',
] as const;

interface ConsumablesItemDraft {
  itemName: string;
  itemCode: string;
  description: string;
  quantity: number;
  unit: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Approval helper - 1-tier HR Officer chain
// ────────────────────────────────────────────────────────────────────────────

async function createHrOnlyApprovalChain(
  employeeId: string,
  categoryCode: string,
  title: string,
  status: HrRequestStatus,
  companyId: string,
  hrOfficerId: string,
): Promise<{ id: string }> {
  const category = await prisma.approvalCategory.findFirst({
    where: { code: categoryCode, companyId },
  });
  if (!category) {
    throw new Error(
      `Approval category "${categoryCode}" not found for company ${companyId}`,
    );
  }

  const seq = await prisma.$queryRaw<
    Array<{ nextval: bigint | number }>
  >`SELECT nextval('approval_request_number_seq') as nextval`;
  const requestNumber = `${category.numberPrefix}-${String(
    Number(seq[0]?.nextval ?? 1),
  ).padStart(4, '0')}`;

  const tierDecision =
    status === 'APPROVED'
      ? ApprovalTierDecision.APPROVED
      : status === 'REJECTED'
        ? ApprovalTierDecision.REJECTED
        : status === 'RETURNED'
          ? ApprovalTierDecision.RETURNED
          : ApprovalTierDecision.PENDING;

  const approvalStatus = status as ApprovalRequestStatus;

  return prisma.approvalRequest.create({
    data: {
      id: randomUUID(),
      companyId,
      categoryId: category.id,
      requestNumber,
      title,
      status: approvalStatus,
      requestedBy: employeeId,
      currentTier: 1,
      submittedAt: new Date(),
      completedAt: ['APPROVED', 'REJECTED'].includes(status)
        ? new Date()
        : null,
      createdBy: employeeId,
      updatedBy: employeeId,
      tiers: {
        create: [
          {
            id: randomUUID(),
            tierOrder: 1,
            label: 'HR Officer',
            approverId: hrOfficerId,
            resolver: 'ROLE:HR Officer',
            decision: tierDecision,
            comment:
              tierDecision === ApprovalTierDecision.APPROVED
                ? 'Approved.'
                : tierDecision === ApprovalTierDecision.REJECTED
                  ? 'Request not approved.'
                  : tierDecision === ApprovalTierDecision.RETURNED
                    ? 'Please provide additional details.'
                    : null,
            decidedAt:
              tierDecision !== ApprovalTierDecision.PENDING
                ? new Date()
                : null,
          },
        ],
      },
    },
    select: { id: true },
  });
}

async function nextSequence(sequenceName: string): Promise<number> {
  const seq = await prisma.$queryRawUnsafe<
    Array<{ nextval: bigint | number }>
  >(`SELECT nextval('${sequenceName}') as nextval`);
  return Number(seq[0]?.nextval ?? 1);
}

// ────────────────────────────────────────────────────────────────────────────
// Wipe
// ────────────────────────────────────────────────────────────────────────────

async function wipeVehiclesConsumables(companyId: string): Promise<void> {
  console.log('Wiping existing consumables + vehicle sample data...');

  const categoryScope = {
    category: {
      companyId,
      code: { in: [...CATEGORY_CODES] },
    },
  };

  // Domain rows first (they FK to approval_request).
  await prisma.consumablesRequisitionItem.deleteMany({
    where: { requisition: { companyId } },
  });
  await prisma.consumablesRequisition.deleteMany({ where: { companyId } });
  await prisma.vehicleApplication.deleteMany({ where: { companyId } });
  await prisma.vehicleRefueling.deleteMany({ where: { companyId } });

  await prisma.approvalResponse.deleteMany({
    where: { request: categoryScope },
  });
  await prisma.approvalComment.deleteMany({
    where: { request: categoryScope },
  });
  await prisma.approvalTier.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalRequest.deleteMany({ where: categoryScope });

  await prisma.companyVehicle.updateMany({
    where: { companyId },
    data: { status: VehicleStatus.AVAILABLE },
  });

  console.log('Wipe complete.');
}

// ────────────────────────────────────────────────────────────────────────────
// Consumables
// ────────────────────────────────────────────────────────────────────────────

async function seedConsumables(
  companyId: string,
  hrOfficerId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
): Promise<void> {
  console.log('Seeding consumables requisitions...');

  const consumablesData: Array<{
    employee: User;
    title: string;
    purpose: string;
    department: string;
    requiredByDate: string;
    status: HrRequestStatus;
    items: ConsumablesItemDraft[];
  }> = [
    {
      employee: weiChen,
      title: 'Engineering Office Supplies - August 2026',
      purpose:
        'Monthly replenishment of stationery for engineering department.',
      department: 'Structural Engineering',
      requiredByDate: '2026-08-10',
      status: 'APPROVED',
      items: [
        {
          itemName: 'A4 Paper',
          itemCode: 'PPR-A4-80G',
          description: '80gsm copy paper',
          quantity: 5,
          unit: 'Ream',
        },
        {
          itemName: 'Ballpoint Pens Blue',
          itemCode: 'PEN-BP-BLU',
          description: 'Pack of 12',
          quantity: 3,
          unit: 'Pack',
        },
        {
          itemName: 'Correction Fluid',
          itemCode: 'COR-FLD-001',
          description: 'White correction fluid',
          quantity: 5,
          unit: 'Pcs',
        },
        {
          itemName: 'Stapler',
          itemCode: 'STP-STD-001',
          description: 'Standard desktop stapler',
          quantity: 2,
          unit: 'Pcs',
        },
      ],
    },
    {
      employee: weiChen,
      title: 'Cleaning Supplies - Engineering Floor',
      purpose: 'Cleaning materials for engineering office area.',
      department: 'Structural Engineering',
      requiredByDate: '2026-08-15',
      status: 'IN_REVIEW',
      items: [
        {
          itemName: 'Hand Sanitizer 500ml',
          itemCode: 'SAN-HND-500',
          description: 'Alcohol-based sanitizer',
          quantity: 10,
          unit: 'Bottle',
        },
        {
          itemName: 'Tissue Box',
          itemCode: 'TSU-BOX-001',
          description: 'Facial tissue 200 sheets',
          quantity: 10,
          unit: 'Box',
        },
        {
          itemName: 'Cleaning Cloth',
          itemCode: 'CLN-CLT-001',
          description: 'Microfiber cleaning cloth',
          quantity: 20,
          unit: 'Pcs',
        },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Whiteboard Supplies - Meeting Room',
      purpose: 'Whiteboard markers and erasers for engineering meeting room.',
      department: 'Engineering Management',
      requiredByDate: '2026-08-08',
      status: 'APPROVED',
      items: [
        {
          itemName: 'Whiteboard Marker Black',
          itemCode: 'MRK-WB-BLK',
          description: 'Dry erase markers',
          quantity: 10,
          unit: 'Pcs',
        },
        {
          itemName: 'Whiteboard Marker Red',
          itemCode: 'MRK-WB-RED',
          description: 'Dry erase markers',
          quantity: 5,
          unit: 'Pcs',
        },
        {
          itemName: 'Whiteboard Eraser',
          itemCode: 'ERS-WB-001',
          description: 'Felt whiteboard eraser',
          quantity: 3,
          unit: 'Pcs',
        },
        {
          itemName: 'Whiteboard Cleaner',
          itemCode: 'CLN-WB-001',
          description: 'Spray cleaner 500ml',
          quantity: 2,
          unit: 'Bottle',
        },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Printer Consumables - Department Printer',
      purpose: 'Toner and paper for department laser printer.',
      department: 'Engineering Management',
      requiredByDate: '2026-09-01',
      status: 'SUBMITTED',
      items: [
        {
          itemName: 'Laser Toner Cartridge',
          itemCode: 'TNR-LSR-BLK',
          description: 'Black toner compatible',
          quantity: 2,
          unit: 'Pcs',
        },
        {
          itemName: 'A4 Paper 80gsm',
          itemCode: 'PPR-A4-80G',
          description: 'Copy paper 500 sheets',
          quantity: 10,
          unit: 'Ream',
        },
      ],
    },
    {
      employee: otherEmployees[0]!,
      title: 'Site Office Consumables - Hawassa',
      purpose: 'Consumables for site office at Hawassa project.',
      department: 'Site Management',
      requiredByDate: '2026-08-18',
      status: 'APPROVED',
      items: [
        {
          itemName: 'Notebook A4',
          itemCode: 'NTB-A4-001',
          description: 'Hard cover notebook 200 pages',
          quantity: 10,
          unit: 'Pcs',
        },
        {
          itemName: 'Permanent Marker Black',
          itemCode: 'MRK-PRM-BLK',
          description: 'Waterproof permanent marker',
          quantity: 10,
          unit: 'Pcs',
        },
        {
          itemName: 'Masking Tape 25mm',
          itemCode: 'TPE-MSK-025',
          description: 'Crepe paper masking tape',
          quantity: 10,
          unit: 'Roll',
        },
        {
          itemName: 'Cable Ties 150mm',
          itemCode: 'CTI-150-WHT',
          description: 'White nylon cable ties pack 100',
          quantity: 5,
          unit: 'Pack',
        },
      ],
    },
    {
      employee: otherEmployees[0]!,
      title: 'Safety Consumables - Site Team',
      purpose: 'Disposable safety items for site team weekly use.',
      department: 'Site Management',
      requiredByDate: '2026-08-20',
      status: 'RETURNED',
      items: [
        {
          itemName: 'Disposable Gloves M',
          itemCode: 'GLV-DSP-M',
          description: 'Nitrile disposable gloves box 100',
          quantity: 5,
          unit: 'Box',
        },
        {
          itemName: 'Dust Mask FFP1',
          itemCode: 'MSK-FFP1-001',
          description: 'Disposable dust masks box 50',
          quantity: 3,
          unit: 'Box',
        },
      ],
    },
    {
      employee: otherEmployees[1]!,
      title: 'Computer Accessories',
      purpose: 'Replacement mouse and keyboard for damaged equipment.',
      department: 'Civil Engineering',
      requiredByDate: '2026-08-12',
      status: 'APPROVED',
      items: [
        {
          itemName: 'USB Mouse',
          itemCode: 'MOU-USB-001',
          description: 'Wired USB optical mouse',
          quantity: 3,
          unit: 'Pcs',
        },
        {
          itemName: 'USB Keyboard',
          itemCode: 'KBD-USB-001',
          description: 'Standard wired USB keyboard',
          quantity: 2,
          unit: 'Pcs',
        },
        {
          itemName: 'USB Hub 4 Port',
          itemCode: 'HUB-USB-4P',
          description: '4 port USB 3.0 hub',
          quantity: 2,
          unit: 'Pcs',
        },
      ],
    },
    {
      employee: otherEmployees[1]!,
      title: 'Drawing Supplies Replenishment',
      purpose: 'Pencils, erasers and drawing aids for design work.',
      department: 'Civil Engineering',
      requiredByDate: '2026-08-25',
      status: 'SUBMITTED',
      items: [
        {
          itemName: 'Mechanical Pencil 0.5mm',
          itemCode: 'PNC-MEC-05',
          description: 'Drafting mechanical pencil',
          quantity: 10,
          unit: 'Pcs',
        },
        {
          itemName: 'Pencil Lead 0.5mm HB',
          itemCode: 'LED-05-HB',
          description: 'Refill leads pack 12',
          quantity: 10,
          unit: 'Pack',
        },
        {
          itemName: 'Eraser Vinyl',
          itemCode: 'ERS-VNL-001',
          description: 'White vinyl eraser',
          quantity: 20,
          unit: 'Pcs',
        },
        {
          itemName: 'Set Square 45°',
          itemCode: 'SQR-45-001',
          description: '300mm set square',
          quantity: 5,
          unit: 'Pcs',
        },
      ],
    },
    {
      employee: otherEmployees[2]!,
      title: 'First Aid Supplies - Office',
      purpose: 'Replenishment of office first aid kit.',
      department: 'HSE',
      requiredByDate: '2026-08-05',
      status: 'APPROVED',
      items: [
        {
          itemName: 'Adhesive Bandages Assorted',
          itemCode: 'FAK-BND-AST',
          description: 'Box of 100 assorted sizes',
          quantity: 3,
          unit: 'Box',
        },
        {
          itemName: 'Antiseptic Wipes',
          itemCode: 'FAK-ANT-WIP',
          description: 'Individually wrapped wipes box 100',
          quantity: 2,
          unit: 'Box',
        },
        {
          itemName: 'Paracetamol 500mg',
          itemCode: 'FAK-PCM-500',
          description: 'Tablets pack 16',
          quantity: 5,
          unit: 'Pack',
        },
      ],
    },
    {
      employee: otherEmployees[3]!,
      title: 'Archive Supplies - Document Room',
      purpose: 'Filing and archiving materials for project documents.',
      department: 'Document Control',
      requiredByDate: '2026-09-05',
      status: 'REJECTED',
      items: [
        {
          itemName: 'Arch Lever File A4',
          itemCode: 'FLE-ALV-A4',
          description: '75mm spine arch lever file',
          quantity: 20,
          unit: 'Pcs',
        },
        {
          itemName: 'File Dividers A4',
          itemCode: 'DIV-A4-001',
          description: 'A4 tabbed dividers pack 10',
          quantity: 10,
          unit: 'Pack',
        },
        {
          itemName: 'Label Stickers A4',
          itemCode: 'LBL-A4-001',
          description: 'Self adhesive labels sheet A4',
          quantity: 5,
          unit: 'Pack',
        },
        {
          itemName: 'Hanging Files',
          itemCode: 'FLE-HNG-001',
          description: 'Suspension files box 25',
          quantity: 3,
          unit: 'Box',
        },
      ],
    },
  ];

  for (const req of consumablesData) {
    const approvalRequest = await createHrOnlyApprovalChain(
      req.employee.id,
      'CONSUMABLES_REQUISITION',
      req.title,
      req.status,
      companyId,
      hrOfficerId,
    );

    const requestNumber = `CR-${String(
      await nextSequence('consumables_requisition_number_seq'),
    ).padStart(4, '0')}`;

    await prisma.consumablesRequisition.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId: req.employee.id,
        title: req.title,
        purpose: req.purpose,
        department: req.department,
        requiredByDate: new Date(req.requiredByDate),
        declarationConfirmed: true,
        status: req.status as ConsumablesRequisitionStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(req.status)
          ? new Date()
          : null,
        createdBy: req.employee.id,
        updatedBy: req.employee.id,
        items: {
          create: req.items.map((item) => ({
            id: randomUUID(),
            itemName: item.itemName,
            itemCode: item.itemCode,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
          })),
        },
      },
    });

    console.log(
      `✓ CR ${requestNumber} - ${req.title} - ${req.items.length} items - ${req.status}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Vehicle applications
// ────────────────────────────────────────────────────────────────────────────

async function seedVehicleApplications(
  companyId: string,
  hrOfficerId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
  vehicles: Array<{
    id: string;
    plateNumber: string;
    assignedDriverId: string | null;
  }>,
  fallbackDriverId: string | null,
): Promise<void> {
  console.log('Seeding vehicle applications...');

  const vehicleApps: Array<{
    employee: User;
    vehicleIndex: number;
    driveType: DriveType;
    departureDateTime: string;
    returnDateTime: string;
    destination: string;
    purpose: string;
    passengerCount: number;
    passengerNames: string;
    status: HrRequestStatus;
  }> = [
    {
      employee: weiChen,
      vehicleIndex: 0,
      driveType: DriveType.COMPANY_DRIVER,
      departureDateTime: '2026-08-10T08:00:00',
      returnDateTime: '2026-08-12T18:00:00',
      destination: 'Hawassa',
      purpose: 'Site inspection for structural works phase 2',
      passengerCount: 3,
      passengerNames: 'Wei Chen, Xiaoming Li, Ahmed Hassan',
      status: 'APPROVED',
    },
    {
      employee: weiChen,
      vehicleIndex: 1,
      driveType: DriveType.SELF_DRIVE,
      departureDateTime: '2026-08-20T07:00:00',
      returnDateTime: '2026-08-20T18:00:00',
      destination: 'Adama',
      purpose: 'Client meeting for project coordination',
      passengerCount: 2,
      passengerNames: 'Wei Chen, Project Manager',
      status: 'IN_REVIEW',
    },
    {
      employee: xiaomingLi,
      vehicleIndex: 2,
      driveType: DriveType.COMPANY_DRIVER,
      departureDateTime: '2026-08-15T06:30:00',
      returnDateTime: '2026-08-17T20:00:00',
      destination: 'Bahir Dar',
      purpose: 'Project progress review and site inspection',
      passengerCount: 6,
      passengerNames:
        'Xiaoming Li, Wei Chen, Ahmed Hassan, Sara Tesfaye, John Mulu, Abebe Girma',
      status: 'APPROVED',
    },
    {
      employee: xiaomingLi,
      vehicleIndex: 0,
      driveType: DriveType.COMPANY_DRIVER,
      departureDateTime: '2026-09-05T08:00:00',
      returnDateTime: '2026-09-07T18:00:00',
      destination: 'Gondar',
      purpose: 'Technical assessment for new project',
      passengerCount: 4,
      passengerNames:
        'Xiaoming Li, Site Engineer 1, Site Engineer 2, Surveyor',
      status: 'SUBMITTED',
    },
    {
      employee: otherEmployees[0]!,
      vehicleIndex: 3,
      driveType: DriveType.COMPANY_DRIVER,
      departureDateTime: '2026-08-22T07:00:00',
      returnDateTime: '2026-08-22T19:00:00',
      destination: 'Debre Berhan',
      purpose: 'Team site visit for foundation inspection',
      passengerCount: 12,
      passengerNames: 'Full site inspection team',
      status: 'APPROVED',
    },
    {
      employee: otherEmployees[0]!,
      vehicleIndex: 1,
      driveType: DriveType.SELF_DRIVE,
      departureDateTime: '2026-09-10T08:00:00',
      returnDateTime: '2026-09-10T17:00:00',
      destination: 'Sendafa',
      purpose: 'Survey for potential project site',
      passengerCount: 2,
      passengerNames: 'Engineer and Surveyor',
      status: 'RETURNED',
    },
    {
      employee: otherEmployees[1]!,
      vehicleIndex: 4,
      driveType: DriveType.COMPANY_DRIVER,
      departureDateTime: '2026-08-18T06:00:00',
      returnDateTime: '2026-08-18T20:00:00',
      destination: 'Main Warehouse to Hawassa Site',
      purpose: 'Material delivery to project site',
      passengerCount: 2,
      passengerNames: 'Driver and Site Storekeeper',
      status: 'APPROVED',
    },
    {
      employee: otherEmployees[1]!,
      vehicleIndex: 2,
      driveType: DriveType.COMPANY_DRIVER,
      departureDateTime: '2026-09-15T07:30:00',
      returnDateTime: '2026-09-16T18:00:00',
      destination: 'Jimma',
      purpose: 'Feasibility study site visit',
      passengerCount: 5,
      passengerNames: 'Project team members',
      status: 'SUBMITTED',
    },
    {
      employee: otherEmployees[2]!,
      vehicleIndex: 0,
      driveType: DriveType.COMPANY_DRIVER,
      departureDateTime: '2026-08-25T07:00:00',
      returnDateTime: '2026-08-27T19:00:00',
      destination: 'Mekelle',
      purpose: 'Northern region project assessment',
      passengerCount: 3,
      passengerNames: 'Assessment team',
      status: 'REJECTED',
    },
    {
      employee: otherEmployees[3]!,
      vehicleIndex: 1,
      driveType: DriveType.SELF_DRIVE,
      departureDateTime: '2026-08-28T08:00:00',
      returnDateTime: '2026-08-28T17:00:00',
      destination: 'Lebu Industrial Area',
      purpose: 'Supplier visit for equipment inspection',
      passengerCount: 1,
      passengerNames: 'Self',
      status: 'IN_REVIEW',
    },
  ];

  for (const app of vehicleApps) {
    const vehicle = vehicles[app.vehicleIndex % vehicles.length]!;

    const approvalRequest = await createHrOnlyApprovalChain(
      app.employee.id,
      'VEHICLE_APPLICATION',
      `Vehicle request - ${app.destination} (${app.departureDateTime.split('T')[0]})`,
      app.status,
      companyId,
      hrOfficerId,
    );

    const applicationNumber = `VA-${String(
      await nextSequence('vehicle_application_number_seq'),
    ).padStart(4, '0')}`;

    const driverId =
      app.driveType === DriveType.COMPANY_DRIVER
        ? (vehicle.assignedDriverId ?? fallbackDriverId)
        : null;

    await prisma.vehicleApplication.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationNumber,
        employeeId: app.employee.id,
        vehicleId: vehicle.id,
        driveType: app.driveType,
        driverId,
        departureDatetime: new Date(app.departureDateTime),
        returnDatetime: new Date(app.returnDateTime),
        destination: app.destination,
        purpose: app.purpose,
        passengerCount: app.passengerCount,
        passengerNames: app.passengerNames,
        status: app.status as VehicleApplicationStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(app.status)
          ? new Date()
          : null,
        createdBy: app.employee.id,
        updatedBy: app.employee.id,
      },
    });

    if (app.status === 'APPROVED') {
      await prisma.companyVehicle.update({
        where: { id: vehicle.id },
        data: { status: VehicleStatus.APPROVED },
      });
    }

    console.log(
      `✓ VA ${applicationNumber} - ${app.destination} - ${vehicle.plateNumber} - ${app.status}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Vehicle refueling
// ────────────────────────────────────────────────────────────────────────────

async function seedVehicleRefueling(
  companyId: string,
  hrOfficerId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
  vehicles: Array<{
    id: string;
    plateNumber: string;
    fuelType: FuelType;
    assignedDriverId: string | null;
  }>,
  fallbackDriverId: string | null,
): Promise<void> {
  console.log('Seeding vehicle refueling requests...');

  const refuelingData: Array<{
    employee: User;
    vehicleIndex: number;
    fuelDate: string;
    fuelStation: string;
    currentMileage: number;
    requestedLitres: number;
    unitPriceEtb: number;
    totalCostEtb: number;
    status: HrRequestStatus;
  }> = [
    {
      employee: weiChen,
      vehicleIndex: 0,
      fuelDate: '2026-08-10',
      fuelStation: 'NOC Petrol Station - Bole Road',
      currentMileage: 45230,
      requestedLitres: 60,
      unitPriceEtb: 60,
      totalCostEtb: 3600,
      status: 'APPROVED',
    },
    {
      employee: weiChen,
      vehicleIndex: 1,
      fuelDate: '2026-08-20',
      fuelStation: 'Total Energies - Meskel Square',
      currentMileage: 32100,
      requestedLitres: 45,
      unitPriceEtb: 60,
      totalCostEtb: 2700,
      status: 'SUBMITTED',
    },
    {
      employee: xiaomingLi,
      vehicleIndex: 2,
      fuelDate: '2026-08-15',
      fuelStation: 'Oromo Oil - Megenagna',
      currentMileage: 28500,
      requestedLitres: 80,
      unitPriceEtb: 60,
      totalCostEtb: 4800,
      status: 'APPROVED',
    },
    {
      employee: xiaomingLi,
      vehicleIndex: 0,
      fuelDate: '2026-08-28',
      fuelStation: 'NOC Petrol Station - CMC Road',
      currentMileage: 45890,
      requestedLitres: 65,
      unitPriceEtb: 60,
      totalCostEtb: 3900,
      status: 'IN_REVIEW',
    },
    {
      employee: otherEmployees[0]!,
      vehicleIndex: 3,
      fuelDate: '2026-08-22',
      fuelStation: 'Total Energies - Sarbet',
      currentMileage: 62400,
      requestedLitres: 120,
      unitPriceEtb: 60,
      totalCostEtb: 7200,
      status: 'APPROVED',
    },
    {
      employee: otherEmployees[0]!,
      vehicleIndex: 4,
      fuelDate: '2026-08-18',
      fuelStation: 'Oromo Oil - Kality',
      currentMileage: 89200,
      requestedLitres: 100,
      unitPriceEtb: 60,
      totalCostEtb: 6000,
      status: 'APPROVED',
    },
    {
      employee: otherEmployees[1]!,
      vehicleIndex: 1,
      fuelDate: '2026-08-25',
      fuelStation: 'NOC Petrol Station - Kazanchis',
      currentMileage: 31800,
      requestedLitres: 50,
      unitPriceEtb: 60,
      totalCostEtb: 3000,
      status: 'RETURNED',
    },
    {
      employee: otherEmployees[1]!,
      vehicleIndex: 2,
      fuelDate: '2026-09-05',
      fuelStation: 'Total Energies - Lideta',
      currentMileage: 29100,
      requestedLitres: 75,
      unitPriceEtb: 60,
      totalCostEtb: 4500,
      status: 'SUBMITTED',
    },
    {
      employee: otherEmployees[2]!,
      vehicleIndex: 0,
      fuelDate: '2026-08-12',
      fuelStation: 'Oromo Oil - Ayer Tena',
      currentMileage: 44750,
      requestedLitres: 55,
      unitPriceEtb: 60,
      totalCostEtb: 3300,
      status: 'REJECTED',
    },
    {
      employee: otherEmployees[3]!,
      vehicleIndex: 1,
      fuelDate: '2026-09-01',
      fuelStation: 'NOC Petrol Station - Gotera',
      currentMileage: 32500,
      requestedLitres: 40,
      unitPriceEtb: 60,
      totalCostEtb: 2400,
      status: 'APPROVED',
    },
  ];

  for (const ref of refuelingData) {
    const vehicle = vehicles[ref.vehicleIndex % vehicles.length]!;

    const approvalRequest = await createHrOnlyApprovalChain(
      ref.employee.id,
      'VEHICLE_REFUELING',
      `Fuel request - ${vehicle.plateNumber} - ${ref.fuelDate}`,
      ref.status,
      companyId,
      hrOfficerId,
    );

    const requestNumber = `VR-${String(
      await nextSequence('vehicle_refueling_number_seq'),
    ).padStart(4, '0')}`;

    await prisma.vehicleRefueling.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId: ref.employee.id,
        vehicleId: vehicle.id,
        driverId: vehicle.assignedDriverId ?? fallbackDriverId,
        fuelDate: new Date(ref.fuelDate),
        fuelType: vehicle.fuelType,
        fuelStation: ref.fuelStation,
        currentMileage: ref.currentMileage,
        requestedLitres: ref.requestedLitres,
        unitPriceEtb: ref.unitPriceEtb,
        totalCostEtb: ref.totalCostEtb,
        status: ref.status as VehicleRefuelingStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(ref.status)
          ? new Date()
          : null,
        createdBy: ref.employee.id,
        updatedBy: ref.employee.id,
      },
    });

    console.log(
      `✓ VR ${requestNumber} - ${vehicle.plateNumber} - ${ref.requestedLitres}L - ETB ${ref.totalCostEtb} - ${ref.status}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Starting consumables + vehicle applications + refueling seed...');

  const weiChen = await prisma.user.findFirst({
    where: {
      firstName: { contains: 'Wei', mode: 'insensitive' },
      lastName: { contains: 'Chen', mode: 'insensitive' },
    },
    include: { engineeringDiscipline: { include: { leader: true } } },
  });
  if (!weiChen) throw new Error('Wei Chen not found');

  const xiaomingLi = await prisma.user.findFirst({
    where: { firstName: { contains: 'Xiaoming', mode: 'insensitive' } },
  });
  if (!xiaomingLi) throw new Error('Xiaoming Li not found');

  const jinxia = await prisma.user.findFirst({
    where: { firstName: { contains: 'Jinxia', mode: 'insensitive' } },
  });
  if (!jinxia) throw new Error('Jinxia not found');

  const davidWu = await prisma.user.findFirst({
    where: {
      firstName: { contains: 'David', mode: 'insensitive' },
      lastName: { contains: 'Wu', mode: 'insensitive' },
    },
  });
  if (!davidWu) throw new Error('David Wu not found');

  const companyId = weiChen.companyId;

  const otherEmployees = await prisma.user.findMany({
    where: {
      companyId,
      deletedAt: null,
      isActive: true,
      id: { notIn: [weiChen.id, xiaomingLi.id, jinxia.id, davidWu.id] },
      engineeringDisciplineId: { not: null },
    },
    take: 4,
  });
  if (otherEmployees.length < 4) {
    throw new Error(
      `Need at least 4 other employees with an engineering discipline assigned, found ${otherEmployees.length}`,
    );
  }

  const vehicles = await prisma.companyVehicle.findMany({
    where: { companyId, isActive: true, deletedAt: null },
    orderBy: { plateNumber: 'asc' },
    select: {
      id: true,
      plateNumber: true,
      fuelType: true,
      assignedDriverId: true,
    },
  });
  if (vehicles.length === 0) {
    throw new Error('No vehicles found - run vehicle seed first');
  }

  const fallbackDriver = await prisma.user.findFirst({
    where: {
      companyId,
      deletedAt: null,
      isActive: true,
      position: { is: { title: { contains: 'Driver', mode: 'insensitive' } } },
    },
    select: { id: true },
  });

  await wipeVehiclesConsumables(companyId);
  await seedConsumables(
    companyId,
    jinxia.id,
    weiChen,
    xiaomingLi,
    otherEmployees,
  );
  await seedVehicleApplications(
    companyId,
    jinxia.id,
    weiChen,
    xiaomingLi,
    otherEmployees,
    vehicles,
    fallbackDriver?.id ?? null,
  );
  await seedVehicleRefueling(
    companyId,
    jinxia.id,
    weiChen,
    xiaomingLi,
    otherEmployees,
    vehicles,
    fallbackDriver?.id ?? null,
  );

  console.log('\n✓ Consumables + Vehicle seed complete');
  console.log('  Consumables Requisitions: 10');
  console.log('  Vehicle Applications:     10');
  console.log('  Vehicle Refueling:        10');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
