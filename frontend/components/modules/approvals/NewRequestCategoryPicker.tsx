'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Input } from 'antd';
import { ChevronRight, History, Search } from 'lucide-react';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalCategorySummary } from '@/lib/api/approvals.types';
import { useApprovalRequests } from '@/lib/query/approvals';
import { tokens } from '@/lib/theme/tokens';
import {
  formatApprovalCategoryDescription,
  formatApprovalCategoryName,
} from '@/lib/utils/approval-category-display';
import {
  OTHER_GROUP,
  REQUEST_GROUPS,
  CategoryIcon,
  requestGroupFor,
  type RequestGroup,
} from './request-category-visuals';

interface PickerCard {
  category: ApprovalCategorySummary;
  name: string;
  description: string;
}

const RECENT_LIMIT = 4;
// Enough of my latest requests to usually find RECENT_LIMIT distinct types.
const RECENT_LOOKBACK = 20;

function RequestCard({
  card,
  group,
  onSelect,
}: {
  card: PickerCard;
  group: RequestGroup;
  onSelect: (category: ApprovalCategorySummary) => void;
}): React.ReactNode {
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
          <CategoryIcon code={card.category.code} size={20} strokeWidth={1.75} />
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
      const group = requestGroupFor(card.category.code);
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
        <div className="erp-request-picker-heading min-w-0">
          <p className="erp-request-picker-eyebrow">{t('nav.groups.newRequest')}</p>
          <h2 className="erp-request-picker-title">
            {t('pages.approvals.picker.title')}
          </h2>
          <p className="erp-request-picker-subtitle">
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
                className="erp-request-picker-search-icon"
              />
            }
            className="erp-request-picker-search"
          />
          <Button
            size="large"
            onClick={onCancel}
            className="erp-request-picker-cancel"
          >
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
                group={requestGroupFor(card.category.code)}
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
