'use client';

import { useMemo } from 'react';
import { Alert, Button, Descriptions, Spin } from 'antd';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeavePolicyRule } from '@/lib/api/leave-policy.types';
import { useLeavePolicy } from '@/lib/query/leave-policy';
import { formatLeaveType } from '@/lib/utils/leave-display';

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
 * Read-only leave policy detail with rules breakdown.
 */
export default function LeavePolicyDetailPageContent({
  policyId,
}: LeavePolicyDetailPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const policyQuery = useLeavePolicy(policyId, canViewHr);
  const policy = policyQuery.data;

  const headerExtra = useMemo(() => {
    if (!policy) {
      return null;
    }
    return (
      <Button
        type="primary"
        icon={<Pencil size={14} />}
        onClick={() => router.push(`/hr/leave-policy/${policy.id}/edit`)}
        style={{ borderRadius: 2 }}
      >
        {t('common.update')}
      </Button>
    );
  }, [policy, router, t]);

  useSetHeaderExtra(headerExtra);

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
      />
    );
  }

  const rules = sortRules(policy.rules);

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <FormLayout variant="pro" dense title={t('hr.leavePolicy.detail')}>
        <Descriptions
          column={{ xs: 1, sm: 2 }}
          size="small"
          items={[
            {
              key: 'name',
              label: t('hr.leavePolicy.name'),
              children: policy.name,
            },
            {
              key: 'status',
              label: t('common.status'),
              children: (
                <StatusBadge
                  label={
                    policy.isActive ? t('common.active') : t('common.inactive')
                  }
                  variant={policy.isActive ? 'success' : 'default'}
                />
              ),
            },
            {
              key: 'governedBy',
              label: t('hr.leavePolicy.governedBy'),
              children: policy.governedBy || '—',
            },
            {
              key: 'employees',
              label: t('hr.leavePolicy.employees'),
              children: policy.employeeCount,
            },
            {
              key: 'description',
              label: t('hr.leavePolicy.description'),
              span: 2,
              children: policy.description || '—',
            },
          ]}
        />
      </FormLayout>

      {rules.map((rule) => (
        <FormLayout
          key={rule.leaveType}
          variant="pro"
          dense
          title={formatLeaveType(rule.leaveType, t)}
        >
          <Descriptions
            column={{ xs: 1, sm: 2 }}
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
        </FormLayout>
      ))}
    </div>
  );
}
