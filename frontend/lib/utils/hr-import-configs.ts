import type {
  HrImportColumn,
  HrImportModuleSchema,
} from '@/lib/utils/hr-import-schema';

/**
 * Client-side import schemas for the HR modules that support Excel import.
 *
 * These mirror the backend column schemas so the modal can pre-validate a file
 * before uploading it. When a backend schema changes, change the matching
 * entry here too - see `IMPORT_EXPORT.md`.
 */

const EMPLOYEE_COLUMNS: HrImportColumn[] = [
  {
    field: 'employeeEmail',
    label: 'Employee Email',
    type: 'email',
    requiredGroup: 'employee',
  },
  {
    field: 'employeeId',
    label: 'Employee ID',
    type: 'string',
    requiredGroup: 'employee',
  },
];

const SEAL_COLUMNS: HrImportColumn[] = [
  ...EMPLOYEE_COLUMNS,
  {
    field: 'fileName',
    label: 'Document Name',
    type: 'string',
    required: true,
    aliases: ['fileName', 'documentName'],
  },
  { field: 'description', label: 'Description', type: 'string', required: true },
  { field: 'sealCategory', label: 'Seal Category', type: 'string' },
  { field: 'copyCount', label: 'Copy Count', type: 'integer', min: 1 },
  {
    field: 'urgency',
    label: 'Urgency',
    type: 'enum',
    required: true,
    enumValues: ['CRITICAL', 'URGENT', 'MEDIUM', 'MINOR'],
  },
  { field: 'dateNeeded', label: 'Date Needed', type: 'date', required: true },
];

export const vehicleApplicationImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/vehicle-applications',
  templateFileName: 'vehicle-application-import-template.xlsx',
  columns: [
    ...EMPLOYEE_COLUMNS,
    {
      field: 'plateNumber',
      label: 'Vehicle Plate Number',
      type: 'string',
      required: true,
      aliases: ['vehiclePlate', 'plate'],
    },
    {
      field: 'driveType',
      label: 'Drive Type',
      type: 'enum',
      required: true,
      enumValues: ['COMPANY_DRIVER', 'SELF_DRIVE'],
    },
    { field: 'driverEmail', label: 'Driver Email', type: 'email' },
    {
      field: 'departureDatetime',
      label: 'Departure Date/Time',
      type: 'datetime',
      required: true,
    },
    {
      field: 'returnDatetime',
      label: 'Return Date/Time',
      type: 'datetime',
      required: true,
    },
    { field: 'destination', label: 'Destination', type: 'string', required: true },
    { field: 'purpose', label: 'Purpose', type: 'string', required: true },
    { field: 'passengerCount', label: 'Passenger Count', type: 'integer', min: 1 },
    { field: 'passengerNames', label: 'Passenger Names', type: 'string' },
    { field: 'projectCode', label: 'Project Code', type: 'string' },
    { field: 'notes', label: 'Notes', type: 'string' },
  ],
};

export const vehicleRefuelingImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/vehicle-refueling',
  templateFileName: 'vehicle-refueling-import-template.xlsx',
  columns: [
    ...EMPLOYEE_COLUMNS,
    {
      field: 'plateNumber',
      label: 'Vehicle Plate Number',
      type: 'string',
      required: true,
      aliases: ['vehiclePlate', 'plate'],
    },
    { field: 'driverEmail', label: 'Driver Email', type: 'email' },
    { field: 'fuelDate', label: 'Fuel Date', type: 'date', required: true },
    {
      field: 'fuelType',
      label: 'Fuel Type',
      type: 'enum',
      required: true,
      enumValues: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'],
    },
    { field: 'fuelStation', label: 'Fuel Station', type: 'string', required: true },
    {
      field: 'currentMileage',
      label: 'Current Mileage (km)',
      type: 'number',
      required: true,
      min: 0,
    },
    {
      field: 'requestedLitres',
      label: 'Requested Litres',
      type: 'number',
      required: true,
      min: 0,
    },
    { field: 'unitPriceEtb', label: 'Unit Price (ETB)', type: 'number', min: 0 },
    { field: 'notes', label: 'Notes', type: 'string' },
  ],
};

