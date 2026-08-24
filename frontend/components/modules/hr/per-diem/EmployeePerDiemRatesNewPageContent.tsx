'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Empty, Select } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useUsersDirectory } from '@/lib/query/users';
import type { User } from '@/lib/api/types';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

export default function EmployeePerDiemRatesNewPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();

  const { data: users, isLoading, isError } = useUsersDirectory(
    { page: 1, limit: 100, sortBy: 'lastName', sortOrder: 'asc' },
    { enabled: canManagePerDiemRates },
  );

  const [employeeId, setEmployeeId] = useState<string>('');

  const selectedEmployee = useMemo(() => {
    if (!employeeId) return null;
    return users?.find((u) => u.id === employeeId) ?? null;
  }, [employeeId, users]);

  if (!canManagePerDiemRates) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex items-center gap-3 mb-1">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/employee-per-diem-rates')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.backToList')}
        </Button>
      </div>

      <div
        className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px]">
            <p
              className="m-0 mb-1 text-xs font-medium uppercase tracking-wide"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('hr.validation.selectEmployee')}
            </p>
            <Select
              showSearch
              placeholder={t('hr.validation.selectEmployee')}
              value={employeeId || undefined}
              onChange={(v) => setEmployeeId(v)}
              options={(users ?? []).map((u: User) => ({
                value: u.id,
                label: formatUserName(u),
              }))}
              loading={isLoading}
              disabled={isLoading || isError}
              filterOption={(input, option) => {
                const label = String(option?.label ?? '');
                return label.toLowerCase().includes(input.toLowerCase());
              }}
            />
          </div>

          {selectedEmployee ? (
            <div className="min-w-[220px]">
              <p className="m-0 text-xs font-medium uppercase tracking-wide" style={{ color: tokens.colorTextTertiary }}>
                {t('hr.table.employee')}
              </p>
              <p className="m-0 text-sm font-semibold" style={{ color: tokens.colorTextPrimary }}>
                {formatUserName(selectedEmployee)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {employeeId ? (
        <EmployeePerDiemRatesSection employeeId={employeeId} editable embedded={false} />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('hr.validation.selectEmployee')}
        />
      )}
    </div>
  );
}

