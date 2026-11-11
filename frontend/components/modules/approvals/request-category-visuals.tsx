import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  CircleDollarSign,
  Clock3,
  FileText,
  Fuel,
  Home,
  Laptop,
  MapPin,
  Package,
  PackageMinus,
  PackageOpen,
  Plane,
  Receipt,
  ShoppingCart,
  Stamp,
  Timer,
  Wallet,
  Wrench,
} from 'lucide-react';
import { tokens } from '@/lib/theme/tokens';

/**
 * Icon and colour per approval category - shared by the New Request picker
 * and the Approvals table so a request type looks the same everywhere.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  LEAVE_REQUEST: CalendarDays,
  SITE_ASSIGNMENT: MapPin,
  WORK_FROM_HOME: Home,
  OVERTIME_APPLICATION: Timer,
  FIELD_MOVEMENT_LOG: Clock3,
  FLIGHT_APPLICATION: Plane,
  BUSINESS_TRIP: BriefcaseBusiness,
  EXPENSE_CLAIM: Receipt,
  PER_DIEM: Wallet,
  PER_DIEM_SETTLEMENT: CircleDollarSign,
  PURCHASE_REQUEST: ShoppingCart,
  MATERIAL_REQUISITION: Package,
  ASSET_REQUEST: Laptop,
  CONSUMABLES_REQUISITION: PackageOpen,
  EXIT_PERMIT: PackageMinus,
  VEHICLE_APPLICATION: Car,
  VEHICLE_REFUELING: Fuel,
  INSPECTION_REPAIR: Wrench,
  OFFICIAL_SEAL_USAGE: Stamp,
  PROJECT_SEAL_USAGE: BadgeCheck,
};

export const FALLBACK_CATEGORY_ICON: LucideIcon = FileText;

export interface RequestGroup {
  key: string;
  codes: string[];
  accent: string;
  tint: string;
}

/** Display order and colour of each group. Unlisted codes fall into "other". */
export const REQUEST_GROUPS: RequestGroup[] = [
  {
    key: 'time',
    codes: [
      'LEAVE_REQUEST',
      'SITE_ASSIGNMENT',
      'WORK_FROM_HOME',
      'OVERTIME_APPLICATION',
      'FIELD_MOVEMENT_LOG',
    ],
    accent: tokens.colorBlue400,
    tint: tokens.colorBlue50,
  },
  {
    key: 'travel',
    codes: ['FLIGHT_APPLICATION', 'BUSINESS_TRIP'],
    accent: tokens.colorCyan400,
    tint: tokens.colorCyan50,
  },
  {
    key: 'expenses',
    codes: ['EXPENSE_CLAIM', 'PER_DIEM', 'PER_DIEM_SETTLEMENT'],
    accent: tokens.colorGreen600,
    tint: tokens.colorGreen50,
  },
  {
    key: 'materials',
    codes: [
      'PURCHASE_REQUEST',
      'MATERIAL_REQUISITION',
      'ASSET_REQUEST',
      'CONSUMABLES_REQUISITION',
      'EXIT_PERMIT',
    ],
    accent: tokens.colorAmber400,
    tint: tokens.colorAmber50,
  },
  {
    key: 'vehicles',
    codes: ['VEHICLE_APPLICATION', 'VEHICLE_REFUELING', 'INSPECTION_REPAIR'],
    accent: tokens.colorCoral400,
    tint: tokens.colorCoral50,
  },
  {
    key: 'seals',
    codes: ['OFFICIAL_SEAL_USAGE', 'PROJECT_SEAL_USAGE'],
    accent: tokens.colorTeal600,
    tint: tokens.colorTeal50,
  },
];

export const OTHER_GROUP: RequestGroup = {
  key: 'other',
  codes: [],
  accent: tokens.colorGray600,
  tint: tokens.colorGray50,
};

export function requestGroupFor(code: string | null | undefined): RequestGroup {
  return REQUEST_GROUPS.find((group) => group.codes.includes(code ?? '')) ?? OTHER_GROUP;
}

/** The category's icon (falls back to a document icon). */
export function CategoryIcon({
  code,
  ...props
}: { code: string | null | undefined } & LucideProps): React.ReactNode {
  const Icon = CATEGORY_ICONS[code ?? ''] ?? FALLBACK_CATEGORY_ICON;
  return <Icon {...props} />;
}
