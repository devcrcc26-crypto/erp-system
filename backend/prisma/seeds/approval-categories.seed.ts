import { Prisma, PrismaClient } from '@prisma/client';
import { APPROVAL_CATEGORY_PERMISSION_MODULE } from '../../src/modules/approvals/application/utils/approval-category-permission.util';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'file'
  | 'checkbox'
  | 'currency';

interface FormFieldDef {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
}

interface ApprovalTierSeed {
  label: string;
  resolver: 'ROLE';
  role: string;
  order: number;
}

interface ApprovalRuleSeed {
  name: string;
  when?: Record<string, unknown>;
  tiers: ApprovalTierSeed[];
}

interface CategorySeedDef {
  code: string;
  name: string;
  description: string;
  module: string;
  numberPrefix: string;
  icon: string;
  sortOrder: number;
  /** When false, hidden from New Request and blocked on generic submit. Default true. */
  isUserRequestable?: boolean;
  /** Nest permission.module for create checks. Defaults from APPROVAL_CATEGORY_PERMISSION_MODULE. */
  permissionModule?: string;
  formSchema: { fields: FormFieldDef[] };
  approvalRules: ApprovalRuleSeed[];
}

const tier = (
  label: string,
  role: string,
  order: number,
): ApprovalTierSeed => ({
  label,
  resolver: 'ROLE',
  role,
  order,
});

/**
 * HR approval categories from the requirements list (14 total).
 * Contact Form Registration is intentionally excluded.
 */
