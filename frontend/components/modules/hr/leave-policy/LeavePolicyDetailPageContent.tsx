'use client';

import { useMemo, useState } from 'react';
import { Button, Dropdown, Grid, Skeleton, Tag } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { LeavePolicyRule } from '@/lib/api/leave-policy.types';
import {
  useDeleteLeavePolicy,
  useLeavePolicy,
} from '@/lib/query/leave-policy';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { previewEntitlement } from '@/lib/utils/leave-policy-preview';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
const LIST_PATH = '/hr/leave-policy';
const RULE_ORDER = ['ANNUAL', 'MATERNITY', 'SICK'] as const;
const PREVIEW_YEARS = 3;

function sortRules(rules: LeavePolicyRule[]): LeavePolicyRule[] {
  return [...rules].sort((a, b) => {
    const ai = RULE_ORDER.indexOf(
      a.leaveType as (typeof RULE_ORDER)[number],
    );
    const bi = RULE_ORDER.indexOf(
      b.leaveType as (typeof RULE_ORDER)[number],
    );
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

interface LeavePolicyDetailPageContentProps {
  policyId: string;
}

/**
 * Leave policy detail - Users / employee profile chrome.
 */
export default function LeavePolicyDetailPageContent({
  policyId,
}: LeavePolicyDetailPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const policyQuery = useLeavePolicy(policyId, canViewHr);
  const deleteMutation = useDeleteLeavePolicy();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const policy = policyQuery.data;

  useSetHeaderExtra(null);

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(policyId);
      messageApi.success(t('hr.leavePolicy.deleted'));
      setConfirmDelete(false);
      router.push(LIST_PATH);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.leavePolicy.deleteBlocked'), messageApi);
    }
  }

  const rules = useMemo(
    () => (policy ? sortRules(policy.rules) : []),
    [policy],
  );

  const annualRule = useMemo(
    () => rules.find((rule) => rule.leaveType === 'ANNUAL'),
    [rules],
  );

  const hasProgressiveAnnual = Boolean(annualRule?.isProgressive);

  const previewDays = useMemo(() => {
    if (!annualRule) {
      return null;
    }
    return previewEntitlement(
      {
        leaveType: 'ANNUAL',
        baseDays: annualRule.baseDays,
        isProgressive: annualRule.isProgressive,
        incrementDays: annualRule.incrementDays ?? undefined,
        incrementEveryYears: annualRule.incrementEveryYears ?? undefined,
        minimumServiceMonths: annualRule.minimumServiceMonths,
        maxDaysCap: annualRule.maxDaysCap ?? undefined,
      },
      PREVIEW_YEARS,
    );
  }, [annualRule]);

  if (!canViewHr) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-policy-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (policyQuery.isLoading && !policy) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-policy-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (policyQuery.isError || !policy) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-policy-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            policyQuery.error,
            t('hr.leavePolicy.loadError'),
            t,
          )}
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('hr.leavePolicy.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const overflowMenuItems: MenuProps['items'] = [
    {
      key: 'edit',
      label: t('common.update'),
      icon: <Pencil size={14} />,
      onClick: () => router.push(`${LIST_PATH}/${policy.id}/edit`),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => setConfirmDelete(true),
    },
  ];
  const showOverflowMenu = isNarrow;

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-policy-detail-page ${DETAIL_PAGE_V2}`}>
      <ConfirmDialog
        open={confirmDelete}
        title={t('hr.leavePolicy.deleteTitle')}
        description={t('hr.leavePolicy.deleteDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(LIST_PATH)}
              aria-label={t('hr.buttons.back')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {showOverflowMenu ? (
              <Dropdown
                menu={{ items: overflowMenuItems }}
                trigger={['click']}
              >
                <Button
                  icon={<MoreOutlined />}
                  aria-label={t('common.actions')}
                />
              </Dropdown>
            ) : (
              <>
                <Button
                  type="primary"
                  icon={<Pencil size={14} />}
                  onClick={() =>
                    router.push(`${LIST_PATH}/${policy.id}/edit`)
                  }
                  aria-label={t('common.update')}
                >
                  {isCompact ? undefined : t('common.update')}
                </Button>
                <Button
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t('common.delete')}
                >
                  {isCompact ? undefined : t('common.delete')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <StatusBadge
                label={
                  policy.isActive ? t('common.active') : t('common.inactive')
                }
                variant={policy.isActive ? 'success' : 'default'}
              />
              {hasProgressiveAnnual ? (
                <Tag color="orange" className="m-0 rounded-xl">
                  {t('hr.leavePolicy.isProgressive')}
                </Tag>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {policy.name}
              </h2>
            </div>
            {policy.description ? (
              <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
                {policy.description}
              </p>
            ) : (
              <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
                {policy.governedBy
                  ? `${t('hr.leavePolicy.governedBy')}: ${policy.governedBy}`
                  : t('pages.hr.leavePolicy.listDescription')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.leavePolicy.governedBy')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {policy.governedBy || '-'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.leavePolicy.employees')}
            </p>
            <p className="erp-employee-meta-value">
              {policy.employeeCount.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.leavePolicy.rules')}</p>
            <p className="erp-employee-meta-value">
              {policy.ruleCount.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.assetLabels.updatedAt')}
            </p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(policy.updatedAt)}
            </p>
          </div>
        </div>
      </div>

      {!policy.isActive ? (
        <ErpNotice
          tone="warning"
          className="mb-0"
          title={t('hr.leavePolicy.inactiveNotice')}
        />
      ) : null}

      <div className="erp-pro-card min-w-0 overflow-hidden">
        <div className="erp-employee-tab-panel erp-contract-detail-body">
          <DetailSection title={t('hr.leavePolicy.steps.details')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.leavePolicy.name')}>
                {policy.name}
              </MetaItem>
              <MetaItem label={t('common.status')}>
                <StatusBadge
                  label={
                    policy.isActive ? t('common.active') : t('common.inactive')
                  }
                  variant={policy.isActive ? 'success' : 'default'}
                />
              </MetaItem>
              <MetaItem label={t('hr.leavePolicy.governedBy')}>
                {policy.governedBy || '-'}
              </MetaItem>
              <MetaItem label={t('hr.leavePolicy.employees')}>
                {policy.employeeCount === 0
                  ? t('hr.leavePolicy.noEmployees')
                  : policy.employeeCount.toLocaleString()}
              </MetaItem>
              {policy.description ? (
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.leavePolicy.description')}>
                    <span className="whitespace-pre-wrap">
                      {policy.description}
                    </span>
                  </MetaItem>
                </div>
              ) : null}
              <MetaItem label={t('hr.table.createdDate')}>
                {formatProjectDate(policy.createdAt)}
              </MetaItem>
              <MetaItem label={t('hr.assetLabels.updatedAt')}>
                {formatProjectDate(policy.updatedAt)}
              </MetaItem>
            </div>
          </DetailSection>

          {rules.length === 0 ? (
            <DetailSection title={t('hr.leavePolicy.steps.leaveRules')}>
              <p className="erp-users-cell-sub m-0">
                {t('hr.leavePolicy.noRules')}
              </p>
            </DetailSection>
          ) : (
            rules.map((rule) => (
              <DetailSection
                key={rule.leaveType}
                title={formatLeaveType(rule.leaveType, t)}
                action={
                  rule.leaveType === 'ANNUAL' && rule.isProgressive ? (
                    <Tag color="orange" className="m-0 rounded-xl">
                      {t('hr.leavePolicy.isProgressive')}
                    </Tag>
                  ) : rule.leaveType === 'SICK' && rule.requiresReceipt ? (
                    <Tag color="blue" className="m-0 rounded-xl">
                      {t('hr.leavePolicy.requiresReceipt')}
                    </Tag>
                  ) : null
                }
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <MetaItem label={t('hr.leavePolicy.baseDays')}>
                    <span className="tabular-nums">{rule.baseDays}</span>
                  </MetaItem>
                  <MetaItem label={t('hr.leavePolicy.minimumServiceMonths')}>
                    <span className="tabular-nums">
                      {rule.minimumServiceMonths}
                    </span>
                  </MetaItem>
                  {rule.leaveType === 'ANNUAL' ? (
                    <>
                      <MetaItem label={t('hr.leavePolicy.isProgressive')}>
                        {rule.isProgressive ? t('common.yes') : t('common.no')}
                      </MetaItem>
                      <MetaItem label={t('hr.leavePolicy.maxCarryForwardDays')}>
                        <span className="tabular-nums">
                          {rule.maxCarryForwardDays ?? '-'}
                        </span>
                      </MetaItem>
                      {rule.isProgressive ? (
                        <>
                          <MetaItem label={t('hr.leavePolicy.incrementDays')}>
                            <span className="tabular-nums">
                              {rule.incrementDays ?? '-'}
                            </span>
                          </MetaItem>
                          <MetaItem
                            label={t('hr.leavePolicy.incrementEveryYears')}
                          >
                            <span className="tabular-nums">
                              {rule.incrementEveryYears ?? '-'}
                            </span>
                          </MetaItem>
                          <MetaItem label={t('hr.leavePolicy.maxDaysCap')}>
                            <span className="tabular-nums">
                              {rule.maxDaysCap ?? '-'}
                            </span>
                          </MetaItem>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {rule.leaveType === 'SICK' ? (
                    <MetaItem label={t('hr.leavePolicy.requiresReceipt')}>
                      {rule.requiresReceipt ? t('common.yes') : t('common.no')}
                    </MetaItem>
                  ) : null}
                </div>

                {rule.leaveType === 'ANNUAL' &&
                rule.isProgressive &&
                previewDays != null ? (
                  <ErpNotice
                    className="mt-4"
                    tone="info"
                    title={t('hr.leavePolicy.preview')}
                    description={t('hr.leavePolicy.previewExample', {
                      years: PREVIEW_YEARS,
                      days: previewDays,
                      base: rule.baseDays,
                    })}
                  />
                ) : null}
              </DetailSection>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
