'use client';

import { useState } from 'react';
import { Alert, Button, Descriptions, Space, Spin } from 'antd';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeavePolicyRule } from '@/lib/api/leave-policy.types';
import {
  useDeleteLeavePolicy,
  useLeavePolicy,
} from '@/lib/query/leave-policy';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

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

interface LeavePolicyDetailPageContentProps {
  policyId: string;
}

/**
 * Read-only leave policy detail — chrome aligned with employee detail.
 */
export default function LeavePolicyDetailPageContent({
  policyId,
}: LeavePolicyDetailPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
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
      router.push('/hr/leave-policy');
    } catch (error: unknown) {
      notifyApiError(error, t('hr.leavePolicy.deleteBlocked'), messageApi);
    }
  }

  if (!canViewHr) {
    return (
      <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
    );
  }

  if (policyQuery.isLoading && !policy) {
    return (
      <div className="flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (policyQuery.isError || !policy) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          policyQuery.error instanceof ApiRequestError
            ? policyQuery.error.message
            : t('hr.leavePolicy.loadError')
        }
        action={
          <Button onClick={() => router.push('/hr/leave-policy')}>
            {t('hr.leavePolicy.backToList')}
          </Button>
        }
      />
    );
  }

  const rules = sortRules(policy.rules);

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/leave-policy')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.leavePolicy.backToList')}
        </Button>
        <Space wrap className="ml-auto" size={8}>
          <Button
            type="primary"
            icon={<Pencil size={14} />}
            onClick={() => router.push(`/hr/leave-policy/${policy.id}/edit`)}
            style={{ borderRadius: 0 }}
          >
            {t('common.update')}
          </Button>
          <Button
            danger
            icon={<Trash2 size={14} />}
            onClick={() => setConfirmDelete(true)}
            style={{ borderRadius: 0 }}
          >
            {t('common.delete')}
          </Button>
        </Space>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge
            label={
              policy.isActive ? t('common.active') : t('common.inactive')
            }
            variant={policy.isActive ? 'success' : 'default'}
          />
        </div>
        <h1
          className="m-0 text-lg font-semibold"
          style={{ color: tokens.colorTextPrimary }}
        >
          {policy.name}
        </h1>
        {policy.description ? (
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {policy.description}
          </p>
        ) : null}
        <div className="mt-4">
          <SummaryStrip
            items={[
              {
                label: t('hr.leavePolicy.governedBy'),
                value: policy.governedBy || '—',
              },
              {
                label: t('hr.leavePolicy.employees'),
                value: policy.employeeCount,
              },
              {
                label: t('hr.leavePolicy.rules'),
                value: policy.ruleCount,
              },
            ]}
          />
        </div>
      </div>

      {rules.map((rule) => (
        <SectionCard
          key={rule.leaveType}
          title={formatLeaveType(rule.leaveType, t)}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <Descriptions
            column={{ xs: 1, sm: 1, md: 2 }}
            size="small"
            items={[
              {
                key: 'baseDays',
                label: t('hr.leavePolicy.baseDays'),
                children: rule.baseDays,
              },
              {
                key: 'minimumServiceMonths',
                label: t('hr.leavePolicy.minimumServiceMonths'),
                children: rule.minimumServiceMonths,
              },
              ...(rule.leaveType === 'ANNUAL'
                ? [
                    {
                      key: 'isProgressive',
                      label: t('hr.leavePolicy.isProgressive'),
                      children: rule.isProgressive
                        ? t('common.yes')
                        : t('common.no'),
                    },
                    {
                      key: 'maxCarryForwardDays',
                      label: t('hr.leavePolicy.maxCarryForwardDays'),
                      children: rule.maxCarryForwardDays ?? '—',
                    },
                    ...(rule.isProgressive
                      ? [
                          {
                            key: 'incrementDays',
                            label: t('hr.leavePolicy.incrementDays'),
                            children: rule.incrementDays ?? '—',
                          },
                          {
                            key: 'incrementEveryYears',
                            label: t('hr.leavePolicy.incrementEveryYears'),
                            children: rule.incrementEveryYears ?? '—',
                          },
                          {
                            key: 'maxDaysCap',
                            label: t('hr.leavePolicy.maxDaysCap'),
                            children: rule.maxDaysCap ?? '—',
                          },
                        ]
                      : []),
                  ]
                : []),
              ...(rule.leaveType === 'SICK'
                ? [
                    {
                      key: 'requiresReceipt',
                      label: t('hr.leavePolicy.requiresReceipt'),
                      children: rule.requiresReceipt
                        ? t('common.yes')
                        : t('common.no'),
                    },
                  ]
                : []),
            ]}
          />
        </SectionCard>
      ))}
    </div>
  );
}