const CATEGORIES: CategorySeedDef[] = [
  {
    code: 'LEAVE_REQUEST',
    name: 'Leave Request',
    description: 'Employee requests for annual, sick, or unpaid leave.',
    module: 'HR',
    numberPrefix: 'LR',
    icon: 'CalendarOutlined',
    sortOrder: 10,
    formSchema: {
      fields: [
        {
          name: 'leaveType',
          label: 'Leave Type',
          type: 'select',
          options: ['Annual', 'Sick', 'Unpaid', 'Maternity', 'Paternity'],
          required: true,
        },
        { name: 'startDate', label: 'Start Date', type: 'date', required: true },
        { name: 'endDate', label: 'End Date', type: 'date', required: true },
        {
          name: 'days',
          label: 'Days',
          type: 'number',
          required: true,
        },
        { name: 'reason', label: 'Reason', type: 'textarea', required: false },
      ],
    },
    approvalRules: [
      {
        name: 'Short leave (≤ 3 days)',
        when: { days: { lte: 3 } },
        tiers: [
          tier('Project Manager', 'DEPARTMENT_HEAD', 1),
          tier('HR Officer', 'HR_MANAGER', 2),
        ],
      },
      {
        name: 'Long leave (> 3 days)',
        when: { days: { gt: 3 } },
        tiers: [
          tier('Project Manager', 'DEPARTMENT_HEAD', 1),
          tier('HR Officer', 'HR_MANAGER', 2),
        ],
      },
      {
        name: 'Default',
        tiers: [
          tier('Project Manager', 'DEPARTMENT_HEAD', 1),
          tier('HR Officer', 'HR_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'SITE_ASSIGNMENT',
    name: 'Site Assignment',
    description:
      'Request paid on-site days when working at a project location without HQ scanner coverage. ' +
      'Runtime approval chain (HrApprovalChainService.buildSiteAssignmentApprovalChain): ' +
      'typical employee → Reports to (supervisor); GM, Managing Director, and System Administrator → HR Manager.',
    module: 'HR',
    numberPrefix: 'SA',
    icon: 'EnvironmentOutlined',
    sortOrder: 11,
    formSchema: {
      fields: [
        { name: 'siteName', label: 'Site name', type: 'text', required: true },
        { name: 'projectId', label: 'Project', type: 'text', required: false },
        { name: 'startDate', label: 'Start date', type: 'date', required: true },
        { name: 'endDate', label: 'End date', type: 'date', required: true },
        { name: 'reason', label: 'Reason', type: 'textarea', required: false },
      ],
    },
    approvalRules: [
      {
        name: 'Employee → Reports to',
        tiers: [tier('Reports to', 'EMPLOYEE', 1)],
      },
      {
        name: 'Executive → HR Manager',
        tiers: [tier('HR Manager', 'HR_MANAGER', 1)],
      },
    ],
  },
  {
    code: 'WORK_FROM_HOME',
    name: 'Work From Home',
    description:
      'Employee request to work from home on a specific date. ' +
      'Approval chain is Employee → Reports to (tier 1) → HR Officer (tier 2). ' +
      'Chain changed from single Discipline Lead tier on 2026-10-19 ' +
      '(was: Employee → Discipline Lead only). ' +
      'Runtime chain is built in HrApprovalChainService.buildWorkFromHomeApprovalChain, not from these rules.',
    module: 'HR',
    numberPrefix: 'WFH',
    icon: 'HomeOutlined',
    sortOrder: 12,
    formSchema: {
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true },
      ],
    },
    approvalRules: [
      {
        name: 'Employee → Reports to → HR Officer',
        tiers: [
          tier('Reports to', 'EMPLOYEE', 1),
          tier('HR Officer', 'HR', 2),
        ],
      },
    ],
  },
  {
    code: 'EXPENSE_CLAIM',
    name: 'Expense Claim',
    description: 'Reimbursement claims for travel, meals, and other business expenses.',
    module: 'FINANCE',
    numberPrefix: 'EC',
    icon: 'DollarOutlined',
    sortOrder: 20,
    formSchema: {
      fields: [
        {
          name: 'expenseType',
          label: 'Expense Type',
          type: 'select',
          options: ['Travel', 'Meals', 'Accommodation', 'Other'],
          required: true,
        },
        { name: 'amount', label: 'Amount', type: 'currency', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
        {
          name: 'description',
          label: 'Description',
          type: 'textarea',
          required: true,
        },
        { name: 'receipts', label: 'Receipts', type: 'file', required: false },
      ],
    },
    approvalRules: [
      {
        name: 'Low value (≤ 5,000)',
        when: { amount: { lte: 5000 } },
        tiers: [tier('Department Head', 'DEPARTMENT_HEAD', 1)],
      },
      {
        name: 'High value (> 5,000)',
        when: { amount: { gt: 5000 } },
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Finance Manager', 'FINANCE_MANAGER', 2),
          tier('General Manager', 'GENERAL_MANAGER', 3),
        ],
      },
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Finance Manager', 'FINANCE_MANAGER', 2),
          tier('General Manager', 'GENERAL_MANAGER', 3),
        ],
      },
    ],
  },
  {
    code: 'PURCHASE_REQUEST',
    name: 'Purchase Request',
    description: 'Internal request to purchase materials, equipment, or services.',
    module: 'PROCUREMENT',
    numberPrefix: 'PR',
    icon: 'ShoppingCartOutlined',
    sortOrder: 30,
    formSchema: {
      fields: [
        { name: 'itemName', label: 'Item Name', type: 'text', required: true },
        { name: 'quantity', label: 'Quantity', type: 'number', required: true },
        {
          name: 'estimatedCost',
          label: 'Estimated Cost',
          type: 'currency',
          required: true,
        },
        { name: 'vendor', label: 'Vendor', type: 'text', required: false },
        {
          name: 'justification',
          label: 'Justification',
          type: 'textarea',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Standard (≤ 10,000)',
        when: { estimatedCost: { lte: 10000 } },
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Finance Manager', 'FINANCE_MANAGER', 2),
        ],
      },
      {
        name: 'High value (> 10,000)',
        when: { estimatedCost: { gt: 10000 } },
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Finance Manager', 'FINANCE_MANAGER', 2),
          tier('General Manager', 'GENERAL_MANAGER', 3),
        ],
      },
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Finance Manager', 'FINANCE_MANAGER', 2),
          tier('General Manager', 'GENERAL_MANAGER', 3),
        ],
      },
    ],
  },
  {
    code: 'MATERIAL_REQUISITION',
    name: 'Material Requisition',
    description: 'Request to issue stock materials from warehouse to a project or department.',
    module: 'INVENTORY',
    numberPrefix: 'MR',
    icon: 'InboxOutlined',
    sortOrder: 40,
    formSchema: {
      fields: [
        {
          name: 'materialName',
          label: 'Material Name',
          type: 'text',
          required: true,
        },
        { name: 'quantity', label: 'Quantity', type: 'number', required: true },
        { name: 'unit', label: 'Unit', type: 'text', required: true },
        {
          name: 'warehouseLocation',
          label: 'Warehouse Location',
          type: 'text',
          required: true,
        },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Warehouse Manager', 'WAREHOUSE_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'ASSET_REQUEST',
    name: 'Asset Request',
    description: 'Request for a company asset such as a laptop, phone or office furniture.',
    module: 'INVENTORY',
    numberPrefix: 'ASR',
    icon: 'LaptopOutlined',
    sortOrder: 45,
    isUserRequestable: true,
    permissionModule: 'material-requisition',
    formSchema: {
      fields: [
        {
          name: 'assetCategory',
          label: 'Asset Category',
          type: 'text',
          required: true,
        },
        { name: 'assetType', label: 'Asset Type / Model', type: 'text' },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true },
        { name: 'requiredByDate', label: 'Required By', type: 'date' },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Warehouse Manager', 'WAREHOUSE_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'CONSUMABLES_REQUISITION',
    name: 'Low-Value Consumables Requisition',
    description: 'Request for low-value office or site consumables.',
    module: 'INVENTORY',
    numberPrefix: 'LCR',
    icon: 'ShoppingOutlined',
    sortOrder: 50,
    formSchema: {
      fields: [
        { name: 'itemName', label: 'Item Name', type: 'text', required: true },
        { name: 'quantity', label: 'Quantity', type: 'number', required: true },
        { name: 'unit', label: 'Unit', type: 'text', required: true },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [tier('Department Head', 'DEPARTMENT_HEAD', 1)],
      },
    ],
  },
  {
    code: 'FLIGHT_APPLICATION',
    name: 'Flight Application',
    description: 'Application for business flight bookings and travel authorisation.',
    module: 'HR',
    numberPrefix: 'FA',
    icon: 'RocketOutlined',
    sortOrder: 60,
    formSchema: {
      fields: [
        {
          name: 'destination',
          label: 'Destination',
          type: 'text',
          required: true,
        },
        {
          name: 'departureDate',
          label: 'Departure Date',
          type: 'date',
          required: true,
        },
        {
          name: 'returnDate',
          label: 'Return Date',
          type: 'date',
          required: true,
        },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
        {
          name: 'estimatedCost',
          label: 'Estimated Cost',
          type: 'currency',
          required: true,
        },
        { name: 'airline', label: 'Airline', type: 'text', required: false },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('HR Manager', 'HR_MANAGER', 2),
          tier('General Manager', 'GENERAL_MANAGER', 3),
        ],
      },
    ],
  },
  {
    code: 'BUSINESS_TRIP',
    name: 'Third-Country Business Trip',
    description:
      'Application for official travel to a third country (outside Ethiopia and China). Requires GM approval.',
    module: 'HR',
    numberPrefix: 'BT',
    icon: 'GlobalOutlined',
    sortOrder: 70,
    formSchema: { fields: [] },
    approvalRules: [],
  },
  {
    code: 'VEHICLE_APPLICATION',
    name: 'Vehicle Application',
    description: 'Request to use a company vehicle for official travel.',
    module: 'ADMIN',
    numberPrefix: 'VA',
    icon: 'CarOutlined',
    sortOrder: 75,
    formSchema: {
      fields: [
        {
          name: 'vehicleType',
          label: 'Vehicle Type',
          type: 'text',
          required: true,
        },
        {
          name: 'destination',
          label: 'Destination',
          type: 'text',
          required: true,
        },
        {
          name: 'departureDate',
          label: 'Departure Date',
          type: 'date',
          required: true,
        },
        {
          name: 'returnDate',
          label: 'Return Date',
          type: 'date',
          required: true,
        },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
        {
          name: 'numberOfPassengers',
          label: 'Number of Passengers',
          type: 'number',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Admin Manager', 'ADMIN_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'OFFICIAL_SEAL_USAGE',
    name: 'Official Seal Usage',
    description: 'Request to apply the company official seal to documents.',
    module: 'ADMIN',
    numberPrefix: 'OSU',
    icon: 'SafetyCertificateOutlined',
    sortOrder: 80,
    formSchema: {
      fields: [
        {
          name: 'documentTitle',
          label: 'Document Title',
          type: 'text',
          required: true,
        },
        {
          name: 'documentType',
          label: 'Document Type',
          type: 'text',
          required: true,
        },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
        {
          name: 'dateRequired',
          label: 'Date Required',
          type: 'date',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('General Manager', 'GENERAL_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'PROJECT_SEAL_USAGE',
    name: 'Project Seal Usage',
    description: 'Request to apply a project seal to project documents.',
    module: 'PROJECTS',
    numberPrefix: 'PSU',
    icon: 'FileProtectOutlined',
    sortOrder: 90,
    formSchema: {
      fields: [
        {
          name: 'projectName',
          label: 'Project Name',
          type: 'text',
          required: true,
        },
        {
          name: 'documentTitle',
          label: 'Document Title',
          type: 'text',
          required: true,
        },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
        {
          name: 'dateRequired',
          label: 'Date Required',
          type: 'date',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Project Manager', 'PROJECT_MANAGER', 1),
          tier('General Manager', 'GENERAL_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'VEHICLE_REFUELING',
    name: 'Office Vehicle Refueling',
    description: 'Request to refuel an office or company vehicle.',
    module: 'ADMIN',
    numberPrefix: 'OVR',
    icon: 'ThunderboltOutlined',
    sortOrder: 100,
    formSchema: {
      fields: [
        {
          name: 'vehiclePlate',
          label: 'Vehicle Plate',
          type: 'text',
          required: true,
        },
        {
          name: 'fuelAmount',
          label: 'Fuel Amount',
          type: 'number',
          required: true,
        },
        {
          name: 'fuelType',
          label: 'Fuel Type',
          type: 'select',
          options: ['Petrol', 'Diesel'],
          required: true,
        },
        { name: 'mileage', label: 'Mileage', type: 'number', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [tier('Admin Manager', 'ADMIN_MANAGER', 1)],
      },
    ],
  },
  {
    code: 'OVERTIME_APPLICATION',
    name: 'Overtime Application',
    description: 'Application for overtime work outside normal working hours.',
    module: 'HR',
    numberPrefix: 'OT',
    icon: 'ClockCircleOutlined',
    sortOrder: 110,
    formSchema: {
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'startTime', label: 'Start Time', type: 'text', required: true },
        { name: 'endTime', label: 'End Time', type: 'text', required: true },
        { name: 'hours', label: 'Hours', type: 'number', required: true },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true },
      ],
    },
    approvalRules: [
      {
        name: 'Short overtime (≤ 4 hours)',
        when: { hours: { lte: 4 } },
        tiers: [tier('Project Manager', 'DEPARTMENT_HEAD', 1)],
      },
      {
        name: 'Extended overtime (> 4 hours)',
        when: { hours: { gt: 4 } },
        tiers: [
          tier('Project Manager', 'DEPARTMENT_HEAD', 1),
          tier('HR Officer', 'HR_MANAGER', 2),
        ],
      },
      {
        name: 'Default',
        tiers: [
          tier('Project Manager', 'DEPARTMENT_HEAD', 1),
          tier('HR Officer', 'HR_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'INSPECTION_REPAIR',
    name: 'Inspection and Repair',
    description: 'Request for equipment inspection, maintenance, or repair.',
    module: 'ADMIN',
    numberPrefix: 'IR',
    icon: 'ToolOutlined',
    sortOrder: 120,
    formSchema: {
      fields: [
        {
          name: 'equipmentName',
          label: 'Equipment Name',
          type: 'text',
          required: true,
        },
        {
          name: 'issueDescription',
          label: 'Issue Description',
          type: 'textarea',
          required: true,
        },
        {
          name: 'urgency',
          label: 'Urgency',
          type: 'select',
          options: ['Low', 'Medium', 'High'],
          required: true,
        },
        {
          name: 'estimatedCost',
          label: 'Estimated Cost',
          type: 'currency',
          required: true,
        },
        {
          name: 'requestedDate',
          label: 'Requested Date',
          type: 'date',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Low cost (≤ 5,000)',
        when: { estimatedCost: { lte: 5000 } },
        tiers: [tier('Department Head', 'DEPARTMENT_HEAD', 1)],
      },
      {
        name: 'High cost (> 5,000)',
        when: { estimatedCost: { gt: 5000 } },
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Finance Manager', 'FINANCE_MANAGER', 2),
          tier('General Manager', 'GENERAL_MANAGER', 3),
        ],
      },
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('Finance Manager', 'FINANCE_MANAGER', 2),
          tier('General Manager', 'GENERAL_MANAGER', 3),
        ],
      },
    ],
  },
  {
    code: 'EXIT_PERMIT',
    name: 'Exit Permit',
    description:
      'Equipment and materials exit or entrance permit for site security.',
    module: 'HR',
    numberPrefix: 'EP',
    icon: 'ExportOutlined',
    sortOrder: 140,
    formSchema: {
      fields: [
        {
          name: 'direction',
          label: 'Direction',
          type: 'select',
          options: ['EXIT', 'ENTRANCE'],
          required: true,
        },
        { name: 'date', label: 'Permit Date', type: 'date', required: true },
        {
          name: 'itemCount',
          label: 'Number of Items',
          type: 'number',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Department Head', 'DEPARTMENT_HEAD', 1),
          tier('HR Officer', 'HR', 2),
        ],
      },
    ],
  },
  {
    code: 'FIELD_MOVEMENT_LOG',
    name: 'Field Movement / Early Departure Log',
    description:
      'Explain missing clock-ins, missing clock-outs, or early departures flagged in monthly attendance.',
    module: 'HR',
    numberPrefix: 'FM',
    icon: 'clock-circle',
    sortOrder: 150,
    formSchema: {
      fields: [
        { name: 'month', label: 'Month', type: 'number', required: true },
        { name: 'year', label: 'Year', type: 'number', required: true },
        {
          name: 'entryCount',
          label: 'Days Explained',
          type: 'number',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('Project Manager', 'DEPARTMENT_HEAD', 1),
          tier('HR Officer', 'HR', 2),
        ],
      },
    ],
  },
  {
    code: 'PAYROLL_RUN',
    name: 'Payroll Run Approval',
    description:
      'Monthly payroll approval, not user-requestable. Runs are created and approved only from /hr/payroll.',
    module: 'HR',
    numberPrefix: 'PR',
    icon: 'dollar-circle',
    sortOrder: 160,
    isUserRequestable: false,
    formSchema: {
      fields: [
        { name: 'month', label: 'Month', type: 'number', required: true },
        { name: 'year', label: 'Year', type: 'number', required: true },
        {
          name: 'totalEmployees',
          label: 'Total Employees',
          type: 'number',
          required: true,
        },
        {
          name: 'totalNetPay',
          label: 'Total Net Pay (ETB)',
          type: 'number',
          required: true,
        },
      ],
    },
    approvalRules: [
      {
        name: 'Default',
        tiers: [
          tier('HR Manager', 'HR Manager', 1),
          tier('General Manager', 'GENERAL_MANAGER', 2),
        ],
      },
    ],
  },
  {
    code: 'PER_DIEM',
    name: 'Per Diem Request',
    description:
      'Daily allowance advance (ETB). Single-tier approval: Discipline Lead, or HR Manager when no DL is assigned.',
    module: 'HR',
    numberPrefix: 'PD',
    icon: 'WalletOutlined',
    sortOrder: 75,
    formSchema: { fields: [] },
    approvalRules: [
      {
        name: 'Default',
        tiers: [tier('Discipline Lead', 'DISCIPLINE_LEAD', 1)],
      },
    ],
  },
  {
    code: 'PER_DIEM_SETTLEMENT',
    name: 'Per Diem Settlement',
    description:
      'Settle paid per diem advances against actual days travelled (ETB). Single-tier approval: HR Manager or Local HR Manager.',
    module: 'HR',
    numberPrefix: 'PS',
    icon: 'WalletOutlined',
    sortOrder: 76,
    formSchema: { fields: [] },
    approvalRules: [
      {
        name: 'Default',
        tiers: [tier('HR Manager', 'HR_MANAGER', 1)],
      },
    ],
  },
];

/** Maps short aliases in category rules to seeded Role.name values. */
const ROLE_ALIASES: Record<string, string> = {
  DISCIPLINE_LEAD: 'Discipline Lead',
  DEPARTMENT_HEAD: 'Project Manager',
  HR_MANAGER: 'HR Officer',
  GENERAL_MANAGER: 'General Manager',
  FINANCE_MANAGER: 'Finance Manager',
  WAREHOUSE_MANAGER: 'Storekeeper',
  ADMIN_MANAGER: 'Document Controller',
  PROJECT_MANAGER: 'Project Manager',
  MANAGER: 'Project Manager',
  HR: 'HR Officer',
  FINANCE: 'Finance Manager',
  DIRECTOR: 'Managing Director',
  STORE: 'Storekeeper',
};

export interface SeedApprovalCategoriesOptions {
  companyId?: string;
  actorUserId?: string;
}

/**
 * Clears existing approval categories for the company, then upserts HR categories.
 */
export async function seedApprovalCategories(
  prisma: PrismaClient,
  options: SeedApprovalCategoriesOptions = {},
): Promise<number> {
  const companyId = await resolveCompanyId(prisma, options.companyId);
  const actorUserId = await resolveActorUserId(
    prisma,
    companyId,
    options.actorUserId,
  );

  await clearCompanyApprovalCategories(prisma, companyId);
  await ensureApproverRoleAssignments(prisma, companyId, actorUserId);

  let upserted = 0;
  for (const def of CATEGORIES) {
    const data = {
      name: def.name,
      description: def.description,
      icon: def.icon,
      module: def.module,
      formSchema: def.formSchema as unknown as Prisma.InputJsonValue,
      approvalRules: def.approvalRules as unknown as Prisma.InputJsonValue,
      numberPrefix: def.numberPrefix,
      isActive: true,
      isUserRequestable: def.isUserRequestable !== false,
      permissionModule:
        def.permissionModule ??
        APPROVAL_CATEGORY_PERMISSION_MODULE[def.code] ??
        null,
      allowAttachments: true,
      sortOrder: def.sortOrder,
      updatedBy: actorUserId,
      deletedAt: null,
      deletedBy: null,
    };

    await prisma.approvalCategory.upsert({
      where: {
        companyId_code: { companyId, code: def.code },
      },
      create: {
        companyId,
        code: def.code,
        createdBy: actorUserId,
        ...data,
      },
      update: data,
    });
    upserted += 1;
  }

  console.log(
    `  Approval categories seeded: ${upserted} HR categories (company ${companyId})`,
  );
  return upserted;
}

/**
 * Removes prior approval data for the company so re-seed can replace codes safely.
 * Nulls module FKs first - live HR docs reference approval_request and block deleteMany.
 */
async function clearCompanyApprovalCategories(
  prisma: PrismaClient,
  companyId: string,
): Promise<void> {
  const unlinkWhere = { companyId, approvalRequestId: { not: null } };
  const unlinkData = { approvalRequestId: null };

  await prisma.leaveRequest.updateMany({ where: unlinkWhere, data: unlinkData });
  await prisma.overtimeSheet.updateMany({ where: unlinkWhere, data: unlinkData });
  await prisma.fieldMovementLog.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.flightApplication.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.businessTrip.updateMany({ where: unlinkWhere, data: unlinkData });
  await prisma.expenseClaim.updateMany({ where: unlinkWhere, data: unlinkData });
  await prisma.perDiemRequest.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.perDiemSettlement.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.purchaseRequest.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.materialRequisition.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.consumablesRequisition.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.vehicleApplication.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.vehicleRefueling.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.inspectionRepair.updateMany({
    where: unlinkWhere,
    data: unlinkData,
  });
  await prisma.officialSeal.updateMany({ where: unlinkWhere, data: unlinkData });
  await prisma.projectSeal.updateMany({ where: unlinkWhere, data: unlinkData });
  await prisma.exitPermit.updateMany({ where: unlinkWhere, data: unlinkData });

  await prisma.approvalComment.deleteMany({
    where: { request: { companyId } },
  });
  await prisma.approvalTier.deleteMany({
    where: { request: { companyId } },
  });
  await prisma.approvalRequest.deleteMany({
    where: { companyId },
  });
  const deleted = await prisma.approvalCategory.deleteMany({
    where: { companyId },
  });
  console.log(
    `  Cleared ${deleted.count} existing approval categor(ies) for company ${companyId}`,
  );
}

async function resolveCompanyId(
  prisma: PrismaClient,
  explicitCompanyId?: string,
): Promise<string> {
  const fromEnv = process.env.SEED_COMPANY_ID?.trim();
  const preferred = explicitCompanyId ?? fromEnv;
  if (preferred) {
    const company = await prisma.company.findFirst({
      where: { id: preferred, deletedAt: null },
      select: { id: true },
    });
    if (!company) {
      throw new Error(`Company ${preferred} not found for approval category seed`);
    }
    return company.id;
  }

  const first = await prisma.company.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!first) {
    throw new Error('No company found. Run the core seed before approval categories.');
  }
  return first.id;
}

async function resolveActorUserId(
  prisma: PrismaClient,
  companyId: string,
  explicitActorId?: string,
): Promise<string> {
  if (explicitActorId) {
    const actor = await prisma.user.findFirst({
      where: { id: explicitActorId, deletedAt: null },
      select: { id: true },
    });
    if (actor) {
      return actor.id;
    }

    // Revive soft-deleted seed actor if the unique row still exists
    const softDeleted = await prisma.user.findFirst({
      where: { id: explicitActorId },
      select: { id: true, deletedAt: true },
    });
    if (softDeleted?.deletedAt) {
      await prisma.user.update({
        where: { id: softDeleted.id },
        data: {
          deletedAt: null,
          deletedBy: null,
          isActive: true,
          updatedBy: softDeleted.id,
        },
      });
      return softDeleted.id;
    }

    console.warn(
      `Approval category seed actor ${explicitActorId} not found; falling back to system/company user.`,
    );
  }

  const systemUser = await prisma.user.findFirst({
    where: { id: SYSTEM_USER_ID, deletedAt: null },
    select: { id: true },
  });
  if (systemUser) {
    return systemUser.id;
  }

  const companyUser = await prisma.user.findFirst({
    where: { companyId, deletedAt: null, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!companyUser) {
    throw new Error(
      'No active user found for approval category seed. Run the core seed first.',
    );
  }
  return companyUser.id;
}

/**
 * Ensures the seed actor holds every role referenced by category rules so
 * ROLE resolvers succeed immediately after seed.
 */
async function ensureApproverRoleAssignments(
  prisma: PrismaClient,
  companyId: string,
  actorUserId: string,
): Promise<void> {
  const aliases = new Set<string>();
  for (const category of CATEGORIES) {
    for (const rule of category.approvalRules) {
      for (const ruleTier of rule.tiers) {
        aliases.add(ruleTier.role);
      }
    }
  }

  for (const alias of aliases) {
    const roleName = ROLE_ALIASES[alias.toUpperCase()] ?? alias;
    const role = await prisma.role.findFirst({
      where: { companyId, name: roleName, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new Error(
        `Role "${roleName}" (alias ${alias}) not found. Run the core seed first.`,
      );
    }

    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: actorUserId, roleId: role.id },
      },
      create: {
        userId: actorUserId,
        roleId: role.id,
        assignedBy: actorUserId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        deletedAt: null,
        deletedBy: null,
        updatedBy: actorUserId,
      },
    });
  }
}

