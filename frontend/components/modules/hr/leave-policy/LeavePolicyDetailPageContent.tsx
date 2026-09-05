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

const LIST_PATH = '/hr/leave-policy';
const RULE_ORDER = ['ANNUAL', 'MATERNITY', 'SICK'] as const;

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
 * Leave policy detail — Users / employee profile chrome.
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

  const hasProgressiveAnnual = useMemo(
    () =>
      rules.some(
        (rule) => rule.leaveType === 'ANNUAL' && rule.isProgressive,
      ),
    [rules],
  );

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-policy-detail-page">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (policyQuery.isLoading && !policy) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-policy-detail-page">
        <div className="erp-pro-card rounded-xl p-6">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (policyQuery.isError || !policy) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
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

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-policy-detail-page">
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
              {isNarrow ? undefined : t('hr.leavePolicy.backToList')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {isNarrow ? (
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
                <Tag color="orange">{t('hr.leavePolicy.isProgressive')}</Tag>
              ) : null}
            </div>
            <h1 className="erp-employee-hero-title m-0">{policy.name}</h1>
            {policy.description ? (
              <p className="erp-employee-hero-subtitle m-0 mt-1">
                {policy.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
          <div className="erp-users-stat erp-contract-stat">
            <div className="min-w-0 text-left">
              <p className="erp-users-stat-label">
                {t('hr.leavePolicy.governedBy')}
              </p>
              <p className="erp-users-stat-value truncate text-base">
                {policy.governedBy || '—'}
              </p>
            </div>
          </div>
          <div className="erp-users-stat erp-contract-stat">
            <div className="min-w-0 text-left">
              <p className="erp-users-stat-label">
                {t('hr.leavePolicy.employees')}
              </p>
              <p className="erp-users-stat-value">
                {policy.employeeCount.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="erp-users-stat erp-contract-stat">
            <div className="min-w-0 text-left">
              <p className="erp-users-stat-label">{t('hr.leavePolicy.rules')}</p>
              <p className="erp-users-stat-value">
                {policy.ruleCount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="erp-pro-card">
        {rules.map((rule) => (
          <DetailSection
            key={rule.leaveType}
            title={formatLeaveType(rule.leaveType, t)}
          >
            <div className="erp-employee-meta-grid grid gap-4 sm:grid-cols-2">
              <MetaItem label={t('hr.leavePolicy.baseDays')}>
                {rule.baseDays}
              </MetaItem>
              <MetaItem label={t('hr.leavePolicy.minimumServiceMonths')}>
                {rule.minimumServiceMonths}
              </MetaItem>
              {rule.leaveType === 'ANNUAL' ? (
                <>
                  <MetaItem label={t('hr.leavePolicy.isProgressive')}>
                    {rule.isProgressive ? t('common.yes') : t('common.no')}
                  </MetaItem>
                  <MetaItem label={t('hr.leavePolicy.maxCarryForwardDays')}>
                    {rule.maxCarryForwardDays ?? '—'}
                  </MetaItem>
                  {rule.isProgressive ? (
                    <>
                      <MetaItem label={t('hr.leavePolicy.incrementDays')}>
                        {rule.incrementDays ?? '—'}
                      </MetaItem>
                      <MetaItem
                        label={t('hr.leavePolicy.incrementEveryYears')}
                      >
                        {rule.incrementEveryYears ?? '—'}
                      </MetaItem>
                      <MetaItem label={t('hr.leavePolicy.maxDaysCap')}>
                        {rule.maxDaysCap ?? '—'}
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
          </DetailSection>
        ))}
      </div>
    </div>
  );
}