export const companyAssetImportSchema: HrImportModuleSchema = {
  endpoint: '/organization/assets',
  templateFileName: 'company-asset-import-template.xlsx',
  columns: [
    { field: 'serialNumber', label: 'Serial Number', type: 'string', required: true },
    { field: 'assetName', label: 'Asset Name', type: 'string' },
    { field: 'assetCode', label: 'Asset Code', type: 'string' },
    { field: 'cardNumber', label: 'Card Number', type: 'string' },
    { field: 'brand', label: 'Brand', type: 'string', required: true },
    { field: 'model', label: 'Model', type: 'string', required: true },
    {
      field: 'year',
      label: 'Year',
      type: 'integer',
      required: true,
      min: 1900,
      max: new Date().getFullYear() + 1,
    },
    { field: 'color', label: 'Color', type: 'string', required: true },
    { field: 'type', label: 'Type', type: 'string', required: true },
    { field: 'assetCategory', label: 'Asset Category', type: 'string' },
    { field: 'specifications', label: 'Specifications', type: 'string' },
    { field: 'description', label: 'Description', type: 'string' },
    { field: 'startUseDate', label: 'Start Use Date', type: 'date' },
    {
      field: 'usefulLifeMonths',
      label: 'Useful Life (Months)',
      type: 'integer',
      min: 1,
    },
    {
      field: 'originalValue',
      label: 'Original Value (ETB)',
      type: 'number',
      min: 0,
    },
    { field: 'managingDepartment', label: 'Managing Department', type: 'string' },
    { field: 'storageLocation', label: 'Storage Location', type: 'string' },
  ],
};

export const inspectionRepairImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/inspection-repair',
  templateFileName: 'inspection-repair-import-template.xlsx',
  columns: [
    ...EMPLOYEE_COLUMNS,
    {
      field: 'assetSerialNumber',
      label: 'Asset Serial Number',
      type: 'string',
      aliases: ['serialNumber'],
    },
    { field: 'deviceName', label: 'Device Name', type: 'string' },
    { field: 'make', label: 'Make', type: 'string' },
    { field: 'model', label: 'Model', type: 'string' },
    { field: 'year', label: 'Year', type: 'integer', min: 1900 },
    { field: 'location', label: 'Location', type: 'string', required: true },
    {
      field: 'inspectionType',
      label: 'Inspection Type',
      type: 'enum',
      required: true,
      enumValues: ['INSPECTION', 'MAINTENANCE', 'REPAIR'],
    },
    {
      field: 'urgency',
      label: 'Urgency',
      type: 'enum',
      required: true,
      enumValues: ['CRITICAL', 'URGENT', 'MEDIUM', 'MINOR'],
    },
    { field: 'description', label: 'Description', type: 'string', required: true },
    { field: 'solution', label: 'Proposed Solution', type: 'string' },
  ],
};

export const exitPermitImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/exit-permits',
  templateFileName: 'exit-permit-import-template.xlsx',
  columns: [
    ...EMPLOYEE_COLUMNS,
    {
      field: 'direction',
      label: 'Direction',
      type: 'enum',
      required: true,
      enumValues: ['EXIT', 'ENTRANCE'],
    },
    { field: 'date', label: 'Date', type: 'date' },
    { field: 'department', label: 'Department', type: 'string' },
    { field: 'itemName', label: 'Item Name', type: 'string', required: true },
    { field: 'issue', label: 'Issue', type: 'string' },
    { field: 'quantity', label: 'Quantity', type: 'number', min: 1 },
    { field: 'unit', label: 'Unit', type: 'string' },
  ],
};

