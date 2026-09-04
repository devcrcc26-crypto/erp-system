'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Empty, Grid, Select } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useUsersDirectory } from '@/lib/query/users';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Configure rates for an employee — form chrome aligned with Add Employee.
 */
export default function EmployeePerDiemRatesNewPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();

  useSetHeaderExtra(null);

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100, sortBy: 'lastName', sortOrder: 'asc' },
    { enabled: canManagePerDiemRates },
  );
  const users = usersQuery.data?.data ?? [];

  const [employeeId, setEmployeeId] = useState<string>('');

  const selectedEmployee = useMemo(() => {
    if (!employeeId) {
      return null;
    }
    return users.find((u) => u.id === employeeId) ?? null;
  }, [employeeId, users]);

  if (!canManagePerDiemRates) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-employee-per-diem-form-page">
      <div className="erp-employee-per-diem-form-actions flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/employee-per-diem-rates')}
          aria-label={t('hr.buttons.backToList')}
          className="sm:!me-auto"
        >
          {isNarrow ? undefined : t('hr.buttons.back')}
        </Button>
        <Button
          onClick={() => router.push('/hr/employee-per-diem-rates')}
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>

      <FormLayout
        variant="pro"
        dense
        title={t('pages.hr.employeePerDiemRates.addRates')}
        description={t('pages.hr.employeePerDiemRates.formDescription')}
      >
        <div className="flex flex-col gap-2">
          <label className="erp-users-stat-label m-0">
            {t('hr.validation.selectEmployee')}
          </label>
          <Select
            showSearch
            placeholder={t('hr.validation.selectEmployee')}
            value={employeeId || undefined}
            onChange={(value) => setEmployeeId(value)}
            options={users.map((u) => ({
              value: u.id,
              label: formatUserName(u),
            }))}
            loading={usersQuery.isLoading}
            disabled={usersQuery.isLoading || usersQuery.isError}
            filterOption={(input, option) => {
              const label = String(option?.label ?? '');
              return label.toLowerCase().includes(input.toLowerCase());
            }}
            className="w-full max-w-md"
          />
          {selectedEmployee?.email ? (
            <p className="erp-users-email m-0">{selectedEmployee.email}</p>
          ) : null}
        </div>
      </FormLayout>

      {employeeId ? (
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <EmployeePerDiemRatesSection
              employeeId={employeeId}
              editable
              embedded={false}
            />
          </div>
        </div>
      ) : (
        <div className="erp-pro-card p-8">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('hr.validation.selectEmployee')}
          />
        </div>
      )}
    </div>
  );
}
