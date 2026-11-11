'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

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
  History,
  Home,
  Laptop,
  MapPin,
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
import { useApprovalRequests } from '@/lib/query/approvals';
import { tokens } from '@/lib/theme/tokens';
import {
  formatApprovalCategoryDescription,
  formatApprovalCategoryName,
} from '@/lib/utils/approval-category-display';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
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

const RECENT_LIMIT = 4;
// Enough of my latest requests to usually find RECENT_LIMIT distinct types.
const RECENT_LOOKBACK = 20;

function groupFor(code: string): RequestGroup {
  return REQUEST_GROUPS.find((g) => g.codes.includes(code)) ?? OTHER_GROUP;
}

function RequestCard({
  card,
  group,
  onSelect,
}: {
  card: PickerCard;
  group: RequestGroup;
  onSelect: (category: ApprovalCategorySummary) => void;
}): React.ReactNode {
  const Icon = CATEGORY_ICONS[card.category.code] ?? FileText;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(card.category)}
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
            {card.name}
          </span>
          <span
            className="erp-request-card-description"
            style={{ color: tokens.colorTextSecondary }}
          >
            {card.description}
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
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const recentQuery = useApprovalRequests({
    page: 1,
    limit: RECENT_LOOKBACK,
    inbox: 'MY_REQUESTS',
  });

  const allCards = useMemo<PickerCard[]>(
    () =>
      categories.map((category) => ({
        category,
        name: formatApprovalCategoryName(category.code, t, category.name),
        description:
          formatApprovalCategoryDescription(
            category.code,
            t,
            category.description,
          ) || category.code,
      })),
    [categories, t],
  );

  // Distinct types from my latest requests, newest first, limited to types I can still file.
  const recentCards = useMemo(() => {
    const byCode = new Map(allCards.map((card) => [card.category.code, card]));
    const picked: PickerCard[] = [];
    for (const item of recentQuery.data?.data ?? []) {
      const card = byCode.get(item.categoryCode ?? item.category?.code ?? '');
      if (card && !picked.includes(card)) {
        picked.push(card);
      }
      if (picked.length === RECENT_LIMIT) {
        break;
      }
    }
    return picked;
  }, [allCards, recentQuery.data]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const buckets = new Map<RequestGroup, PickerCard[]>();

    for (const card of allCards) {
      const haystack =
        `${card.name} ${card.description} ${card.category.code}`.toLowerCase();
      if (needle && !haystack.includes(needle)) {
        continue;
      }
      const group = groupFor(card.category.code);
      const cards = buckets.get(group) ?? [];
      cards.push(card);
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
  }, [allCards, query]);

  const totalCards = groups.reduce((sum, entry) => sum + entry.cards.length, 0);
  // A chip whose group no longer matches the search falls back to "All".
  const selectedGroup = groups.some(({ group }) => group.key === activeGroup)
    ? activeGroup
    : 'all';
  const visibleGroups =
    selectedGroup === 'all'
      ? groups
      : groups.filter(({ group }) => group.key === selectedGroup);
  const showRecent =
    recentCards.length > 0 && query.trim() === '' && selectedGroup === 'all';

  return (
    <div className="erp-pro-list-page erp-users-page erp-approvals-new-page erp-request-picker erp-hr-travel-v2">
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

        {groups.length > 1 ? (
          <div
            role="group"
            aria-label={t('pages.approvals.picker.filterGroups')}
            className="erp-request-picker-chips"
          >
            {[
              { key: 'all', label: t('pages.approvals.picker.allGroups'), count: totalCards, accent: null },
              ...groups.map(({ group, cards }) => ({
                key: group.key,
                label: t(`pages.approvals.picker.groups.${group.key}`),
                count: cards.length,
                accent: group.accent,
              })),
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={selectedGroup === chip.key}
                className="erp-request-picker-chip"
                onClick={() => setActiveGroup(chip.key)}
              >
                {chip.accent ? (
                  <span
                    aria-hidden
                    className="erp-request-picker-chip-dot"
                    style={{ background: chip.accent }}
                  />
                ) : null}
                {chip.label}
                <span className="erp-request-picker-chip-count">{chip.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showRecent ? (
        <section
          aria-labelledby="request-group-recent"
          className="erp-request-picker-group"
        >
          <h3
            id="request-group-recent"
            className="erp-request-picker-group-title"
            style={{ color: tokens.colorTextSecondary }}
          >
            <History aria-hidden size={14} strokeWidth={2} />
            {t('pages.approvals.picker.recent')}
          </h3>
          <ul className="erp-request-picker-grid">
            {recentCards.map((card) => (
              <RequestCard
                key={card.category.id}
                card={card}
                group={groupFor(card.category.code)}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {categories.length === 0 ? (
        <ErpNotice tone="info" title={t('pages.approvals.noCategories')} />
      ) : groups.length === 0 ? (
        <ErpNotice
          tone="info"
          title={t('pages.approvals.picker.noMatches', { query: query.trim() })}
        />
      ) : (
        visibleGroups.map(({ group, cards }) => {
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
                {cards.map((card) => (
                  <RequestCard
                    key={card.category.id}
                    card={card}
                    group={group}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