export const officialSealImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/official-seal',
  templateFileName: 'official-seal-import-template.xlsx',
  columns: SEAL_COLUMNS,
};

export const projectSealImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/project-seal',
  templateFileName: 'project-seal-import-template.xlsx',
  columns: SEAL_COLUMNS,
};

const RATE_CATEGORIES = [
  { field: 'domesticRate', active: 'domesticActive', label: 'Domestic' },
  { field: 'regionalRate', active: 'regionalActive', label: 'Regional' },
  {
    field: 'internationalRate',
    active: 'internationalActive',
    label: 'International',
  },
] as const;

export const employeePerDiemRateImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/employee-per-diem-rates',
  templateFileName: 'employee-per-diem-rate-import-template.xlsx',
  columns: [
    ...EMPLOYEE_COLUMNS,
    ...RATE_CATEGORIES.flatMap((category) => [
      {
        field: category.field,
        label: `${category.label} Rate (ETB)`,
        type: 'number' as const,
        min: 0,
      },
      {
        field: category.active,
        label: `${category.label} Active`,
        type: 'string' as const,
      },
    ]),
  ],
};

export const leavePolicyImportSchema: HrImportModuleSchema = {
  endpoint: '/hr/leave-policies',
  templateFileName: 'leave-policy-import-template.xlsx',
  columns: [
    { field: 'name', label: 'Policy Name', type: 'string', required: true, aliases: ['policyName'] },
    { field: 'description', label: 'Description', type: 'string' },
    { field: 'governedBy', label: 'Governed By', type: 'string' },
    { field: 'isActive', label: 'Active', type: 'string' },
    {
      field: 'leaveType',
      label: 'Leave Type',
      type: 'enum',
      required: true,
      enumValues: ['ANNUAL', 'MATERNITY', 'SICK'],
    },
    { field: 'baseDays', label: 'Base Days', type: 'number', required: true, min: 0 },
    { field: 'isProgressive', label: 'Progressive', type: 'string' },
    { field: 'incrementDays', label: 'Increment Days', type: 'number', min: 0 },
    { field: 'incrementEveryYears', label: 'Increment Every (Years)', type: 'integer', min: 1 },
    { field: 'minimumServiceMonths', label: 'Minimum Service (Months)', type: 'integer', min: 0 },
    { field: 'maxDaysCap', label: 'Max Days Cap', type: 'number', min: 0 },
    { field: 'maxCarryForwardDays', label: 'Max Carry Forward Days', type: 'number', min: 0 },
    { field: 'requiresReceipt', label: 'Requires Receipt', type: 'string' },
  ],
};

export const companyVehicleImportSchema: HrImportModuleSchema = {
  endpoint: '/organization/vehicles',
  templateFileName: 'company-vehicle-import-template.xlsx',
  columns: [
    { field: 'plateNumber', label: 'Plate Number', type: 'string', required: true, aliases: ['plate'] },
    {
      field: 'vehicleType',
      label: 'Vehicle Type',
      type: 'enum',
      required: true,
      enumValues: ['CAR', 'TRUCK', 'VAN', 'BUS', 'PICKUP', 'MOTORCYCLE', 'OTHER'],
    },
    { field: 'make', label: 'Make', type: 'string', required: true },
    { field: 'model', label: 'Model', type: 'string', required: true },
    {
      field: 'year',
      label: 'Year',
      type: 'integer',
      required: true,
      min: 1900,
      max: new Date().getFullYear() + 1,
    },
    {
      field: 'fuelType',
      label: 'Fuel Type',
      type: 'enum',
      enumValues: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'],
    },
    { field: 'color', label: 'Color', type: 'string' },
    {
      field: 'assignedDriverEmail',
      label: 'Assigned Driver Email',
      type: 'email',
      aliases: ['driverEmail'],
    },
    { field: 'isActive', label: 'Active', type: 'string' },
    { field: 'notes', label: 'Notes', type: 'string' },
  ],
};
