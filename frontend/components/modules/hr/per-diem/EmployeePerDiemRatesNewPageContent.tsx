'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useMemo, useState } from 'react';
import { Alert, Empty, Select } from 'antd';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useUsersDirectory } from '@/lib/query/users';
import { formatUserName } from '@/lib/utils/user-display';

const LIST_PATH = '/hr/employee-per-diem-rates';

/**
 * Configure rates for an employee - shared HR form banner + selector.
 */
export default function EmployeePerDiemRatesNewPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();

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
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page ${DETAIL_PAGE_V2}`}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-employee-per-diem-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.employeePerDiemRates.addRates')}
        description={t('pages.hr.employeePerDiemRates.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref={LIST_PATH}
        backLabel={t('hr.buttons.backToList')}
      >
        <FormLayout variant="pro" dense>
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
      </HrFormPageShell>
    </div>
  );
}
