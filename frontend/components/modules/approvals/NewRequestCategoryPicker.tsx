'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Input } from 'antd';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Fuel,
  Package,
  PackageMinus,
  PackageOpen,
  Plane,
  Receipt,
  Search,
  ShoppingCart,
  Stamp,
  Timer,
  Wallet,
  Wrench,
} from 'lucide-react';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalCategorySummary } from '@/lib/api/approvals.types';
import { tokens } from '@/lib/theme/tokens';
import {
  formatApprovalCategoryDescription,
  formatApprovalCategoryName,
} from '@/lib/utils/approval-category-display';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  LEAVE_REQUEST: CalendarDays,
  OVERTIME_APPLICATION: Timer,
  FIELD_MOVEMENT_LOG: Clock3,
  FLIGHT_APPLICATION: Plane,
  BUSINESS_TRIP: BriefcaseBusiness,
  EXPENSE_CLAIM: Receipt,
  PER_DIEM: Wallet,
  PER_DIEM_SETTLEMENT: CircleDollarSign,
  PURCHASE_REQUEST: ShoppingCart,
  MATERIAL_REQUISITION: Package,
  CONSUMABLES_REQUISITION: PackageOpen,
  EXIT_PERMIT: PackageMinus,
  VEHICLE_APPLICATION: Car,
  VEHICLE_REFUELING: Fuel,
  INSPECTION_REPAIR: Wrench,
  OFFICIAL_SEAL_USAGE: Stamp,
  PROJECT_SEAL_USAGE: BadgeCheck,
};

interface RequestGroup {
  key: string;
  codes: string[];
  accent: string;
  tint: string;
}

/** Display order and colour of each card group. Unlisted codes fall into "other". */
const REQUEST_GROUPS: RequestGroup[] = [
  {
    key: 'time',
    codes: ['LEAVE_REQUEST', 'OVERTIME_APPLICATION', 'FIELD_MOVEMENT_LOG'],
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

const OTHER_GROUP: RequestGroup = {
  key: 'other',
  codes: [],
  accent: tokens.colorGray600,
  tint: tokens.colorGray50,
};

interface PickerCard {
  category: ApprovalCategorySummary;
  name: string;
  description: string;
}

interface Props {
  categories: ApprovalCategorySummary[];
  onSelect: (category: ApprovalCategorySummary) => void;
  onCancel: () => void;
}

/**
 * New Request landing: searchable, grouped cards for every approval category.
 */
export default function NewRequestCategoryPicker({
  categories,
  onSelect,
  onCancel,
}: Props): React.ReactNode {
  const { t } = useEpcTranslation();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const buckets = new Map<RequestGroup, PickerCard[]>();

    for (const category of categories) {
      const name = formatApprovalCategoryName(category.code, t, category.name);
      const description =
        formatApprovalCategoryDescription(
          category.code,
          t,
          category.description,
        ) || category.code;
      const haystack = `${name} ${description} ${category.code}`.toLowerCase();
      if (needle && !haystack.includes(needle)) {
        continue;
      }
      const group =
        REQUEST_GROUPS.find((g) => g.codes.includes(category.code)) ??
        OTHER_GROUP;
      const cards = buckets.get(group) ?? [];
      cards.push({ category, name, description });
      buckets.set(group, cards);
    }

    return [...REQUEST_GROUPS, OTHER_GROUP]
      .filter((group) => buckets.has(group))
      .map((group) => {
        const cards = buckets.get(group) ?? [];
        // Keep the configured order inside a group; unknown codes sort by name.
        cards.sort((a, b) => {
          const ai = group.codes.indexOf(a.category.code);
          const bi = group.codes.indexOf(b.category.code);
          if (ai !== bi) {
            return ai - bi;
          }
          return a.name.localeCompare(b.name);
        });
        return { group, cards };
      });
  }, [categories, query, t]);

  return (
    <div className="erp-pro-list-page erp-users-page erp-approvals-new-page erp-request-picker">
      <div className="erp-request-picker-hero">
        <div className="min-w-0">
          <h2
            className="erp-request-picker-title"
            style={{ color: tokens.colorTextPrimary }}
          >
            {t('pages.approvals.picker.title')}
          </h2>
          <p
            className="erp-request-picker-subtitle"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('pages.approvals.newDescription')}
          </p>
        </div>
        <div className="erp-request-picker-actions">
          <Input
            allowClear
            size="large"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('pages.approvals.picker.searchPlaceholder')}
            aria-label={t('pages.approvals.picker.searchPlaceholder')}
            prefix={
              <Search
                aria-hidden
                size={16}
                style={{ color: tokens.colorTextTertiary }}
              />
            }
            className="erp-request-picker-search"
          />
          <Button size="large" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <ErpNotice tone="info" title={t('pages.approvals.noCategories')} />
      ) : groups.length === 0 ? (
        <ErpNotice
          tone="info"
          title={t('pages.approvals.picker.noMatches', { query: query.trim() })}
        />
      ) : (
        groups.map(({ group, cards }) => {
          const headingId = `request-group-${group.key}`;
          return (
            <section
              key={group.key}
              aria-labelledby={headingId}
              className="erp-request-picker-group"
            >
              <h3
                id={headingId}
                className="erp-request-picker-group-title"
                style={{ color: tokens.colorTextSecondary }}
              >
                <span
                  aria-hidden
                  className="erp-request-picker-group-dot"
                  style={{ background: group.accent }}
                />
                {t(`pages.approvals.picker.groups.${group.key}`)}
                <span className="erp-request-picker-group-count">
                  {cards.length}
                </span>
              </h3>
              <ul className="erp-request-picker-grid">
                {cards.map(({ category, name, description }) => {
                  const Icon = CATEGORY_ICONS[category.code] ?? FileText;
                  return (
                    <li key={category.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(category)}
                        className="erp-request-card"
                        style={
                          {
                            '--req-accent': group.accent,
                            '--req-tint': group.tint,
                          } as CSSProperties
                        }
                      >
                        <span aria-hidden className="erp-request-card-icon">
                          <Icon size={20} strokeWidth={1.75} />
                        </span>
                        <span className="erp-request-card-body">
                          <span
                            className="erp-request-card-name"
                            style={{ color: tokens.colorTextPrimary }}
                          >
                            {name}
                          </span>
                          <span
                            className="erp-request-card-description"
                            style={{ color: tokens.colorTextSecondary }}
                          >
                            {description}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden
                          size={18}
                          className="erp-request-card-arrow"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
